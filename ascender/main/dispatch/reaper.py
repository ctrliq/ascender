from datetime import timedelta
import logging

from django.db.models import Q
from ascender.settings.typed import settings
from django.utils.timezone import now as tz_now
from django.contrib.contenttypes.models import ContentType

from ascender.main.models import Instance, UnifiedJob, WorkflowJob

logger = logging.getLogger('ascender.main.dispatch')


def startup_reaping():
    """
    If this particular instance is starting, then we know that any running jobs are invalid
    so we will reap those jobs as a special action here.

    A running job that holds a monitor lease is not one of them: its work was handed to
    receptor, and may well still be running on an execution node or in a pod. The job
    monitor sweep resumes or re-queues it, see ascender.main.tasks.monitor.
    """
    hostname = Instance.objects.my_hostname()
    leased = list(UnifiedJob.objects.filter(status='running', controller_node=hostname, monitor_lease__isnull=False).values_list('id', flat=True))
    if leased:
        logger.warning(f'Unified jobs {leased} were running under a monitor lease at dispatch startup; left to the job monitor sweep')
    jobs = UnifiedJob.objects.filter(status='running', controller_node=hostname, monitor_lease__isnull=True)
    job_ids = []
    for j in jobs:
        job_ids.append(j.id)
        reap_job(
            j,
            'failed',
            job_explanation='Task was marked as running at system start up. The system must have not shut down properly, so it has been marked as failed.',
        )
    if job_ids:
        logger.error(f'Unified jobs {job_ids} were reaped on dispatch startup')


def reap_job(j, status, job_explanation=None):
    j.refresh_from_db(fields=['status', 'job_explanation'])
    status_before = j.status
    if status_before not in ('running', 'waiting'):
        # just in case, don't reap jobs that aren't running
        return
    j.status = status
    j.start_args = ''  # blank field to remove encrypted passwords
    if j.job_explanation:
        j.job_explanation += ' '  # Separate messages for readability
    if job_explanation is None:
        j.job_explanation += 'Task was marked as running but was not present in the job queue, so it has been marked as failed.'
    else:
        j.job_explanation += job_explanation
    j.save(update_fields=['status', 'start_args', 'job_explanation'])
    if hasattr(j, 'send_notification_templates'):
        j.send_notification_templates('failed')
    j.websocket_emit_status(status)
    logger.error(f'{j.log_format} is no longer {status_before}; reaping')


def reap_waiting(instance=None, status='failed', job_explanation=None, grace_period=None, excluded_uuids=None, ref_time=None):
    """
    Reap all jobs in waiting for this instance.
    """
    if grace_period is None:
        grace_period = settings.JOB_WAITING_GRACE_PERIOD + settings.TASK_MANAGER_TIMEOUT

    if instance is None:
        hostname = Instance.objects.my_hostname()
    else:
        hostname = instance.hostname
    if ref_time is None:
        ref_time = tz_now()
    jobs = UnifiedJob.objects.filter(status='waiting', modified__lte=ref_time - timedelta(seconds=grace_period), controller_node=hostname)
    if excluded_uuids:
        jobs = jobs.exclude(celery_task_id__in=excluded_uuids)
    for j in jobs:
        reap_job(j, status, job_explanation=job_explanation)


def reap(instance=None, status='failed', job_explanation=None, excluded_uuids=None, ref_time=None):
    """
    Reap all jobs in running for this instance.

    A job that holds a monitor lease is left out when this instance is its controller: whether
    the instance is this one or a lost peer, the lease lapses once nobody renews it, and the
    job's output is read again by whichever node sweeps it. A leased job that only executes on
    this instance is reaped as before. Its controller is alive and still reading it, and would
    wait for a lost execution node for as long as receptor does, which is indefinitely.
    """
    if instance is None:
        hostname = Instance.objects.my_hostname()
    else:
        hostname = instance.hostname
    workflow_ctype_id = ContentType.objects.get_for_model(WorkflowJob).id
    base_Q = Q(status='running') & (Q(execution_node=hostname) | Q(controller_node=hostname)) & ~Q(polymorphic_ctype_id=workflow_ctype_id)
    base_Q &= Q(monitor_lease__isnull=True) | ~Q(controller_node=hostname)
    if ref_time:
        jobs = UnifiedJob.objects.filter(base_Q & Q(started__lte=ref_time))
    else:
        jobs = UnifiedJob.objects.filter(base_Q)
    if excluded_uuids:
        jobs = jobs.exclude(celery_task_id__in=excluded_uuids)
    for j in jobs:
        reap_job(j, status, job_explanation=job_explanation)
