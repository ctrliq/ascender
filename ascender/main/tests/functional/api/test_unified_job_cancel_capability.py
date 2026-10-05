"""
The cancel capability of a page of unified jobs, answered once for the page.

The jobs lists report, for every row, whether the reader may cancel it. For
anyone but a superuser that used to be a role question per running row; now
UnifiedJobAccess.get_cancel_capabilities answers the page in bulk, and these
tests hold it to giving exactly the answers the per row path gives.
"""

import pytest

from django.db import connection
from django.test.utils import CaptureQueriesContext

from ascender.api.versioning import reverse
from ascender.main.access import UnifiedJobAccess, get_user_capabilities
from ascender.main.models import AdHocCommand, InventoryUpdate, Job, JobTemplate, ProjectUpdate, UnifiedJob, User


def per_row_cancel(user, pk):
    """
    The cancel capability the per row path gives, on a freshly read job.

    Args:
        user: The user asking.
        pk: The unified job's primary key.

    Returns:
        bool: What get_user_capabilities answers for 'cancel'.
    """
    return get_user_capabilities(user, UnifiedJob.objects.get(pk=pk), method_list=['cancel'])['cancel']


@pytest.fixture
def cancel_world(
    admin,
    user,
    alice,
    rando,
    organization,
    project,
    inventory,
    inventory_source,
    jt_linked,
    job_factory,
    ad_hoc_command_factory,
    workflow_job_factory,
    system_job_factory,
):
    """
    Users in every relation to what the jobs ran, and jobs of every kind.

    The users are a superuser, an admin of the job template, of the project
    and of the inventory, the user who launched the runs, a user who may only
    execute the template, an organization job template admin and an unrelated
    user. The jobs are running, pending and finished playbook runs, runs whose
    template was deleted with and without an organization, and running project
    updates, inventory updates, ad hoc commands (one whose inventory is gone),
    workflow jobs and system jobs.

    Args:
        admin: A superuser, the default launcher of the runs.
        user: Factory for users.
        alice: The user who launches some of the runs.
        rando: A user with no relation to anything.
        organization: The organization everything belongs to.
        project: The project the job template and the project updates use.
        inventory: The inventory the template, source and commands use.
        inventory_source: The source the inventory updates run.
        jt_linked: The job template the playbook runs come from.
        job_factory: Factory for jobs of jt_linked.
        ad_hoc_command_factory: Factory for ad hoc commands.
        workflow_job_factory: Factory for workflow jobs.
        system_job_factory: Factory for system jobs.

    Returns:
        dict: 'users' maps a role name to its user, 'jobs' maps a name to its
            unified job.
    """
    users = {
        'superuser': admin,
        'template_admin': user('cancel-template-admin', False),
        'project_admin': user('cancel-project-admin', False),
        'inventory_admin': user('cancel-inventory-admin', False),
        'creator': alice,
        'executor': user('cancel-executor', False),
        'org_template_admin': user('cancel-org-template-admin', False),
        'unrelated': rando,
    }
    jt_linked.admin_role.members.add(users['template_admin'])
    jt_linked.execute_role.members.add(users['creator'], users['executor'])
    project.admin_role.members.add(users['project_admin'])
    inventory.admin_role.members.add(users['inventory_admin'])
    organization.job_template_admin_role.members.add(users['org_template_admin'])

    def orphan(job, org):
        # A deleted template leaves its jobs with neither template reference.
        Job.objects.filter(pk=job.pk).update(job_template=None, unified_job_template=None, organization=org)
        return job

    jobs = {
        'job_running_by_creator': job_factory(created_by=users['creator'], initial_state='running'),
        'job_running_by_admin': job_factory(initial_state='running'),
        'job_pending_by_admin': job_factory(initial_state='pending'),
        'job_finished': job_factory(created_by=users['creator'], initial_state='successful'),
        'job_orphaned_in_org': orphan(job_factory(initial_state='running'), organization),
        'job_orphaned_no_org': orphan(job_factory(initial_state='running'), None),
        'project_update_by_admin': ProjectUpdate.objects.create(name='pu', project=project, status='running', created_by=admin),
        'project_update_by_creator': ProjectUpdate.objects.create(name='pu', project=project, status='running', created_by=users['creator']),
        'inventory_update_by_admin': InventoryUpdate.objects.create(inventory_source=inventory_source, source='ec2', status='running', created_by=admin),
        'ad_hoc_by_admin': ad_hoc_command_factory(initial_state='running'),
        'ad_hoc_by_creator': ad_hoc_command_factory(initial_state='running', created_by=users['creator']),
        'ad_hoc_no_inventory': ad_hoc_command_factory(initial_state='running'),
        'workflow_job': workflow_job_factory(initial_state='running'),
        'system_job': system_job_factory(initial_state='running'),
    }
    AdHocCommand.objects.filter(pk=jobs['ad_hoc_no_inventory'].pk).update(inventory=None)
    return {'users': users, 'jobs': jobs}


