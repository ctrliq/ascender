# -*- coding: utf-8 -*-
from copy import deepcopy
import datetime

import pytest

# from awx.main.models import NotificationTemplates, Notifications, JobNotificationMixin
from awx.main.models import (
    AdHocCommand,
    InventoryUpdate,
    Job,
    JobNotificationMixin,
    NotificationTemplate,
    ProjectUpdate,
    Schedule,
    SystemJob,
    WorkflowJob,
)
from awx.api.serializers import UnifiedJobSerializer


class TestJobNotificationMixin(object):
    CONTEXT_STRUCTURE = {
        'job': {
            'allow_simultaneous': bool,
            'artifacts': {},
            'controller_node': str,
            'created': datetime.datetime,
            'description': str,
            'diff_mode': bool,
            'elapsed': float,
            'execution_node': str,
            'failed': bool,
            'finished': bool,
            'force_handlers': bool,
            'forks': int,
            'host_status_counts': {'skipped': int, 'ok': int, 'changed': int, 'failures': int, 'dark': int, 'processed': int, 'rescued': int, 'failed': bool},
            'hosts': list,
            'id': int,
            'job_explanation': str,
            'job_slice_count': int,
            'job_slice_number': int,
            'job_tags': str,
            'job_type': str,
            'launch_type': str,
            'limit': str,
            'modified': datetime.datetime,
            'name': str,
            'playbook': str,
            'scm_branch': str,
            'scm_revision': str,
            'skip_tags': str,
            'start_at_task': str,
            'started': str,
            'status': str,
            'summary_fields': {
                'created_by': {'first_name': str, 'id': int, 'last_name': str, 'username': str},
                'instance_group': {'id': int, 'name': str},
                'inventory': {
                    'description': str,
                    'has_active_failures': bool,
                    'has_inventory_sources': bool,
                    'hosts_with_active_failures': int,
                    'id': int,
                    'inventory_sources_with_failures': int,
                    'kind': str,
                    'name': str,
                    'organization_id': int,
                    'total_groups': int,
                    'total_hosts': int,
                    'total_inventory_sources': int,
                },
                'job_template': {'description': str, 'id': int, 'name': str},
                'labels': {'count': int, 'results': list},
                'project': {'description': str, 'id': int, 'name': str, 'scm_type': str, 'status': str},
                'schedule': {'description': str, 'id': int, 'name': str, 'next_run': datetime.datetime},
                'unified_job_template': {'description': str, 'id': int, 'name': str, 'unified_job_type': str},
            },
            'timeout': int,
            'type': str,
            'url': str,
            'use_fact_cache': bool,
            'verbosity': int,
        },
        'job_friendly_name': str,
        'job_metadata': str,
        'approval_status': str,
        'approval_node_name': str,
        'workflow_url': str,
        'url': str,
    }

    def check_structure(self, expected_structure, obj):
        if isinstance(expected_structure, dict):
            assert isinstance(obj, dict)
            for key in obj:
                assert key in expected_structure
                if obj[key] is None:
                    continue
                if isinstance(expected_structure[key], dict):
                    assert isinstance(obj[key], dict)
                    self.check_structure(expected_structure[key], obj[key])
                else:
                    if key == 'job_explanation':
                        assert isinstance(str(obj[key]), expected_structure[key])
                    else:
                        assert isinstance(obj[key], expected_structure[key])

    @pytest.mark.django_db
    @pytest.mark.parametrize('JobClass', [AdHocCommand, InventoryUpdate, Job, ProjectUpdate, SystemJob, WorkflowJob])
    def test_context(self, JobClass, sqlite_copy, project, inventory_source):
        """The Jinja context defines all of the fields that can be used by a template. Ensure that the context generated
        for each job type has the expected structure."""
        kwargs = {}
        if JobClass is InventoryUpdate:
            kwargs['inventory_source'] = inventory_source
            kwargs['source'] = inventory_source.source
        elif JobClass is ProjectUpdate:
            kwargs['project'] = project

        job = JobClass.objects.create(name='foo', **kwargs)
        job_serialization = UnifiedJobSerializer(job).to_representation(job)

        context = job.context(job_serialization)
        self.check_structure(TestJobNotificationMixin.CONTEXT_STRUCTURE, context)

    @pytest.mark.django_db
    def test_schedule_context(self, job_template, admin_user):
        schedule = Schedule.objects.create(name='job-schedule', rrule='DTSTART:20171129T155939z\nFREQ=MONTHLY', unified_job_template=job_template)
        job = Job.objects.create(name='fake-job', launch_type='workflow', schedule=schedule, job_template=job_template)

        job_serialization = UnifiedJobSerializer(job).to_representation(job)

        context = job.context(job_serialization)
        self.check_structure(TestJobNotificationMixin.CONTEXT_STRUCTURE, context)

    @pytest.mark.django_db
    def test_context_hosts(self):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-b', failed=False, ok=1, changed=0, failures=0)
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=0, failures=0)

        job_serialization = UnifiedJobSerializer(job).to_representation(job)
        context = job.context(job_serialization)

        assert context['job']['hosts'] == ['host-a', 'host-b']

    @pytest.mark.django_db
    def test_context_job_metadata_with_unicode(self):
        job = Job.objects.create(name='批量安装项目')
        job_serialization = UnifiedJobSerializer(job).to_representation(job)
        context = job.context(job_serialization)
        assert '批量安装项目' in context['job_metadata']

    @pytest.mark.django_db
    @pytest.mark.parametrize('bad_template', ['{% badtag %}', 'Job {{ name '])
    def test_build_notification_message_handles_template_render_error(self, bad_template):
        """A custom template with a Jinja syntax error must yield a readable error
        message, not raise. traceback.format_exception returns a list, so the .replace
        must apply to the joined string."""
        job = Job.objects.create(name='fake-job')
        nt = NotificationTemplate(name='broken', notification_type='webhook', messages={'started': {'message': bad_template, 'body': ''}})

        msg, body = job.build_notification_message(nt, 'running')

        assert isinstance(msg, str)
        assert 'Traceback' in msg

    def test_context_stub(self):
        """The context stub is a fake context used to validate custom notification messages. Ensure that
        this also has the expected structure. Furthermore, ensure that the stub context contains
        *all* fields that could possibly be included in a context."""

        def check_structure_and_completeness(expected_structure, obj):
            expected_structure = deepcopy(expected_structure)
            if isinstance(expected_structure, dict):
                assert isinstance(obj, dict)
                for key in obj:
                    assert key in expected_structure
                    # Context stub should not have any undefined fields
                    assert obj[key] is not None
                    if isinstance(expected_structure[key], dict):
                        assert isinstance(obj[key], dict)
                        check_structure_and_completeness(expected_structure[key], obj[key])
                        expected_structure.pop(key)
                    else:
                        assert isinstance(obj[key], expected_structure[key])
                        expected_structure.pop(key)
                # Ensure all items in expected structure were present
                assert not len(expected_structure)

        context_stub = JobNotificationMixin.context_stub()
        check_structure_and_completeness(TestJobNotificationMixin.CONTEXT_STRUCTURE, context_stub)


