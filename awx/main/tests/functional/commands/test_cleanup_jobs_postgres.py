"""cleanup_jobs against a real PostgreSQL, with nothing stubbed out.

The default test settings use SQLite, which leaves every PostgreSQL-only
statement in this command unreachable from a test: _pre_delete_job_host_summaries
issues ANY(%s) and has_unpartitioned_table reads pg_tables. Both are skipped by
the SQLite suite in test_cleanup_jobs.py, so the statements themselves are only
ever asserted as strings against a mock cursor.

Run these with `make test-postgres`.
"""

import logging
from datetime import timedelta
from unittest import mock

import pytest

from django.db import connection
from django.utils.timezone import now

from awx.main.management.commands.cleanup_jobs import Command
from awx.main.models import Job, Host, JobHostSummary

pytestmark = pytest.mark.skipif(connection.vendor != 'postgresql', reason='exercises PostgreSQL-only SQL')


def _command(batch_size=100000):
    command = Command()
    command.logger = logging.getLogger('awx.main.commands.cleanup_jobs')
    command.cutoff = now() - timedelta(days=1)
    command.dry_run = False
    command.batch_size = batch_size
    return command


def _old_job_with_hosts(inventory, name, host_count):
    job = Job.objects.create(name=name, inventory=inventory, status='successful')
    Job.objects.filter(pk=job.pk).update(created=now() - timedelta(days=400))
    hosts = []
    for i in range(host_count):
        host = Host.objects.create(name='%s-host-%d' % (name, i), inventory=inventory)
        summary = JobHostSummary.objects.create(job=job, host=host, host_name=host.name)
        host.last_job_host_summary = summary
        host.last_job = job
        host.save()
        hosts.append(host)
    return job, hosts


@pytest.mark.django_db
def test_cleanup_jobs_clears_host_summary_references(inventory):
    """The raw UPDATE has to null Host.last_job_host_summary before the DELETE,
    otherwise the foreign key blocks it."""
    job, hosts = _old_job_with_hosts(inventory, 'pg-clears', 3)
    assert JobHostSummary.objects.filter(job=job).count() == 3

    skipped, deleted = _command().cleanup_jobs()

    assert deleted == 1
    assert not Job.objects.filter(pk=job.pk).exists()
    assert JobHostSummary.objects.filter(job_id=job.pk).count() == 0
    for host in hosts:
        host.refresh_from_db()
        assert host.last_job_host_summary_id is None


@pytest.mark.django_db
def test_cleanup_jobs_keeps_hosts_themselves(inventory):
    """Only the summary rows go; the hosts they pointed at must survive."""
    job, hosts = _old_job_with_hosts(inventory, 'pg-keeps', 3)

    _command().cleanup_jobs()

    for host in hosts:
        assert Host.objects.filter(pk=host.pk).exists()


@pytest.mark.django_db
def test_cleanup_jobs_leaves_recent_jobs_and_their_summaries(inventory):
    recent = Job.objects.create(name='pg-recent', inventory=inventory, status='successful')
    host = Host.objects.create(name='pg-recent-host', inventory=inventory)
    summary = JobHostSummary.objects.create(job=recent, host=host, host_name=host.name)
    host.last_job_host_summary = summary
    host.save()

    _command().cleanup_jobs()

    assert Job.objects.filter(pk=recent.pk).exists()
    assert JobHostSummary.objects.filter(pk=summary.pk).exists()
    host.refresh_from_db()
    assert host.last_job_host_summary_id == summary.pk


@pytest.mark.django_db
def test_pre_delete_job_host_summaries_spans_chunks(inventory):
    """The helper chunks its job pks; drive it across more than one chunk so the
    loop runs against the database rather than a mock cursor."""
    jobs = []
    for i in range(5):
        job, _ = _old_job_with_hosts(inventory, 'pg-chunk-%d' % i, 2)
        jobs.append(job)
    assert JobHostSummary.objects.filter(job__in=jobs).count() == 10

    with mock.patch('awx.main.management.commands.cleanup_jobs.JHS_CHUNK_SIZE', 2):
        skipped, deleted = _command().cleanup_jobs()

    assert deleted == len(jobs)
    assert JobHostSummary.objects.filter(job__in=jobs).count() == 0
    assert not Host.objects.filter(last_job_host_summary__isnull=False, inventory=inventory).exists()
