# Python
import pytest
from unittest import mock
from dateutil.parser import parse
from dateutil.relativedelta import relativedelta
from ascender.main.middleware import impersonate
import datetime

# Django rest framework
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone

# Ascender
from ascender.api.versioning import reverse
from ascender.api.views.mixin import (
    RelatedJobsPreventDeleteMixin,
    UnifiedJobDeletionMixin,
)
from ascender.main.models import JobTemplate, User, Job, AdHocCommand, ProjectUpdate, InstanceGroup, Label, Organization


@pytest.mark.django_db
def test_job_relaunch_permission_denied_response(post, get, inventory, project, net_credential, machine_credential):
    jt = JobTemplate.objects.create(name='testjt', inventory=inventory, project=project, ask_credential_on_launch=True)
    jt.credentials.add(machine_credential)
    jt_user = User.objects.create(username='jobtemplateuser')
    jt.execute_role.members.add(jt_user)
    with impersonate(jt_user):
        job = jt.create_unified_job()

    # User capability is shown for this
    r = get(job.get_absolute_url(), jt_user, expect=200)
    assert r.data['summary_fields']['user_capabilities']['start']

    # Job has prompted credential, launch denied w/ message
    job.launch_config.credentials.add(net_credential)
    r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, jt_user, expect=403)
    assert 'launched with prompted fields you do not have access to' in r.data['detail']
    job.launch_config.credentials.clear()

    # Job has prompted instance group that user cannot see
    job.launch_config.instance_groups.add(InstanceGroup.objects.create())
    r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, jt_user, expect=403)
    assert 'launched with prompted fields you do not have access to' in r.data['detail']
    job.launch_config.instance_groups.clear()

    # Job has prompted label that user cannot see
    job.launch_config.labels.add(Label.objects.create(organization=Organization.objects.create()))
    r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, jt_user, expect=403)
    assert 'launched with prompted fields you do not have access to' in r.data['detail']
    job.launch_config.labels.clear()

    # without any of those prompts, user can launch
    r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, jt_user, expect=201)


@pytest.mark.django_db
def test_label_sublist(get, admin_user, organization):
    job = Job.objects.create()
    label = Label.objects.create(organization=organization, name='Steve')
    job.labels.add(label)
    r = get(url=reverse('api:job_label_list', kwargs={'pk': job.pk}), user=admin_user, expect=200)
    assert r.data['count'] == 1
    assert r.data['results'].pop()['id'] == label.id


@pytest.mark.django_db
def test_job_relaunch_prompts_not_accepted_response(post, get, inventory, project, credential, net_credential, machine_credential):
    jt = JobTemplate.objects.create(name='testjt', inventory=inventory, project=project)
    jt.credentials.add(machine_credential)
    jt_user = User.objects.create(username='jobtemplateuser')
    jt.execute_role.members.add(jt_user)
    with impersonate(jt_user):
        job = jt.create_unified_job()

    # User capability is shown for this
    r = get(job.get_absolute_url(), jt_user, expect=200)
    assert r.data['summary_fields']['user_capabilities']['start']

    # Job has prompted credential, launch denied w/ message
    job.launch_config.credentials.add(net_credential)
    r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, jt_user, expect=403)


@pytest.mark.django_db
def test_job_relaunch_permission_denied_response_other_user(get, post, inventory, project, alice, bob, survey_spec_factory):
    """
    Asserts custom permission denied message corresponding to
    ascender/main/tests/functional/test_rbac_job.py::TestJobRelaunchAccess::test_other_user_prompts
    """
    jt = JobTemplate.objects.create(
        name='testjt',
        inventory=inventory,
        project=project,
        ask_credential_on_launch=True,
        ask_variables_on_launch=True,
        survey_spec=survey_spec_factory([{'variable': 'secret_key', 'default': '6kQngg3h8lgiSTvIEb21', 'type': 'password'}]),
        survey_enabled=True,
    )
    jt.execute_role.members.add(alice, bob)
    with impersonate(bob):
        job = jt.create_unified_job(extra_vars={'job_var': 'foo2', 'secret_key': 'sk4t3Rb01'})

    # User capability is shown for this
    r = get(job.get_absolute_url(), alice, expect=200)
    assert r.data['summary_fields']['user_capabilities']['start']

    # Job has prompted data, launch denied w/ message
    r = post(url=reverse('api:job_relaunch', kwargs={'pk': job.pk}), data={}, user=alice, expect=403)
    assert 'Job was launched with secret prompts provided by another user' in r.data['detail']