class TestChangedNotifications(object):
    """The changed trigger fires for a run that reported a change on any host, next to the
    trigger for how the run ended, so a compliance playbook run in check mode reports drift
    without having to fail to be noticed."""

    def notification_template(self, name):
        return NotificationTemplate.objects.create(
            name=name,
            notification_type='webhook',
            notification_configuration=dict(url='http://localhost', username='', password='', headers={}),
        )

    def notified_templates(self, build_notification_message):
        return set(call[0][0] for call in build_notification_message.call_args_list)

    @pytest.mark.django_db
    def test_job_without_changes(self):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=0, failures=0)

        assert job.has_changes() is False

    @pytest.mark.django_db
    def test_job_with_changes(self):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=0, failures=0)
        job.job_host_summaries.create(host_name='host-b', failed=False, ok=1, changed=2, failures=0)

        assert job.has_changes() is True

    @pytest.mark.django_db
    @pytest.mark.parametrize('JobClass', [InventoryUpdate, ProjectUpdate, SystemJob, WorkflowJob])
    def test_job_types_without_host_results_never_report_changes(self, JobClass):
        assert JobClass.objects.create(name='fake-job').has_changes() is False

    @pytest.mark.django_db
    def test_ad_hoc_command_with_changes(self):
        command = AdHocCommand.objects.create(name='fake-command')
        command.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=1, failures=0)

        assert command.has_changes() is True

    @pytest.mark.django_db
    def test_changed_templates_are_notified_next_to_the_outcome(self, mocker):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=1, failures=0)
        success = self.notification_template('on-success')
        changed = self.notification_template('on-changed')
        mocker.patch.object(Job, 'get_notification_templates', return_value={'success': [success], 'changed': [changed]})
        build = mocker.patch.object(Job, 'build_notification_message', return_value=('msg', 'body'))

        job.send_notification_templates('succeeded')

        assert self.notified_templates(build) == {success, changed}

    @pytest.mark.django_db
    def test_a_job_that_changed_nothing_only_notifies_the_outcome(self, mocker):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=0, failures=0)
        success = self.notification_template('on-success')
        changed = self.notification_template('on-changed')
        mocker.patch.object(Job, 'get_notification_templates', return_value={'success': [success], 'changed': [changed]})
        build = mocker.patch.object(Job, 'build_notification_message', return_value=('msg', 'body'))

        job.send_notification_templates('succeeded')

        assert self.notified_templates(build) == {success}

    @pytest.mark.django_db
    def test_a_failed_job_that_changed_something_notifies_both(self, mocker):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=True, ok=1, changed=1, failures=1)
        error = self.notification_template('on-error')
        changed = self.notification_template('on-changed')
        mocker.patch.object(Job, 'get_notification_templates', return_value={'error': [error], 'changed': [changed]})
        build = mocker.patch.object(Job, 'build_notification_message', return_value=('msg', 'body'))

        job.send_notification_templates('failed')

        assert self.notified_templates(build) == {error, changed}

    @pytest.mark.django_db
    def test_the_start_of_a_job_does_not_notify_the_changed_templates(self, mocker):
        job = Job.objects.create(name='fake-job')
        job.job_host_summaries.create(host_name='host-a', failed=False, ok=1, changed=1, failures=0)
        started = self.notification_template('on-started')
        changed = self.notification_template('on-changed')
        mocker.patch.object(Job, 'get_notification_templates', return_value={'started': [started], 'changed': [changed]})
        build = mocker.patch.object(Job, 'build_notification_message', return_value=('msg', 'body'))

        job.send_notification_templates('running')

        assert self.notified_templates(build) == {started}

    @pytest.mark.django_db
    def test_an_unknown_status_is_refused(self):
        job = Job.objects.create(name='fake-job')

        with pytest.raises(ValueError):
            job.send_notification_templates('bogus')
