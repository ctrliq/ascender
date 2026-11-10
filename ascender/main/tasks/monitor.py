# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Keep a running job's output being read when the dispatcher that launched it goes away.

A dispatcher task that streams a job's output holds the job's JobMonitorLease and renews it
while it reads (see AWXReceptorJob). When the dispatcher stops gracefully the task detaches:
it stops reading, leaves the work unit and the pod it stands for running, and lets the lease
expire at once. When the process is killed, the lease expires by itself. Either way
sweep_job_monitors, which runs on every control node, claims the expired lease with one
compare-and-set on the job's celery_task_id and dispatches resume_job, which reads the rest
of the output from wherever it survived: the pod's log for a container group job, the
receptor work unit for anything else.

Nothing here decides from an instance's heartbeat that a job needs a new reader. The lease is
the single statement of who is reading a job, and an expired lease is the single reason to read
it elsewhere. What the sweep asks of the instance table is which node's receptor runs a unit
that cannot be read anywhere else, and whether that node is still around, so that such a job is
left to the one node that can read it.
"""

import logging
import re
import threading
import uuid

from django.db import DatabaseError, connection, transaction
from django.db.models import Case, Q, Value, When
from django.utils.timezone import now

from ascender.settings.typed import settings
from ascender.main.dispatch import get_task_queuename
from ascender.main.dispatch.publish import task
from ascender.main.models import Instance, InventoryUpdate, JobMonitorLease, LeaseLost, ProjectUpdate, UnifiedJob
from ascender.main.tasks.receptor import ReceptorUnitStream, get_receptor_ctl
from ascender.main.tasks.streams import PodLogStream, TERMINAL_PHASES, container_started_at, container_terminated, pod_created_at, pod_phase

logger = logging.getLogger('ascender.main.tasks.monitor')

__all__ = [
    'LeaseKeeper',
    'RESUME',
    'REQUEUE',
    'FAIL',
    'WAIT',
    'ResumePlan',
    'plan_resume',
    'requeue_job',
    'claim_job',
    'sweep_job_monitors',
    'resume_job',
    'job_can_detach',
    'local_unit_holder',
    'discard_abandoned_events',
    'can_requeue',
]

# What to do with a job whose monitor lease expired
RESUME = 'resume'  # read the rest of its output from where it survived
REQUEUE = 'requeue'  # it ran nothing, or its work repeats safely: back to pending
FAIL = 'fail'  # its output is gone for good
WAIT = 'wait'  # its output is not reachable yet; look again later

# A Go duration, which is what receptor takes: the two-letter units are tried before m and s
_DURATION_RE = re.compile(r'(\d+(?:\.\d+)?)(h|ms|us|µs|ns|m|s)')
_DURATION_UNITS = {'h': 3600, 'm': 60, 's': 1, 'ms': 1e-3, 'us': 1e-6, 'µs': 1e-6, 'ns': 1e-9}


def duration_seconds(value, default):
    """Seconds in a receptor (Go) duration such as '2h', '30m', '1h30m' or '1.5h'; default when unreadable."""
    if value is None or value == '':
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if re.fullmatch(r'\d+(\.\d+)?', text):
        return float(text)
    parts = _DURATION_RE.findall(text)
    if not parts or ''.join(number + unit for number, unit in parts) != text:
        return default
    return sum(float(number) * _DURATION_UNITS[unit] for number, unit in parts)


class ResumePlan:
    """
    What a resume does with a job, and with what.

    ``stream`` is the job's output where it was found, for RESUME, and also for any other
    action when the work is still there, so that a cancel can stop it. ``cleanup`` stops what
    is left of the work before a REQUEUE or a FAIL; it returns False when it could not.
    ``counts`` is whether a WAIT counts against JOB_MONITOR_MAX_DEFERRALS; one that a limit of
    its own ends does not.
    """

    def __init__(self, action, reason='', stream=None, follow=True, cleanup=None, counts=True):
        self.action = action
        self.reason = reason
        self.stream = stream
        self.follow = follow
        self.cleanup = cleanup
        self.counts = counts

    def __repr__(self):
        return f'ResumePlan({self.action}, {self.reason!r})'


def is_inline_sync(job):
    """A project sync that a job or an inventory update runs inside its own task before it starts."""
    return isinstance(job, ProjectUpdate) and job.launch_type == 'sync'


def job_can_repeat(job):
    """
    A project or inventory update run again from the start produces the same result. A
    playbook that ran partly does not, and neither does an ad hoc command or a system job.
    An inline project sync is never repeated on its own: it ran inside the task of the job
    that spawned it, and that job stopped with it.
    """
    if isinstance(job, ProjectUpdate):
        return not is_inline_sync(job)
    return isinstance(job, InventoryUpdate)


def can_requeue(job):
    """
    A job can go back to scheduling unless it was launched with passwords typed in at launch:
    those are removed from the job as it starts, and a second start would fail its pre-start
    check for want of them.
    """
    return not job.get_passwords_needed_to_start()


def requeue_or_fail(job, reason, **plan):
    """A REQUEUE plan for the job, or a FAIL plan with the same cleanup when it cannot be re-queued."""
    if can_requeue(job):
        return ResumePlan(REQUEUE, reason, **plan)
    return ResumePlan(FAIL, f'{reason}, and it cannot be run again without the passwords it was launched with', **plan)


def job_can_detach(job):
    """
    May the job's output be left for another task to read later?

    A project update may not. It works in the project's directory on its control node, under
    an exclusive lock on that directory held by the task that runs it, and the lock goes away
    with the task: a project update left running without it could be copied by jobs halfway
    through. A project update is stopped instead, and run again unless it is an inline sync.
    """
    return not isinstance(job, ProjectUpdate)


def local_unit_holder(job):
    """
    The control or hybrid node whose own receptor runs the job's work unit, or None.

    Work runs locally on the node that controls it when that node also executes it: the jobs of
    a hybrid node, and project updates on any control node. Only that node's receptor has such
    a unit. A unit on an execution or hop node can be adopted from any control node, and a
    container group pod can be read through the Kubernetes API from anywhere.
    """
    if job.is_container_group_task or not job.execution_node:
        return None
    if Instance.objects.filter(hostname=job.execution_node, node_type__in=(Instance.Types.CONTROL, Instance.Types.HYBRID)).exists():
        return job.execution_node
    return None


def holder_is_present(hostname):
    """
    Is the node whose own receptor runs a job's work unit there to read it, or about to be back?

    A ready node is. So is one that went unavailable less than the time its peers give a node
    that stops sending heartbeats before they declare it lost (see Instance.is_lost): a node marks
    itself unavailable as its dispatcher stops (inform_cluster_of_shutdown), before that
    dispatcher's tasks detach from their jobs, and is ready again once its dispatcher is back,
    while its receptor and the work units in it run on throughout. Only that node can read such a
    unit, so nobody else gives up on it while the node may still return.
    """
    holder = Instance.objects.filter(hostname=hostname).only('node_type', 'node_state', 'last_seen').first()
    if holder is None:
        return False
    if holder.node_state == Instance.States.READY:
        return True
    return holder.node_state == Instance.States.UNAVAILABLE and not holder.is_lost()


def discard_abandoned_events(job):
    """
    Delete the saved events of an attempt of the job that was given up; returns how many.

    The next attempt numbers its events from 1 again, under the same job, so they would collide
    with these on the event tables' unique (job, job_created, counter) constraint and be dropped
    as duplicates. The job's output is the attempt that produces its result, not a mix of both.
    """
    return job.get_event_queryset().delete()[0]


def requeue_job(job, reason, owner_task_id):
    """
    Hand the job back to the task manager as if it had never been dispatched; False when
    owner_task_id no longer owns the job, which is then left to the task that does.

    Only for a job that has run nothing, or whose work repeats safely. The node, the work
    unit and the task id are cleared along with the status, and the lease and the events the
    given-up attempt saved go with them, in the same transaction (see discard_abandoned_events);
    BaseTask.run deletes any that arrive after this, before the next attempt produces its own.
    The job starts over from scheduling, on whichever node has room.
    """
    explanation = f'The job was re-queued because {reason}.'
    with transaction.atomic():
        # The lease row first, then the job's, the order claim_job takes them in: the other order
        # deadlocks against a claim of the same job.
        list(JobMonitorLease.objects.select_for_update().filter(unified_job_id=job.pk).values_list('pk', flat=True))
        jobs = UnifiedJob.objects.filter(pk=job.pk, status='running')
        if owner_task_id:
            jobs = jobs.filter(celery_task_id=owner_task_id)
        updated = jobs.update(
            status='pending',
            controller_node='',
            execution_node='',
            work_unit_id='',
            celery_task_id='',
            started=None,
            job_explanation=explanation,
        )
        if not updated:
            return False
        JobMonitorLease.objects.finish(job)
        discarded = discard_abandoned_events(job)
    logger.warning(f'{job.log_format} re-queued because {reason}' + (f'; the {discarded} event(s) of the attempt given up are deleted' if discarded else ''))
    job.log_lifecycle('monitor_requeued')
    job.websocket_emit_status('pending')
    from ascender.main.tasks.jobs import ScheduleTaskManager  # circular import

    ScheduleTaskManager().schedule()
    return True


def claim_job(job, hostname):
    """
    Make this node the job's controller and a new task id its owner, provided nothing has
    changed the job since it was read. Returns the new task id, or None when the claim lost.

    The task id is the fence: the task that launched the job can no longer renew the lease,
    retire it or write its final status (see update_model), and cancels now reach the task
    dispatched under the new id on this node. The claim holds the lease row's lock and checks
    under it that the lease is still expired: a reader that renewed it since the sweep read it
    keeps the job, and one that retired it, being done with the job, finishes it.
    """
    task_id = str(uuid.uuid4())
    with transaction.atomic():
        lease = JobMonitorLease.objects.select_for_update().filter(unified_job_id=job.pk, expires__lt=now()).first()
        if lease is None:
            return None
        claimed = UnifiedJob.objects.filter(pk=job.pk, status='running', celery_task_id=job.celery_task_id).update(
            celery_task_id=task_id, controller_node=hostname
        )
        if not claimed:
            return None
        lease.expires = JobMonitorLease.objects.expiry()
        lease.save(update_fields=['expires', 'modified'])
    return task_id


class LeaseKeeper:
    """
    Renew a job's monitor lease from a thread, for as long as its owner is busy with something
    that has no renewal loop of its own: preparing to resume reading a job, which can mean
    finding its pod and building the host map of a large inventory. A claim leaves the new owner
    one lease to get its stream open; without this, setup that outlasts it hands the job to the
    next sweep before this task ever reads it, and setup that always does never lets anyone.

    ``lost`` is set when a renewal found that another task owns the job now.
    """

    def __init__(self, job, owner_task_id):
        self.job = job
        self.owner_task_id = owner_task_id
        self.lost = False
        # Read here: the settings wrapper is not for threads
        self._interval = settings.JOB_MONITOR_RENEW_SECONDS
        self._lease_seconds = settings.JOB_MONITOR_LEASE_SECONDS
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._renew, name=f'lease-keeper-{job.pk}', daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc_info):
        self._stop.set()
        self._thread.join()
        return False

    def _renew(self):
        try:
            while not self._stop.wait(self._interval):
                try:
                    JobMonitorLease.objects.renew(self.job, self.owner_task_id, seconds=self._lease_seconds)
                except LeaseLost:
                    self.lost = True
                    return
                except DatabaseError as exc:
                    logger.warning(f'{self.job.log_format}: could not renew its monitor lease: {exc}')
        finally:
            connection.close()


def retire_stale_leases():
    """
    Delete the expired leases of jobs that are no longer running.

    A lease normally goes with its job's final write. One is left behind when a job is
    cancelled while nobody is reading it, which marks it canceled at once, or when a task dies
    between its final write and removing the lease. Whatever is left of such a job's work is
    stopped by the pod and work unit reapers, which act on every job that is not running.
    """
    return JobMonitorLease.objects.filter(expires__lt=now()).exclude(unified_job__status='running').delete()[0]


@task(queue=get_task_queuename)
def sweep_job_monitors():
    """
    Claim the jobs whose monitor lease expired and resume reading their output on this node.

    Runs on every control node. Claims are compare-and-set, so two nodes sweeping the same
    lease at once cannot both take it. A job whose unit only one node's receptor has is left
    to that node while it is up. Every other job is taken only by an enabled node with control
    capacity to spare, since a resumed job occupies a dispatcher worker for the rest of its
    run; this node's own jobs are already counted in its capacity, and it always takes them back.
    """
    retired = retire_stale_leases()
    if retired:
        logger.info(f'Job monitor sweep removed {retired} lease(s) of jobs that are no longer running')
    expired = JobMonitorLease.objects.expired()
    if not expired.exists():
        return 0
    try:
        me = Instance.objects.me()
    except RuntimeError:
        logger.warning('Job monitor sweep skipped: this node has no instance record yet')
        return 0
    if me.node_state != Instance.States.READY or me.node_type not in (Instance.Types.CONTROL, Instance.Types.HYBRID):
        logger.debug(f'Job monitor sweep skipped on {me.hostname}: not a ready control node')
        return 0
    # This node's own jobs come first. It takes them back whatever its capacity, so a batch of the
    # oldest leases, all of jobs it may not take, must not keep it from ever reaching its own.
    own = Q(unified_job__controller_node=me.hostname) | Q(unified_job__execution_node=me.hostname)
    expired = list(expired.annotate(theirs=Case(When(own, then=Value(0)), default=Value(1))).order_by('theirs', 'expires')[: settings.JOB_MONITOR_SWEEP_BATCH])

    claimed_ct = 0
    out_of_capacity = False
    for lease in expired:
        job = lease.unified_job
        holder = local_unit_holder(job)
        if holder and holder != me.hostname and holder_is_present(holder):
            # Only that node's receptor has the unit, and its own sweep resumes the job
            continue
        if job.controller_node != me.hostname and holder != me.hostname:
            if not me.enabled or out_of_capacity:
                continue
            if me.remaining_capacity < settings.ASCENDER_CONTROL_NODE_TASK_IMPACT:
                out_of_capacity = True
                logger.info(f'Job monitor sweep on {me.hostname}: no control capacity left for the jobs of other nodes; a peer or a later sweep takes them')
                continue
        former = job.controller_node or 'nobody'
        task_id = claim_job(job, me.hostname)
        if task_id is None:
            continue
        resume_job.apply_async([job.pk], {'task_id': task_id}, queue=get_task_queuename(), uuid=task_id)
        claimed_ct += 1
        logger.warning(f'{job.log_format}: monitor lease held by {former} expired at {lease.expires:%H:%M:%S}; {me.hostname} is resuming it as task {task_id}')
    return claimed_ct


@task(queue=get_task_queuename)
def resume_job(job_id, task_id):
    """Resume reading a job's output on this node, as the task that claimed it."""
    try:
        job = UnifiedJob.objects.get(pk=job_id)
    except UnifiedJob.DoesNotExist:
        logger.info(f'resume_job: unified job {job_id} no longer exists')
        return
    if job.status != 'running':
        logger.info(f'resume_job: {job.log_format} is {job.status}, nothing to resume')
        return
    if job.celery_task_id != task_id:
        logger.info(f'resume_job: {job.log_format} was claimed again by task {job.celery_task_id}; task {task_id} stands down')
        return
    task_cls = job._get_task_class()
    task_cls().resume(job.pk, task_id)