@pytest.mark.django_db
def test_job_relaunch_without_creds(post, inventory, project, admin_user):
    jt = JobTemplate.objects.create(name='testjt', inventory=inventory, project=project)
    job = jt.create_unified_job()
    post(url=reverse('api:job_relaunch', kwargs={'pk': job.pk}), data={}, user=admin_user, expect=201)


@pytest.mark.django_db
def test_job_relaunch_slice_workflow_job(post, admin_user, project, slice_job_factory):
    workflow_job = slice_job_factory(3, jt_kwargs={'project': project}, spawn=True)
    job = workflow_job.workflow_nodes.first().job

    post(url=reverse('api:job_relaunch', kwargs={'pk': job.pk}), data={}, user=admin_user, expect=201)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "status,hosts",
    [
        ('all', 'host1,host2,host3'),
        ('failed', 'host3'),
    ],
)
def test_job_relaunch_on_failed_hosts(post, inventory, project, machine_credential, admin_user, status, hosts):
    h1 = inventory.hosts.create(name='host1')  # no-op
    h2 = inventory.hosts.create(name='host2')  # changed host
    h3 = inventory.hosts.create(name='host3')  # failed host
    jt = JobTemplate.objects.create(name='testjt', inventory=inventory, project=project)
    jt.credentials.add(machine_credential)
    job = jt.create_unified_job(_eager_fields={'status': 'failed'}, limit='host1,host2,host3')
    job.job_events.create(event='playbook_on_stats')
    job.job_host_summaries.create(host=h1, failed=False, ok=1, changed=0, failures=0, host_name=h1.name)
    job.job_host_summaries.create(host=h2, failed=False, ok=0, changed=1, failures=0, host_name=h2.name)
    job.job_host_summaries.create(host=h3, failed=False, ok=0, changed=0, failures=1, host_name=h3.name)

    r = post(url=reverse('api:job_relaunch', kwargs={'pk': job.pk}), data={'hosts': status}, user=admin_user, expect=201)
    assert r.data.get('limit') == hosts


@pytest.mark.django_db
def test_summary_fields_recent_jobs(job_template, admin_user, get):
    jobs = []
    for i in range(13):
        jobs.append(
            Job.objects.create(
                job_template=job_template,
                status='failed',
                created=timezone.make_aware(datetime.datetime(2017, 3, 21, 9, i)),
                finished=timezone.make_aware(datetime.datetime(2017, 3, 21, 10, i)),
            )
        )
    r = get(url=job_template.get_absolute_url(), user=admin_user, exepect=200)
    recent_jobs = r.data['summary_fields']['recent_jobs']
    assert len(recent_jobs) == 10
    assert recent_jobs == [{'id': job.id, 'status': 'failed', 'finished': job.finished, 'canceled_on': None, 'type': 'job'} for job in jobs[-10:][::-1]]


@pytest.mark.django_db
def test_slice_jt_recent_jobs(slice_job_factory, admin_user, get):
    workflow_job = slice_job_factory(3, spawn=True)
    slice_jt = workflow_job.job_template
    r = get(url=slice_jt.get_absolute_url(), user=admin_user, expect=200)
    job_ids = [entry['id'] for entry in r.data['summary_fields']['recent_jobs']]
    # decision is that workflow job should be shown in the related jobs
    # joblets of the workflow job should NOT be shown
    assert job_ids == [workflow_job.pk]


