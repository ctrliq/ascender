from unittest import mock

import pytest

from django.db import connection
from django.http import QueryDict
from django.test.utils import CaptureQueriesContext

from ascender.api.versioning import reverse
from ascender.api.views.workflow import _approval_vote_comment
from ascender.main.access import WorkflowApprovalAccess, WorkflowJobAccess, get_user_capabilities
from ascender.main.models import User, WorkflowJob, WorkflowJobNode, WorkflowJobTemplate, WorkflowApproval, WorkflowApprovalVote
from ascender.main.scheduler import TaskManager, DependencyManager, WorkflowManager


def run_managers():
    """Move every launched workflow along until its approval node is waiting."""
    DependencyManager().schedule()
    TaskManager().schedule()
    WorkflowManager().schedule()


@pytest.fixture
def spawn_approval(post, admin_user, job_template, controlplane_instance_group):
    """Create a WFJT with a single approval node, launch it and hand back the
    pending WorkflowApproval along with its WFJT."""

    def r(**approval_kwargs):
        wfjt = WorkflowJobTemplate.objects.create(name='wfjt-approval-quorum')
        node = wfjt.workflow_nodes.create(unified_job_template=job_template)
        url = reverse('api:workflow_job_template_node_create_approval', kwargs={'pk': node.pk, 'version': 'v2'})
        payload = {'name': 'Quorum Test', 'description': '', 'timeout': 0}
        payload.update(approval_kwargs)
        post(url, payload, user=admin_user, expect=201)
        post(reverse('api:workflow_job_template_launch', kwargs={'pk': wfjt.pk}), user=admin_user, expect=201)
        wf_job = WorkflowJob.objects.order_by('-id').first()
        run_managers()
        approval = wf_job.workflow_nodes.first().job
        return wfjt, WorkflowApproval.objects.get(pk=approval.pk)

    return r


@pytest.fixture
def approver():
    def r(wfjt, user):
        wfjt.approval_role.members.add(user)
        return user

    return r