def plan_resume(job, lease, receptor_ctl=None):
    """Decide how a job whose lease expired can be picked up here."""
    if lease.deferrals >= settings.JOB_MONITOR_MAX_DEFERRALS:
        return ResumePlan(FAIL, f'its output stayed unreachable through {lease.deferrals} attempts to resume it')
    if job.is_container_group_task and not getattr(job.instance_group, 'mesh_node_id', None):
        return _plan_container_group(job, lease)
    return _plan_receptor(job, lease, receptor_ctl)


def _plan_container_group(job, lease):
    """
    The pod outlives the control pod that created it, and its log is the output. Kubernetes is
    the rendezvous: the pod's phase and its worker container's state say what can be read.
    """
    stream = PodLogStream(job, pod_name=lease.pod_name, namespace=lease.pod_namespace)
    try:
        pod = stream.find_pod()
    except Exception:
        logger.exception(f'{job.log_format}: could not look up its pod; trying again later')
        return ResumePlan(WAIT, 'its pod could not be looked up')
    if pod is None:
        if lease.worker_started:
            return ResumePlan(FAIL, 'its pod no longer exists')
        return requeue_or_fail(job, 'its pod no longer exists and it had not started running')

    phase = pod_phase(pod)
    if container_terminated(pod) is not None or phase in TERMINAL_PHASES:
        return ResumePlan(RESUME, 'its pod has finished; its log holds the output', stream=stream, follow=False)

    reference = now()
    if phase == 'Pending':
        # The worker container has not started, so there is no log yet, and asking for one is an error.
        created = pod_created_at(pod)
        limit = duration_seconds(settings.ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT, 7200)
        if created and (reference - created).total_seconds() > limit:
            # What receptor does with a pod that stays pending: the job fails
            return ResumePlan(FAIL, f'its pod did not start within {int(limit)} seconds', stream=stream, cleanup=stream.delete_pod)
        # Bounded by the pending timeout above, which may well be longer than all the deferrals together
        return ResumePlan(WAIT, 'its pod is still pending', stream=stream, counts=False)

    if lease.worker_started:
        return ResumePlan(RESUME, 'its pod is still running', stream=stream, follow=True)
    try:
        if stream.has_output():
            return ResumePlan(RESUME, 'its pod is running and producing output', stream=stream, follow=True)
    except Exception as exc:
        logger.warning(f'{job.log_format}: could not read the log of pod {stream.pod_name}: {exc}; trying again later')
        return ResumePlan(WAIT, 'its pod log could not be read', stream=stream)

    # Live and silent. ansible-runner worker reads its payload from stdin before it runs anything,
    # and the stdin stream came from the controller that died: a pod that has been running for a
    # while without output is waiting for a payload that will never finish arriving.
    started = container_started_at(pod)
    if started and (reference - started).total_seconds() > settings.JOB_MONITOR_WEDGE_SECONDS:
        return requeue_or_fail(job, 'its pod never received its payload', stream=stream, cleanup=stream.delete_pod)
    return ResumePlan(WAIT, 'its pod has not produced output yet', stream=stream)