@pytest.mark.django_db
class TestCancelCapabilityMatchesPerRow:
    """
    Every cancel answer the page gives is the one the job would get alone.
    """

    @pytest.mark.parametrize('url_name', ['api:unified_job_list', 'api:job_list'])
    def test_list_matches_the_per_row_check(self, cancel_world, get, url_name):
        """
        Each row of the jobs lists carries the per row cancel answer.

        Args:
            cancel_world: Users and jobs in every relation and state.
            get: Fixture issuing GET requests against the API.
            url_name: The list read, the polymorphic one or the playbook runs.
        """
        seen = set()
        for name, fixture_user in cancel_world['users'].items():
            reader = User.objects.get(pk=fixture_user.pk)
            rows = get(reverse(url_name) + '?page_size=200', user=reader, expect=200).data['results']
            for row in rows:
                answer = row['summary_fields']['user_capabilities']['cancel']
                assert answer == per_row_cancel(reader, row['id']), (name, row['id'], row['type'])
                seen.add(answer)
        # The comparison only proves something when both answers occur.
        assert seen == {True, False}

    @pytest.mark.parametrize('scopes', [None, ['read'], ['read', 'write']], ids=['session', 'read-token', 'write-token'])
    def test_batched_answers_match_the_per_row_checks(self, cancel_world, scopes):
        """
        The access class's page answers equal its per job checks.

        Unlike the lists, this covers the jobs a user cannot see as well, and
        tokens, which may not cancel without write scope.

        Args:
            cancel_world: Users and jobs in every relation and state.
            scopes: The token scopes set on the user, or None for a session.
        """
        jobs = list(UnifiedJob.objects.filter(pk__in=[job.pk for job in cancel_world['jobs'].values()]))
        assert len(jobs) == len(cancel_world['jobs'])
        batched_kinds = {'system_job'}
        for name, fixture_user in cancel_world['users'].items():
            reader = User.objects.get(pk=fixture_user.pk)
            if scopes is not None:
                reader.oauth_scopes = scopes
            answers = UnifiedJobAccess(reader).get_cancel_capabilities(jobs)
            for pk, answer in answers.items():
                assert answer == per_row_cancel(reader, pk), (name, pk)

            # A write-capable non-superuser has every job but the system job
            # answered in bulk, which is what keeps the list's queries flat.
            if name != 'superuser' and scopes != ['read']:
                expected = {job.pk for key, job in cancel_world['jobs'].items() if key not in batched_kinds}
                assert set(answers) == expected, name

        # Spot checks that each branch of the can_cancel methods is reached.
        spots = {
            'creator': {'job_running_by_creator': True, 'project_update_by_creator': True, 'job_running_by_admin': False, 'job_finished': False},
            'template_admin': {'job_running_by_admin': True, 'job_orphaned_in_org': False, 'project_update_by_admin': False},
            'org_template_admin': {'job_orphaned_in_org': True, 'job_orphaned_no_org': False, 'job_running_by_admin': True},
            'project_admin': {'project_update_by_admin': True, 'job_running_by_admin': False},
            'inventory_admin': {'inventory_update_by_admin': True, 'ad_hoc_by_admin': True, 'ad_hoc_no_inventory': False},
            'executor': {'job_running_by_admin': False, 'ad_hoc_by_admin': False},
        }
        if scopes != ['read']:
            for name, expected in spots.items():
                reader = User.objects.get(pk=cancel_world['users'][name].pk)
                for key, answer in expected.items():
                    assert per_row_cancel(reader, cancel_world['jobs'][key].pk) is answer, (name, key)


@pytest.mark.django_db
class TestCancelCapabilityQueries:
    """
    Running rows cost a non-superuser no more queries than finished ones.

    The start and delete capabilities still ask a role question for every row,
    so the page is not flat as a whole. What cancel adds is isolated by
    comparing the growth of a page of running jobs with that of a page of
    finished ones, for which cancel is answered without a query.
    """

    @staticmethod
    def count_queries(get, url, reader):
        """
        Read a list and count the queries it took.

        Args:
            get: Fixture issuing GET requests against the API.
            url: The list read.
            reader: The user reading it.

        Returns:
            int: The number of queries the request ran.
        """
        with CaptureQueriesContext(connection) as ctx:
            get(url, user=reader, expect=200)
        return len(ctx.captured_queries)

    def growth(self, get, url, reader, make_job):
        """
        How many queries three more jobs add to a page that holds one.

        Args:
            get: Fixture issuing GET requests against the API.
            url: The list read.
            reader: The user reading it.
            make_job: Callable creating one job of the kind measured.

        Returns:
            int: Queries with four jobs minus queries with one.
        """
        make_job()
        # The first request caches the reader's system auditor lookup, so it
        # is read once before counting.
        self.count_queries(get, url, reader)
        one = self.count_queries(get, url, reader)
        for _ in range(3):
            make_job()
        assert get(url, user=reader, expect=200).data['count'] == 4
        return self.count_queries(get, url, reader) - one

    @pytest.mark.parametrize('url_name', ['api:unified_job_list', 'api:job_list'])
    def test_running_rows_cost_what_finished_rows_cost(self, get, user, organization, project, inventory, admin, url_name):
        """
        Three more running jobs cost a template admin what three finished do.

        Args:
            get: Fixture issuing GET requests against the API.
            user: Factory for users.
            organization: The organization the templates belong to.
            project: The project the templates use.
            inventory: The inventory the templates use.
            admin: A superuser, who launches every job.
            url_name: The list read, the polymorphic one or the playbook runs.
        """
        growth = {}
        for state in ('successful', 'running'):
            # A template of its own per state, and the page filtered to it.
            template = JobTemplate.objects.create(
                name='cancel-queries-' + state, project=project, inventory=inventory, playbook='helloworld.yml', organization=organization
            )
            url = reverse(url_name) + '?unified_job_template={}'.format(template.pk)
            reader = user('cancel-queries-' + state, False)
            template.admin_role.members.add(reader)

            def make_job(template=template, state=state):
                return template.create_unified_job(_eager_fields={'status': state, 'created_by': admin})

            growth[state] = self.growth(get, url, reader, make_job)
        assert growth['running'] == growth['successful']