@pytest.mark.django_db
def test_block_unprocessed_events(delete, admin_user, mocker):
    time_of_finish = parse("Thu Feb 28 09:10:20 2013 -0500")
    job = Job.objects.create(emitted_events=1, status='finished', finished=time_of_finish)
    request = mock.MagicMock()

    class MockView(UnifiedJobDeletionMixin):
        model = Job

        def get_object(self):
            return job

    view = MockView()

    time_of_request = time_of_finish + relativedelta(seconds=2)
    with mock.patch('ascender.api.views.mixin.now', lambda: time_of_request):
        r = view.destroy(request)
        assert r.status_code == 400


@pytest.mark.django_db
def test_block_related_unprocessed_events(mocker, organization, project, delete, admin_user):
    job_template = JobTemplate.objects.create(project=project, playbook='helloworld.yml')
    time_of_finish = parse("Thu Feb 23 14:17:24 2012 -0500")
    Job.objects.create(
        emitted_events=1, status='finished', finished=time_of_finish, job_template=job_template, project=project, organization=project.organization
    )
    view = RelatedJobsPreventDeleteMixin()
    time_of_request = time_of_finish + relativedelta(seconds=2)
    with mock.patch('ascender.api.views.mixin.now', lambda: time_of_request):
        with pytest.raises(PermissionDenied):
            view.perform_destroy(organization)


@pytest.mark.django_db
def test_disallowed_http_update_methods(put, patch, post, inventory, project, admin_user):
    jt = JobTemplate.objects.create(name='test_disallowed_methods', inventory=inventory, project=project)
    job = jt.create_unified_job()
    post(url=reverse('api:job_detail', kwargs={'pk': job.pk}), data={}, user=admin_user, expect=405)
    put(url=reverse('api:job_detail', kwargs={'pk': job.pk}), data={}, user=admin_user, expect=405)
    patch(url=reverse('api:job_detail', kwargs={'pk': job.pk}), data={}, user=admin_user, expect=405)


class TestControllerNode:
    @pytest.fixture
    def project_update(self, project):
        return ProjectUpdate.objects.create(project=project)

    @pytest.fixture
    def job(self):
        return JobTemplate.objects.create().create_unified_job()

    @pytest.fixture
    def adhoc(self, inventory):
        return AdHocCommand.objects.create(inventory=inventory)

    @pytest.mark.django_db
    def test_field_controller_node_exists(self, admin_user, job, project_update, inventory_update, adhoc, get, system_job_factory):
        system_job = system_job_factory()

        r = get(reverse('api:unified_job_list') + '?id={}'.format(job.id), admin_user, expect=200)
        assert 'controller_node' in r.data['results'][0]

        r = get(job.get_absolute_url(), admin_user, expect=200)
        assert 'controller_node' in r.data

        r = get(reverse('api:ad_hoc_command_detail', kwargs={'pk': adhoc.pk}), admin_user, expect=200)
        assert 'controller_node' in r.data

        r = get(reverse('api:project_update_detail', kwargs={'pk': project_update.pk}), admin_user, expect=200)
        assert 'controller_node' not in r.data

        r = get(reverse('api:inventory_update_detail', kwargs={'pk': inventory_update.pk}), admin_user, expect=200)
        assert 'controller_node' in r.data

        r = get(reverse('api:system_job_detail', kwargs={'pk': system_job.pk}), admin_user, expect=200)
        assert 'controller_node' not in r.data


