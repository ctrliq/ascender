import pytest

from django.utils.timezone import now

from awx.main.models import Job, JobEvent, JobTemplate, Inventory, Host, Group, JobHostSummary, Project
from awx.api.serializers import HostSerializer
from awx.api.versioning import reverse


@pytest.mark.django_db
class TestHostSummaryFields:
    """Tests for summary_fields of last_job and last_job_host_summary on HostSerializer."""

    def _setup_host_with_job(self, status='canceled'):
        inventory = Inventory()
        inventory.save()
        host = Host(created=now(), modified=now(), name='test-host', inventory=inventory)
        host.save()

        project = Project(name='test-project')
        project.save()
        jt = JobTemplate(name='test-jt', inventory=inventory, project=project)
        jt.save()

        job = Job(inventory=inventory, job_template=jt, status=status)
        if status in ('successful', 'failed', 'canceled', 'error'):
            job.finished = now()
        if status == 'canceled':
            job.canceled_on = now()
        job.save()

        host_map = {host.name: host.id}
        JobEvent.create_from_data(
            job_id=job.pk,
            parent_uuid='abc123',
            event='playbook_on_stats',
            event_data={
                'ok': {host.name: 1},
                'changed': {},
                'dark': {},
                'failures': {},
                'ignored': {},
                'processed': {},
                'rescued': {},
                'skipped': {},
            },
            host_map=host_map,
        ).save()

        summary = JobHostSummary.objects.filter(host=host, job=job).first()
        host.last_job = job
        host.last_job_host_summary = summary
        host.save(update_fields=['last_job', 'last_job_host_summary'])
        host.refresh_from_db()

        return host, job, summary

    def test_last_job_summary_fields_canceled_job(self):
        host, job, summary = self._setup_host_with_job(status='canceled')

        serializer = HostSerializer()
        d = serializer.get_summary_fields(host)

        assert 'last_job' in d
        last_job = d['last_job']

        expected_keys = {'id', 'name', 'description', 'finished', 'status', 'failed', 'canceled_on', 'job_template_id', 'job_template_name'}
        assert set(last_job.keys()) == expected_keys, f"Unexpected last_job keys: {set(last_job.keys())}"
        assert last_job['id'] == job.id
        assert last_job['status'] == 'canceled'
        assert last_job['canceled_on'] == job.canceled_on
        assert last_job['job_template_id'] == job.job_template.id
        assert last_job['job_template_name'] == job.job_template.name

    def test_last_job_summary_fields_successful_job(self):
        host, job, summary = self._setup_host_with_job(status='successful')

        serializer = HostSerializer()
        d = serializer.get_summary_fields(host)

        assert 'last_job' in d
        last_job = d['last_job']

        expected_keys = {'id', 'name', 'description', 'finished', 'status', 'failed', 'job_template_id', 'job_template_name'}
        assert set(last_job.keys()) == expected_keys, f"Unexpected last_job keys: {set(last_job.keys())}"
        assert last_job['id'] == job.id
        assert last_job['status'] == 'successful'
        assert 'canceled_on' not in last_job, "canceled_on should not appear when None"

    def test_last_job_host_summary_fields(self):
        host, job, summary = self._setup_host_with_job(status='successful')

        serializer = HostSerializer()
        d = serializer.get_summary_fields(host)

        assert 'last_job_host_summary' in d
        last_jhs = d['last_job_host_summary']

        assert last_jhs['id'] == summary.id
        assert 'failed' in last_jhs

    def test_no_summary_fields_without_job(self):
        inventory = Inventory()
        inventory.save()
        host = Host(created=now(), modified=now(), name='lonely-host', inventory=inventory)
        host.save()

        serializer = HostSerializer()
        d = serializer.get_summary_fields(host)

        assert 'last_job' not in d
        assert 'last_job_host_summary' not in d


