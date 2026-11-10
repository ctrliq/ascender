# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
The job monitor lease: which dispatcher task is reading a running job's output, and until when.

A job's output is read by exactly one dispatcher task at a time. While that task streams it
renews the lease; when the task detaches on a graceful shutdown it lets the lease expire at
once; when its process is killed the lease expires by itself. Whoever finds an expired lease
(ascender.main.tasks.monitor.sweep_job_monitors, on every control node) claims the job and
resumes reading from wherever the output survived. The lease row exists only while the job is
being monitored: it is created when the job is handed to receptor and deleted once its output
has been read, before the post-run hooks, or when the job is re-queued.

The owner of a lease is the task whose id is the job's celery_task_id. A claim moves that id
while holding the lease row's lock, and checks under it that the lease is still expired; a
retirement takes the same lock before it checks that its task still owns the job. So a reader
that is done can never remove the lease of a task that has just claimed the job, and a claim
can never take a job whose reader has just finished with it. Expiring and putting off a lease
are fenced by the owner's task id as well.
"""

from datetime import timedelta

from django.db import models, transaction
from django.utils.timezone import now

from ascender.settings.typed import settings

__all__ = ['JobMonitorLease', 'LeaseLost']


class LeaseLost(Exception):
    """Another task owns the job now, so this one must stop reading and writing it."""

    def __init__(self, job_id, task_id):
        self.job_id = job_id
        self.task_id = task_id
        super().__init__(f'the monitor lease of job {job_id} is no longer held by task {task_id}')


class JobMonitorLeaseManager(models.Manager):
    @staticmethod
    def expiry(seconds=None):
        if seconds is None:
            seconds = settings.JOB_MONITOR_LEASE_SECONDS
        return now() + timedelta(seconds=seconds)

    def start(self, job, **fields):
        """Lease the job to the task that is about to stream it (its current celery_task_id)."""
        fields['expires'] = self.expiry()
        lease, _ = self.update_or_create(unified_job_id=job.pk, defaults=fields)
        return lease

    def renew(self, job, owner_task_id, seconds=None):
        """
        Extend the lease, but only while owner_task_id is still the job's task.

        Raises LeaseLost when it is not: the sweep claimed the job, and whoever still holds
        a stream open on it must drop it without finalizing or releasing anything.
        """
        updated = self.filter(unified_job_id=job.pk, unified_job__celery_task_id=owner_task_id).update(expires=self.expiry(seconds))
        if not updated:
            raise LeaseLost(job.pk, owner_task_id)

    def record(self, job, **fields):
        return self.filter(unified_job_id=job.pk).update(**fields)

    def owned(self, job, owner_task_id):
        """The job's lease, as long as owner_task_id is still the job's task (a task without an id owns its job)."""
        leases = self.filter(unified_job_id=job.pk)
        if owner_task_id:
            leases = leases.filter(unified_job__celery_task_id=owner_task_id)
        return leases

    def release(self, job, owner_task_id):
        """Expire the lease now, so the next sweep on any node resumes the job at once."""
        return self.owned(job, owner_task_id).update(expires=now())

    def defer(self, job, seconds, owner_task_id):
        """Leave the job alone for a while; used when the output is not available yet."""
        return self.owned(job, owner_task_id).update(expires=self.expiry(seconds), deferrals=models.F('deferrals') + 1)

    def retire(self, job, owner_task_id):
        """
        Remove the lease once its owner is done with the job's output. True when owner_task_id still
        owns the job, so that the caller may release the work and finish the job; False when another
        task claimed it meanwhile, whose lease then stays. See the module docstring.
        """
        from ascender.main.models.unified_jobs import UnifiedJob  # circular import

        with transaction.atomic():
            leases = list(self.select_for_update().filter(unified_job_id=job.pk).values_list('pk', flat=True))
            if owner_task_id and not UnifiedJob.objects.filter(pk=job.pk, celery_task_id=owner_task_id).exists():
                return False
            if leases:
                self.filter(pk__in=leases).delete()
        return True

    def finish(self, job):
        """Nothing is left to monitor: the job was re-queued or has ended."""
        return self.filter(unified_job_id=job.pk).delete()[0]

    def expired(self):
        return self.filter(expires__lt=now(), unified_job__status='running').select_related('unified_job').order_by('expires')


class JobMonitorLease(models.Model):
    class Meta:
        app_label = 'main'

    objects = JobMonitorLeaseManager()

    unified_job = models.OneToOneField(
        'UnifiedJob',
        related_name='monitor_lease',
        on_delete=models.CASCADE,
        primary_key=True,
        editable=False,
    )
    # Past this the job is considered unmonitored and is claimed by the next sweep.
    expires = models.DateTimeField(db_index=True, editable=False)
    # The pod of a container group job, so a resume can read its log without a label search.
    pod_name = models.CharField(max_length=253, default='', blank=True, editable=False)
    pod_namespace = models.CharField(max_length=253, default='', blank=True, editable=False)
    # ansible-runner reported 'starting': the execution environment received its payload and the
    # playbook is (or was) running. Before this a job can be re-queued; after it only resumed.
    worker_started = models.BooleanField(default=False, editable=False)
    # How many times monitoring of this job has been resumed by a sweep.
    resumed = models.PositiveIntegerField(default=0, editable=False)
    # How many times a resume found the output not reachable yet and put the job off.
    deferrals = models.PositiveIntegerField(default=0, editable=False)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'monitor lease of unified job {self.unified_job_id} until {self.expires}'