@pytest.mark.django_db
class TestPreventRelaunch:
    """A job template can turn relaunch off for the jobs it launches, which binds everyone."""

    @pytest.fixture
    def jt(self, inventory, project):
        return JobTemplate.objects.create(name='one-shot', inventory=inventory, project=project, playbook='helloworld.yml', prevent_relaunch=True)

    @pytest.fixture
    def executor(self, jt):
        user = User.objects.create(username='jt-executor')
        jt.execute_role.members.add(user)
        return user

    def test_relaunch_refused(self, jt, executor, admin_user, get, post):
        with impersonate(executor):
            job = jt.create_unified_job()
        for user in (executor, admin_user):
            r = get(job.get_absolute_url(), user, expect=200)
            assert r.data['summary_fields']['user_capabilities']['start'] is False
            assert r.data['summary_fields']['job_template']['prevent_relaunch'] is True
            r = post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, user, expect=403)
            assert 'Relaunch is disabled' in r.data['detail']
        assert Job.objects.count() == 1

    def test_relaunch_on_failed_hosts_refused(self, jt, inventory, admin_user, post):
        host = inventory.hosts.create(name='host1')
        job = jt.create_unified_job(_eager_fields={'status': 'failed'})
        job.job_events.create(event='playbook_on_stats')
        job.job_host_summaries.create(host=host, failed=True, failures=1, host_name=host.name)
        post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {'hosts': 'failed'}, admin_user, expect=403)

    def test_flag_is_read_at_relaunch_time(self, jt, executor, get, post):
        with impersonate(executor):
            job = jt.create_unified_job()
        jt.prevent_relaunch = False
        jt.save(update_fields=['prevent_relaunch'])
        r = get(job.get_absolute_url(), executor, expect=200)
        assert r.data['summary_fields']['user_capabilities']['start'] is True
        post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, executor, expect=201)

    def test_template_can_still_be_launched(self, jt, executor, get, post):
        r = get(jt.get_absolute_url(), executor, expect=200)
        assert r.data['summary_fields']['user_capabilities']['start'] is True
        post(reverse('api:job_template_launch', kwargs={'pk': jt.pk}), {}, executor, expect=201)

    def test_sliced_job_relaunch_refused(self, admin_user, project, get, post, slice_job_factory):
        workflow_job = slice_job_factory(3, jt_kwargs={'project': project, 'prevent_relaunch': True}, spawn=True)
        r = get(workflow_job.get_absolute_url(), admin_user, expect=200)
        assert r.data['summary_fields']['user_capabilities']['start'] is False
        r = post(reverse('api:workflow_job_relaunch', kwargs={'pk': workflow_job.pk}), {}, admin_user, expect=403)
        assert 'Relaunch is disabled' in r.data['detail']
        # each slice is a job of the same template
        slice_job = workflow_job.workflow_nodes.first().job
        post(reverse('api:job_relaunch', kwargs={'pk': slice_job.pk}), {}, admin_user, expect=403)

    def test_field_is_editable_and_copied(self, jt, admin_user, patch, post):
        r = patch(jt.get_absolute_url(), {'prevent_relaunch': False}, admin_user, expect=200)
        assert r.data['prevent_relaunch'] is False
        patch(jt.get_absolute_url(), {'prevent_relaunch': True}, admin_user, expect=200)
        r = post(reverse('api:job_template_copy', kwargs={'pk': jt.pk}), {'name': 'one-shot copy'}, admin_user, expect=201)
        assert JobTemplate.objects.get(pk=r.data['id']).prevent_relaunch is True

    @pytest.mark.parametrize('prevent', [True, False])
    def test_deleted_template_keeps_protection(self, jt, organization, admin_user, post, prevent):
        jt.organization = organization
        jt.prevent_relaunch = prevent
        jt.save()
        job = jt.create_unified_job()
        org_executor = User.objects.create(username='org-executor')
        organization.execute_role.members.add(org_executor)
        # a queryset delete goes through the same pre_delete signal as the API
        JobTemplate.objects.filter(pk=jt.pk).delete()
        job.refresh_from_db()
        assert job.job_template is None
        assert job.prevent_relaunch is prevent
        # an orphan is relaunchable by superusers and org executors unless its template prevented relaunch
        for user in (org_executor, admin_user):
            post(reverse('api:job_relaunch', kwargs={'pk': job.pk}), {}, user, expect=403 if prevent else 201)

    def test_template_delete_via_api(self, jt, admin_user, delete, get):
        job = jt.create_unified_job(_eager_fields={'status': 'successful', 'finished': timezone.now() - datetime.timedelta(minutes=5)})
        delete(jt.get_absolute_url(), admin_user, expect=204)
        r = get(job.get_absolute_url(), admin_user, expect=200)
        assert r.data['summary_fields']['user_capabilities']['start'] is False