def _plan_receptor(job, lease, receptor_ctl=None):
    """
    A work unit survives on the node that ran it: this node's own receptor when only the
    dispatcher restarted, or an execution node, which keeps the unit until it is released.
    A unit that lived in a control pod that is gone cannot be read anywhere.
    """
    unit_id = job.work_unit_id
    if not unit_id:
        return requeue_or_fail(job, 'it had not been handed to receptor yet')
    if receptor_ctl is None:
        receptor_ctl = get_receptor_ctl()

    stream = ReceptorUnitStream(job, receptor_ctl, unit_id)
    try:
        known_here = stream.is_known()
    except Exception as exc:
        logger.warning(f'{job.log_format}: could not ask receptor about work unit {unit_id}: {exc}; trying again later')
        return ResumePlan(WAIT, 'receptor could not be asked about its work unit')

    if known_here:
        if not job_can_detach(job):
            return _unit_given_up(job, lease, 'a project update is not resumed without the lock on its project', cleanup=stream.discard, stream=stream)
        return ResumePlan(RESUME, f'its work unit {unit_id} is known to this node', stream=stream)

    holder = local_unit_holder(job)
    if holder and holder != settings.CLUSTER_HOST_ID and holder_is_present(holder):
        return ResumePlan(WAIT, f'its work unit runs on {holder}, which reads it itself once its dispatcher is back')

    node = job.execution_node
    if not holder and node and node != settings.CLUSTER_HOST_ID and job_can_detach(job):
        node_is_up = Instance.objects.filter(
            hostname=node, node_type__in=(Instance.Types.EXECUTION, Instance.Types.HOP), node_state=Instance.States.READY
        ).exists()
        if node_is_up:
            stream = ReceptorUnitStream(job, receptor_ctl, unit_id, node=node)
            try:
                stream.adopt()
            except Exception as exc:
                logger.warning(f'{job.log_format}: could not adopt work unit {unit_id} from {node}: {exc}; trying again later')
                return ResumePlan(WAIT, f'its work unit on {node} could not be adopted yet')
            return ResumePlan(RESUME, f'its work unit {unit_id} was adopted from {node}', stream=stream)

    return _unit_given_up(job, lease, 'its work unit was lost with its controller')


def _unit_given_up(job, lease, reason, cleanup=None, stream=None):
    """Re-queue a job whose work cannot be read, when that is safe; fail it otherwise."""
    if is_inline_sync(job):
        return ResumePlan(FAIL, f'{reason}, and an inline project sync is not run again without the job that started it', stream=stream, cleanup=cleanup)
    if not lease.worker_started:
        return requeue_or_fail(job, f'{reason}, before its execution environment received its payload', stream=stream, cleanup=cleanup)
    if job_can_repeat(job):
        return requeue_or_fail(job, f'{reason}, and this kind of job can be run again', stream=stream, cleanup=cleanup)
    return ResumePlan(FAIL, f'{reason}, and a partly run job cannot be repeated', stream=stream, cleanup=cleanup)