@pytest.mark.django_db
class TestConstructedHostJobSummariesAPI:
    """The job_host_summaries endpoint for hosts in a constructed inventory
    should use the constructed_host FK, not the regular host FK."""

    def test_constructed_host_summaries_returned(self, get, admin, organization):
        source_inv = Inventory.objects.create(name='source', organization=organization)
        constructed_inv = Inventory.objects.create(name='constructed', kind='constructed', organization=organization)

        source_host = Host.objects.create(name='server1', inventory=source_inv)
        constructed_host = Host.objects.create(name='server1', inventory=constructed_inv, instance_id=str(source_host.pk))

        project = Project.objects.create(name='test-proj')
        jt = JobTemplate.objects.create(name='test-jt', inventory=constructed_inv, project=project)
        job = Job.objects.create(inventory=constructed_inv, job_template=jt, status='successful')

        JobHostSummary.objects.create(
            job=job, host=source_host, constructed_host=constructed_host,
            host_name='server1', ok=1
        )

        url = reverse('api:host_job_host_summaries_list', kwargs={'pk': constructed_host.pk})
        resp = get(url, user=admin, expect=200)
        assert resp.data['count'] == 1
        assert resp.data['results'][0]['host_name'] == 'server1'

    def test_regular_host_summaries_still_work(self, get, admin, organization):
        inv = Inventory.objects.create(name='regular', organization=organization)
        host = Host.objects.create(name='server1', inventory=inv)

        project = Project.objects.create(name='test-proj')
        jt = JobTemplate.objects.create(name='test-jt', inventory=inv, project=project)
        job = Job.objects.create(inventory=inv, job_template=jt, status='successful')

        JobHostSummary.objects.create(job=job, host=host, host_name='server1', ok=1)

        url = reverse('api:host_job_host_summaries_list', kwargs={'pk': host.pk})
        resp = get(url, user=admin, expect=200)
        assert resp.data['count'] == 1

    def test_constructed_host_no_false_positives(self, get, admin, organization):
        source_inv = Inventory.objects.create(name='source', organization=organization)
        constructed_inv = Inventory.objects.create(name='constructed', kind='constructed', organization=organization)

        source_host = Host.objects.create(name='server1', inventory=source_inv)
        constructed_host = Host.objects.create(name='server1', inventory=constructed_inv, instance_id=str(source_host.pk))

        project = Project.objects.create(name='test-proj')
        jt = JobTemplate.objects.create(name='test-jt', inventory=source_inv, project=project)
        job = Job.objects.create(inventory=source_inv, job_template=jt, status='successful')

        # Summary linked to source host only, not the constructed one
        JobHostSummary.objects.create(job=job, host=source_host, host_name='server1', ok=1)

        url = reverse('api:host_job_host_summaries_list', kwargs={'pk': constructed_host.pk})
        resp = get(url, user=admin, expect=200)
        assert resp.data['count'] == 0


@pytest.mark.django_db
class TestConstructedGroupJobSummariesAPI:
    """The job_host_summaries endpoint for groups in a constructed inventory
    should use the constructed_host FK."""

    def test_constructed_group_summaries_returned(self, get, admin, organization):
        source_inv = Inventory.objects.create(name='source', organization=organization)
        constructed_inv = Inventory.objects.create(name='constructed', kind='constructed', organization=organization)

        source_host = Host.objects.create(name='server1', inventory=source_inv)
        constructed_host = Host.objects.create(name='server1', inventory=constructed_inv, instance_id=str(source_host.pk))

        group = Group.objects.create(name='webservers', inventory=constructed_inv)
        group.hosts.add(constructed_host)

        project = Project.objects.create(name='test-proj')
        jt = JobTemplate.objects.create(name='test-jt', inventory=constructed_inv, project=project)
        job = Job.objects.create(inventory=constructed_inv, job_template=jt, status='successful')

        JobHostSummary.objects.create(
            job=job, host=source_host, constructed_host=constructed_host,
            host_name='server1', ok=1
        )

        url = reverse('api:group_job_host_summaries_list', kwargs={'pk': group.pk})
        resp = get(url, user=admin, expect=200)
        assert resp.data['count'] == 1