@pytest.mark.django_db
class TestApprovalQuorum:
    def test_template_fields_copied_to_approval(self, spawn_approval):
        wfjt, approval = spawn_approval(required_approvals=2, on_timeout='approve')
        assert approval.required_approvals == 2
        assert approval.on_timeout == 'approve'
        assert approval.workflow_approval_template.required_approvals == 2
        assert approval.workflow_approval_template.on_timeout == 'approve'

    def test_single_approval_keeps_pending_until_quorum(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'pending'
        assert approval.approvals_received() == 1

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approvals_received() == 2
        assert approval.approved_or_denied_by == bob

    def test_user_cannot_vote_twice(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=400)
        post(reverse('api:workflow_approval_deny', kwargs={'pk': approval.pk}), user=alice, expect=400)
        approval.refresh_from_db()
        assert approval.status == 'pending'
        assert approval.votes.count() == 1

    def test_single_deny_vetoes(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=3)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        post(reverse('api:workflow_approval_deny', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'failed'
        assert approval.approved_or_denied_by == bob

    def test_vote_comment_recorded(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), {'comment': 'plan looks fine'}, user=alice, expect=204)
        vote = approval.votes.get()
        assert vote.vote == 'approve'
        assert vote.comment == 'plan looks fine'
        assert vote.user == alice
        assert vote.user_name == alice.username
        assert vote.workflow_approval_name == approval.name
        assert vote.workflow_job_id == approval.workflow_job.id

    def test_vote_comment_read_from_querydict(self):
        # form-encoded bodies reach the view as a QueryDict, not a plain dict
        fake_request = mock.Mock(data=QueryDict('comment=sent+as+a+form'))
        assert _approval_vote_comment(fake_request) == 'sent as a form'
        fake_request = mock.Mock(data=QueryDict(''))
        assert _approval_vote_comment(fake_request) == ''

    def test_quorum_survives_approver_deletion(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        alice.delete()
        approval.refresh_from_db()
        assert approval.approvals_received() == 1

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approvals_received() == 2

    def test_default_behavior_unchanged(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approved_or_denied_by == alice

    def test_approval_detail_exposes_quorum_state(self, spawn_approval, approver, get, post, alice, admin_user):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        resp = get(reverse('api:workflow_approval_detail', kwargs={'pk': approval.pk}), user=admin_user, expect=200)
        assert resp.data['required_approvals'] == 2
        assert resp.data['approvals_received'] == 1
        assert resp.data['on_timeout'] == 'deny'
        assert resp.data['related']['votes'].endswith('/votes/')


@pytest.mark.django_db
class TestApprovalOnTimeout:
    def test_timeout_denies_by_default(self, spawn_approval):
        wfjt, approval = spawn_approval(timeout=1)
        TaskManager().timeout_approval_node(approval)
        approval.refresh_from_db()
        assert approval.status == 'failed'
        assert approval.timed_out is True

    def test_timeout_auto_approves_when_configured(self, spawn_approval):
        wfjt, approval = spawn_approval(timeout=1, on_timeout='approve')
        TaskManager().timeout_approval_node(approval)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.timed_out is True
        assert 'automatically approved' in approval.job_explanation


@pytest.mark.django_db
class TestApprovalVoteAudit:
    def test_votes_survive_approval_and_user_deletion(self, spawn_approval, approver, post, alice, admin_user):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        approval_name = approval.name
        workflow_job_id = approval.workflow_job.id
        approval.delete()
        alice_username = alice.username
        alice.delete()

        vote = WorkflowApprovalVote.objects.get()
        assert vote.workflow_approval is None
        assert vote.user is None
        assert vote.vote == 'approve'
        assert vote.workflow_approval_name == approval_name
        assert vote.workflow_job_id == workflow_job_id
        assert vote.user_name == alice_username

    def test_vote_list_endpoints(self, spawn_approval, approver, get, post, alice, admin_user):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        resp = get(reverse('api:workflow_approval_votes_list', kwargs={'pk': approval.pk}), user=admin_user, expect=200)
        assert resp.data['count'] == 1
        assert resp.data['results'][0]['vote'] == 'approve'
        assert resp.data['results'][0]['summary_fields']['user']['username'] == alice.username

        resp = get(reverse('api:workflow_approval_vote_list') + '?user__username=%s' % alice.username, user=admin_user, expect=200)
        assert resp.data['count'] == 1
        resp = get(reverse('api:workflow_approval_vote_list') + '?vote=deny', user=admin_user, expect=200)
        assert resp.data['count'] == 0

    def test_votes_hidden_from_unrelated_users(self, spawn_approval, approver, get, post, alice, rando):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        vote = WorkflowApprovalVote.objects.get()

        resp = get(reverse('api:workflow_approval_vote_list'), user=rando, expect=200)
        assert resp.data['count'] == 0
        get(reverse('api:workflow_approval_vote_detail', kwargs={'pk': vote.pk}), user=rando, expect=403)

        # a user who can see the workflow sees the votes
        wfjt.read_role.members.add(rando)
        resp = get(reverse('api:workflow_approval_vote_list'), user=rando, expect=200)
        assert resp.data['count'] == 1
        get(reverse('api:workflow_approval_vote_detail', kwargs={'pk': vote.pk}), user=rando, expect=200)


@pytest.mark.django_db
class TestApprovalCancelWorkflow:
    """
    Canceling the workflow an approval waits in is a right on the workflow
    job, not the approver role, so an approver may vote without being offered
    the cancel.
    """

    def test_approver_is_not_offered_the_cancel(self, spawn_approval, approver, get, alice, admin_user):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)
        url = reverse('api:workflow_approval_detail', kwargs={'pk': approval.pk})

        as_alice = get(url, user=alice, expect=200).data
        assert as_alice['can_approve_or_deny']
        assert not as_alice['can_cancel_workflow']

        assert get(url, user=admin_user, expect=200).data['can_cancel_workflow']

    def test_workflow_admin_is_offered_the_cancel_in_the_list(self, spawn_approval, get, bob):
        wfjt, approval = spawn_approval()
        wfjt.admin_role.members.add(bob)
        results = get(reverse('api:workflow_approval_list'), user=bob, expect=200).data['results']
        row = [r for r in results if r['id'] == approval.pk][0]
        assert row['can_cancel_workflow']

    def test_approval_does_not_report_a_cancel_capability(self, spawn_approval, get, admin_user):
        """
        An approval has no cancel endpoint, so neither its detail nor its list
        row reports a cancel capability, even to a user who may cancel the
        workflow it waits in.

        Args:
            spawn_approval: Fixture launching a workflow with a pending approval.
            get: Fixture issuing GET requests against the API.
            admin_user: A superuser, who holds every capability there is.
        """
        wfjt, approval = spawn_approval()
        detail = get(reverse('api:workflow_approval_detail', kwargs={'pk': approval.pk}), user=admin_user, expect=200).data
        assert 'cancel' not in detail['summary_fields']['user_capabilities']
        assert detail['summary_fields']['user_capabilities']['delete'] is not None
        assert detail['can_cancel_workflow']

        results = get(reverse('api:workflow_approval_list'), user=admin_user, expect=200).data['results']
        row = [r for r in results if r['id'] == approval.pk][0]
        assert 'cancel' not in row['summary_fields']['user_capabilities']


@pytest.mark.django_db
class TestApprovalListQueries:
    """
    The approvals list reads the workflow job each row waits in, to say whether
    the reader may cancel it. That has to come with the page rather than one
    row at a time, or the list costs more queries the more approvals it holds.
    """

    @staticmethod
    def count_list_queries(get, user, table=None):
        """
        Read the approvals list and count the queries it took.

        Args:
            get: Fixture issuing GET requests against the API.
            user: The user reading the list.
            table: When given, only the queries reading from this table count.

        Returns:
            int: The number of queries the request ran.
        """
        with CaptureQueriesContext(connection) as ctx:
            get(reverse('api:workflow_approval_list'), user=user, expect=200)
        if table is None:
            return len(ctx.captured_queries)
        return len([q for q in ctx.captured_queries if 'FROM "{}"'.format(table) in q['sql']])

    @staticmethod
    def launch_again(post, wfjt, user):
        """
        Launch the workflow once more and hand back the approval it waits on.

        Args:
            post: Fixture issuing POST requests against the API.
            wfjt: The workflow job template holding the approval node.
            user: The user launching it.

        Returns:
            WorkflowApproval: The pending approval the new workflow job spawned.
        """
        post(reverse('api:workflow_job_template_launch', kwargs={'pk': wfjt.pk}), user=user, expect=201)
        run_managers()
        return WorkflowApproval.objects.order_by('-id').first()

    @pytest.mark.parametrize('finished', [False, True], ids=['pending', 'finished'])
    def test_query_count_does_not_grow_with_the_approvals(self, spawn_approval, post, get, admin_user, finished):
        """
        Three more approvals on the page cost no more queries than one.

        Args:
            spawn_approval: Fixture launching a workflow with a pending approval.
            post: Fixture issuing POST requests against the API.
            get: Fixture issuing GET requests against the API.
            admin_user: A superuser, who sees every approval.
            finished: Whether the approvals are denied before the list is read.
        """
        wfjt, first = spawn_approval()
        wfjt.allow_simultaneous = True
        wfjt.save(update_fields=['allow_simultaneous'])

        def add_approval(approval=None):
            # Every further approval comes from launching the same workflow again.
            if approval is None:
                approval = self.launch_again(post, wfjt, admin_user)
            if finished:
                post(reverse('api:workflow_approval_deny', kwargs={'pk': approval.pk}), user=admin_user, expect=204)

        add_approval(first)
        baseline = self.count_list_queries(get, admin_user)
        for _ in range(3):
            add_approval()
        assert WorkflowApproval.objects.count() == 4
        assert self.count_list_queries(get, admin_user) == baseline


# ----------------------------------------------------------------------------
# Page-level permission answers
# ----------------------------------------------------------------------------


@pytest.fixture
def approval_world(post, admin_user, user, organization, job_template, controlplane_instance_group, system_auditor, rando):
    """
    Users in every relation to a workflow and approvals in every state.

    The users are a superuser, an organization admin, an organization workflow
    admin, an admin of the workflow template, an approver, a user who may only
    execute it, the user who launched the runs, an unrelated user and a system
    auditor. The approvals sit in a workflow of the organization, in one with
    no organization, in one whose template was deleted, and in one whose
    workflow job was deleted, and are pending, approved, denied or timed out.

    Args:
        post: Fixture issuing POST requests against the API.
        admin_user: A superuser, who builds the workflows and decides approvals.
        user: Factory for users.
        organization: The organization the main workflow belongs to.
        job_template: The job template each workflow runs after its approval.
        controlplane_instance_group: Lets the task manager place the jobs.
        system_auditor: A system auditor.
        rando: A user with no relation to anything.

    Returns:
        dict: 'users' maps a role name to its user, 'approvals' maps a state
            name to its approval.
    """
    users = {
        'superuser': admin_user,
        'org_admin': user('matrix-org-admin', False),
        'org_workflow_admin': user('matrix-org-workflow-admin', False),
        'workflow_admin': user('matrix-workflow-admin', False),
        'approver': user('matrix-approver', False),
        'executor': user('matrix-executor', False),
        'creator': user('matrix-creator', False),
        'unrelated': rando,
        'auditor': system_auditor,
    }
    organization.admin_role.members.add(users['org_admin'])
    organization.workflow_admin_role.members.add(users['org_workflow_admin'])

    def make_workflow(name, org):
        # One approval node, then the job template, with every template role
        # handed to the user named after it.
        wfjt = WorkflowJobTemplate.objects.create(name=name, organization=org, allow_simultaneous=True)
        node = wfjt.workflow_nodes.create(unified_job_template=job_template)
        url = reverse('api:workflow_job_template_node_create_approval', kwargs={'pk': node.pk, 'version': 'v2'})
        post(url, {'name': name + '-approval', 'description': '', 'timeout': 0}, user=admin_user, expect=201)
        wfjt.admin_role.members.add(users['workflow_admin'])
        wfjt.approval_role.members.add(users['approver'])
        wfjt.execute_role.members.add(users['executor'], users['creator'])
        return wfjt

    def launch(wfjt, by):
        post(reverse('api:workflow_job_template_launch', kwargs={'pk': wfjt.pk}), user=by, expect=201)
        # The test client does not record who launched, which is what
        # can_cancel checks first, so the launcher is set here.
        WorkflowJob.objects.filter(pk=WorkflowJob.objects.order_by('-id').first().pk).update(created_by=by)
        run_managers()
        return WorkflowApproval.objects.order_by('-id').first()

    in_org = make_workflow('matrix-in-org', organization)
    no_org = make_workflow('matrix-no-org', None)
    doomed_template = make_workflow('matrix-doomed-template', organization)
    doomed_job = make_workflow('matrix-doomed-job', organization)

    approvals = {
        'pending_by_creator': launch(in_org, users['creator']),
        'pending_by_admin': launch(in_org, admin_user),
        'approved': launch(in_org, users['creator']),
        'denied': launch(in_org, admin_user),
        'timed_out': launch(in_org, users['creator']),
        'pending_no_org': launch(no_org, users['creator']),
        'approved_no_org': launch(no_org, admin_user),
        'orphaned_template': launch(doomed_template, users['creator']),
        'orphaned_job': launch(doomed_job, users['creator']),
    }
    post(reverse('api:workflow_approval_approve', kwargs={'pk': approvals['approved'].pk}), user=admin_user, expect=204)
    post(reverse('api:workflow_approval_approve', kwargs={'pk': approvals['approved_no_org'].pk}), user=admin_user, expect=204)
    post(reverse('api:workflow_approval_deny', kwargs={'pk': approvals['denied'].pk}), user=admin_user, expect=204)
    TaskManager().timeout_approval_node(approvals['timed_out'])
    run_managers()

    # A deleted template leaves its workflow job with no template at all, a
    # deleted workflow job takes its nodes along and leaves the approval with
    # no node.
    doomed_template.delete()
    approvals['orphaned_job'].unified_job_node.workflow_job.delete()
    for approval in approvals.values():
        approval.refresh_from_db()
    orphan = approvals['orphaned_template'].unified_job_node.workflow_job
    assert orphan.unified_job_template_id is None and orphan.workflow_job_template_id is None
    assert not WorkflowJobNode.objects.filter(job=approvals['orphaned_job']).exists()
    assert {name: a.status for name, a in approvals.items()} == {
        'pending_by_creator': 'pending',
        'pending_by_admin': 'pending',
        'approved': 'successful',
        'denied': 'failed',
        'timed_out': 'failed',
        'pending_no_org': 'pending',
        'approved_no_org': 'successful',
        'orphaned_template': 'failed',
        'orphaned_job': 'pending',
    }
    assert approvals['timed_out'].timed_out is True
    assert WorkflowJob.objects.get(workflow_job_nodes__job=approvals['orphaned_template']).created_by == users['creator']
    return {'users': users, 'approvals': approvals}


@pytest.mark.django_db
class TestApprovalListPermissionsMatchPerRow:
    """
    The approvals list answers can_approve_or_deny and can_cancel_workflow for
    its whole page at once. Every answer has to be the one the approval would
    get on its own, for every kind of user and every state of approval.
    """

    FIELDS = ('can_approve_or_deny', 'can_cancel_workflow')

    def test_list_matches_detail(self, approval_world, get):
        """
        Each row of the list carries the answers its detail view gives.

        Args:
            approval_world: Users and approvals in every relation and state.
            get: Fixture issuing GET requests against the API.
        """
        seen = {field: set() for field in self.FIELDS}
        for name, user in approval_world['users'].items():
            rows = get(reverse('api:workflow_approval_list') + '?page_size=200', user=user, expect=200).data['results']
            for row in rows:
                detail = get(reverse('api:workflow_approval_detail', kwargs={'pk': row['id']}), user=user, expect=200).data
                for field in self.FIELDS:
                    assert row[field] == detail[field], (name, row['id'], field)
                    seen[field].add(row[field])
        # The matrix is only a proof when both answers actually occur.
        assert seen == {field: {True, False} for field in self.FIELDS}

    @pytest.mark.parametrize('scopes', [None, ['read'], ['read', 'write']], ids=['session', 'read-token', 'write-token'])
    def test_batched_answers_match_the_per_row_checks(self, approval_world, scopes):
        """
        The access classes' page answers equal their per object checks.

        Unlike the list, this covers the approvals a user cannot see as well,
        and read-only tokens, which may never cancel.

        Args:
            approval_world: Users and approvals in every relation and state.
            scopes: The token scopes set on the user, or None for a session.
        """
        approvals = list(
            WorkflowApprovalAccess(approval_world['users']['superuser']).get_queryset().filter(pk__in=[a.pk for a in approval_world['approvals'].values()])
        )
        assert len(approvals) == len(approval_world['approvals'])
        workflow_jobs = {}
        for approval in approvals:
            try:
                workflow_job = approval.unified_job_node.workflow_job
            except WorkflowApproval.unified_job_node.RelatedObjectDoesNotExist:
                continue
            workflow_jobs[workflow_job.pk] = workflow_job

        for name, fixture_user in approval_world['users'].items():
            user = User.objects.get(pk=fixture_user.pk)
            if scopes is not None:
                user.oauth_scopes = scopes

            approve_answers = WorkflowApprovalAccess(user).can_approve_or_deny_many(approvals)
            # None of these rows needs the per row fallback.
            assert set(approve_answers) == {approval.pk for approval in approvals}, name
            for approval in approvals:
                fresh = WorkflowApproval.objects.get(pk=approval.pk)
                assert approve_answers[approval.pk] == user.can_access(WorkflowApproval, 'approve_or_deny', fresh), (name, approval.pk)

            cancel_answers = WorkflowJobAccess(user).get_cancel_capabilities(workflow_jobs.values())
            assert set(cancel_answers) == set(workflow_jobs), name
            for pk in workflow_jobs:
                fresh = WorkflowJob.objects.get(pk=pk)
                expected = get_user_capabilities(user, fresh, method_list=['cancel'])['cancel']
                assert cancel_answers[pk] == expected, (name, pk)

            # Spot checks that the matrix reaches each branch of can_cancel,
            # not only the outcomes: the creator of a run whose template is
            # gone, the organization workflow admin, and the template admin.
            if scopes != ['read']:
                job_of = {
                    key: approval_world['approvals'][key].unified_job_node.workflow_job_id
                    for key in ('orphaned_template', 'pending_by_admin', 'pending_no_org')
                }
                expected_spots = {
                    'creator': {'orphaned_template': True, 'pending_by_admin': False, 'pending_no_org': True},
                    'org_workflow_admin': {'orphaned_template': False, 'pending_by_admin': True, 'pending_no_org': False},
                    'workflow_admin': {'orphaned_template': False, 'pending_by_admin': True, 'pending_no_org': True},
                    'approver': {'orphaned_template': False, 'pending_by_admin': False, 'pending_no_org': False},
                }
                for key, answer in expected_spots.get(name, {}).items():
                    assert cancel_answers[job_of[key]] is answer, (name, key)

    @pytest.mark.parametrize('role', ['approver', 'workflow_admin', 'org_workflow_admin', 'executor'])
    def test_query_count_does_not_grow_for_a_non_superuser(self, spawn_approval, post, get, admin_user, user, organization, role):
        """
        Three more approvals on the page cost a non-superuser no more queries.

        Args:
            spawn_approval: Fixture launching a workflow with a pending approval.
            post: Fixture issuing POST requests against the API.
            get: Fixture issuing GET requests against the API.
            admin_user: A superuser, who launches the workflow.
            user: Factory for users.
            organization: The organization the workflow belongs to.
            role: Which relation the reader has to the workflow.
        """
        wfjt, first = spawn_approval()
        wfjt.allow_simultaneous = True
        wfjt.organization = organization
        wfjt.save(update_fields=['allow_simultaneous', 'organization'])
        reader = user('reader-' + role, False)
        if role == 'org_workflow_admin':
            organization.workflow_admin_role.members.add(reader)
        else:
            getattr(wfjt, {'approver': 'approval_role', 'workflow_admin': 'admin_role', 'executor': 'execute_role'}[role]).members.add(reader)

        # The first request caches the reader's system auditor lookup, so
        # it is read once before counting.
        TestApprovalListQueries.count_list_queries(get, reader)
        baseline = TestApprovalListQueries.count_list_queries(get, reader)
        for _ in range(3):
            TestApprovalListQueries.launch_again(post, wfjt, admin_user)
        assert get(reverse('api:workflow_approval_list'), user=reader, expect=200).data['count'] == 4
        assert TestApprovalListQueries.count_list_queries(get, reader) == baseline
