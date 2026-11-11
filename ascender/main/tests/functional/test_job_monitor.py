"""
The job monitor lease: who reads a running job's output, and what happens when they stop.

These run against the database with transaction=True where a stream is actually read, because
ansible-runner's process streamer runs in a thread with its own connection.
"""

import concurrent.futures
import fcntl
import io
import json
import os
import subprocess
import sys
import threading
import time
from datetime import timedelta
from unittest import mock
import uuid

import pytest

from django.db import OperationalError, connection, transaction
from django.utils.timezone import now

from ascender.main.dispatch import reaper
from ascender.main.models import Instance, Job, JobEvent, JobMonitorLease, LeaseLost, ProjectUpdate, UnifiedJob
from ascender.main.tasks import monitor
from ascender.main.tasks.callback import RunnerCallback, persisted_event_counters
from ascender.main.tasks.jobs import RunJob, RunProjectUpdate
from ascender.main.tasks.monitor import FAIL, REQUEUE, RESUME, WAIT, LeaseKeeper, ResumePlan, claim_job, plan_resume, requeue_job, sweep_job_monitors
from ascender.main.tasks.receptor import AWXReceptorJob, _PhaseResult
from ascender.main.tasks.signals import signal_state
from ascender.main.tasks.streams import PodLogIncomplete
from ascender.main.utils.update_model import NotOwner, update_model


@pytest.fixture(autouse=True)
def _disable_database_settings(mocker):
    """
    The process streamer runs in a thread that re-initializes the settings wrapper
    (cleanup_new_process). Under pytest-django's settings override that wraps an already
    wrapped settings object, and the first logger call in that thread then recurses through
    the two wrappers. test_dispatch.py keeps database-backed settings out of the way the
    same way.
    """
    m = mocker.patch('ascender.conf.settings.SettingsWrapper.all_supported_settings', new_callable=mock.PropertyMock)
    m.return_value = []


@pytest.fixture
def me(settings):
    """A saved, ready control node for this process, which the sweep claims jobs for."""
    return Instance.objects.create(hostname=settings.CLUSTER_HOST_ID, node_type='hybrid', node_state='ready', capacity=100, enabled=True)


def running_job(**kwargs):
    fields = dict(status='running', controller_node='dead-node', execution_node='', celery_task_id=str(uuid.uuid4()), work_unit_id='unit1', started=now())
    fields.update(kwargs)
    return Job.objects.create(**fields)


def leased(job, expired=True, **fields):
    lease = JobMonitorLease.objects.start(job, **fields)
    if expired:
        JobMonitorLease.objects.filter(pk=lease.pk).update(expires=now() - timedelta(seconds=1))
        lease.refresh_from_db()
    return lease


# -- the lease itself ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_lease_renewal_is_fenced_by_the_task_id():
    job = running_job()
    lease = JobMonitorLease.objects.start(job)
    assert lease.expires > now()
    JobMonitorLease.objects.renew(job, job.celery_task_id)
    with pytest.raises(LeaseLost):
        JobMonitorLease.objects.renew(job, 'someone-else')
    JobMonitorLease.objects.release(job, job.celery_task_id)
    lease.refresh_from_db()
    assert lease.expires <= now()
    assert JobMonitorLease.objects.finish(job) == 1
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()


@pytest.mark.django_db
def test_a_former_owner_can_neither_expire_nor_put_off_the_lease(me):
    """A task that detaches or waits after its job was claimed must not touch the claimer's lease."""
    job = running_job()
    leased(job)
    former = job.celery_task_id
    claimed = claim_job(job, me.hostname)
    before = JobMonitorLease.objects.get(unified_job=job)
    assert JobMonitorLease.objects.release(job, former) == 0
    assert JobMonitorLease.objects.defer(job, 30, former) == 0
    after = JobMonitorLease.objects.get(unified_job=job)
    assert (after.expires, after.deferrals) == (before.expires, before.deferrals)
    assert JobMonitorLease.objects.defer(job, 30, claimed) == 1


@pytest.mark.django_db
def test_retirement_is_refused_to_a_task_that_lost_the_job(me):
    job = running_job()
    leased(job)
    former = job.celery_task_id
    claimed = claim_job(job, me.hostname)
    assert JobMonitorLease.objects.retire(job, former) is False
    assert JobMonitorLease.objects.filter(unified_job=job).exists()
    assert JobMonitorLease.objects.retire(job, claimed) is True
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()


@pytest.mark.django_db
def test_a_claim_loses_to_a_renewal_or_a_retirement_since_the_sweep_read_the_lease(me):
    """The sweep reads expired leases first and claims each after; the reader may have renewed or retired it in between."""
    renewed = running_job()
    leased(renewed)
    stale = Job.objects.get(pk=renewed.pk)
    JobMonitorLease.objects.renew(renewed, renewed.celery_task_id)
    assert claim_job(stale, me.hostname) is None

    retired = running_job(work_unit_id='unit2')
    leased(retired)
    stale = Job.objects.get(pk=retired.pk)
    assert JobMonitorLease.objects.retire(retired, retired.celery_task_id) is True
    assert claim_job(stale, me.hostname) is None
    assert Job.objects.get(pk=retired.pk).celery_task_id == retired.celery_task_id


def in_a_thread_with_its_own_connection(fn):
    def run():
        try:
            return fn()
        finally:
            connection.close()

    return run


@pytest.mark.django_db(transaction=True)
def test_a_retirement_waits_for_a_claim_in_progress_and_sees_it():
    """The lease row is the lock: a reader finishing as a claim lands can neither remove the claimer's lease nor release its work."""
    job = running_job()
    leased(job)
    locked, commit = threading.Event(), threading.Event()

    @in_a_thread_with_its_own_connection
    def claim_in_progress():
        with transaction.atomic():
            JobMonitorLease.objects.select_for_update().filter(unified_job_id=job.pk).first()
            UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='the-claimer')
            locked.set()
            commit.wait(10)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        claimer = pool.submit(claim_in_progress)
        assert locked.wait(10)
        retirement = pool.submit(in_a_thread_with_its_own_connection(lambda: JobMonitorLease.objects.retire(job, job.celery_task_id)))
        with pytest.raises(concurrent.futures.TimeoutError):
            retirement.result(timeout=0.5)
        commit.set()
        claimer.result(timeout=10)
        assert retirement.result(timeout=10) is False
    assert JobMonitorLease.objects.filter(unified_job_id=job.pk).exists()


@pytest.mark.django_db(transaction=True)
def test_a_claim_waits_for_a_retirement_in_progress_and_finds_nothing_to_claim(me):
    job = running_job()
    leased(job)
    locked, commit = threading.Event(), threading.Event()

    @in_a_thread_with_its_own_connection
    def retirement_in_progress():
        with transaction.atomic():
            JobMonitorLease.objects.select_for_update().filter(unified_job_id=job.pk).first()
            JobMonitorLease.objects.filter(unified_job_id=job.pk).delete()
            locked.set()
            commit.wait(10)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        retirer = pool.submit(retirement_in_progress)
        assert locked.wait(10)
        claim = pool.submit(in_a_thread_with_its_own_connection(lambda: claim_job(job, me.hostname)))
        with pytest.raises(concurrent.futures.TimeoutError):
            claim.result(timeout=0.5)
        commit.set()
        retirer.result(timeout=10)
        assert claim.result(timeout=10) is None
    assert Job.objects.get(pk=job.pk).celery_task_id == job.celery_task_id


@pytest.mark.django_db
def test_claim_is_compare_and_set(me):
    job = running_job()
    leased(job)
    stale_read = Job.objects.get(pk=job.pk)
    task_id = claim_job(job, me.hostname)
    assert task_id
    job.refresh_from_db()
    assert job.celery_task_id == task_id
    assert job.controller_node == me.hostname
    assert job.monitor_lease.expires > now()
    # a second claim from the same read loses
    assert claim_job(stale_read, 'another-node') is None
    job.refresh_from_db()
    assert job.controller_node == me.hostname


@pytest.mark.django_db
def test_sweep_claims_only_expired_leases_of_running_jobs(me):
    expired = running_job()
    leased(expired)
    live = running_job(work_unit_id='unit2')
    leased(live, expired=False)
    finished = running_job(work_unit_id='unit3')
    leased(finished)
    UnifiedJob.objects.filter(pk=finished.pk).update(status='successful')

    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 1
    dispatch.assert_called_once()
    args, kwargs = dispatch.call_args
    expired.refresh_from_db()
    assert args == ([expired.pk], {'task_id': expired.celery_task_id})
    assert kwargs['uuid'] == expired.celery_task_id
    assert expired.controller_node == me.hostname
    live.refresh_from_db()
    assert live.controller_node == 'dead-node'


@pytest.mark.django_db
def test_sweep_sees_each_job_as_its_own_type(me):
    """Through its lease a job is a plain UnifiedJob, which is never a container group task and logs as 'unified_job N'."""
    job = running_job()
    leased(job)
    seen = []

    def holder(candidate):
        seen.append(candidate)
        return None

    with mock.patch.object(monitor, 'local_unit_holder', side_effect=holder), mock.patch.object(monitor.resume_job, 'apply_async'):
        assert sweep_job_monitors() == 1
    assert [type(candidate) for candidate in seen] == [Job]


@pytest.mark.django_db
def test_sweep_stops_at_control_capacity(me):
    me.capacity = 1
    me.save()
    first, second = running_job(), running_job(work_unit_id='unit2')
    leased(first)
    leased(second)
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 1
    assert dispatch.call_count == 1
    assert Job.objects.filter(controller_node=me.hostname).count() == 1


@pytest.mark.django_db
def test_a_full_node_reaches_its_own_jobs_behind_a_batch_of_others_it_cannot_take(me, settings):
    """The batch is the oldest expired leases; if they are all another node's, this node's own must still come first."""
    settings.JOB_MONITOR_SWEEP_BATCH = 2
    me.capacity = 0
    me.save()
    foreign = [running_job(work_unit_id=f'foreign{i}') for i in range(2)]
    for job in foreign:
        lease = leased(job)
        JobMonitorLease.objects.filter(pk=lease.pk).update(expires=now() - timedelta(minutes=5))
    own = running_job(controller_node=me.hostname, work_unit_id='own')
    leased(own)
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 1
    assert dispatch.call_args.args[0] == [own.pk]


@pytest.mark.django_db
def test_sweep_declines_on_a_node_that_is_not_ready(me):
    me.node_state = 'unavailable'
    me.save()
    job = running_job()
    leased(job)
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 0
    dispatch.assert_not_called()


@pytest.mark.django_db
def test_a_disabled_node_takes_back_only_its_own_jobs(me):
    """Disabling a node stops new work going to it; reading the jobs it already runs is not new work."""
    me.enabled = False
    me.save()
    foreign = running_job()
    leased(foreign)
    own = running_job(controller_node=me.hostname, work_unit_id='unit2')
    leased(own)
    own_task, foreign_task = own.celery_task_id, foreign.celery_task_id
    with mock.patch.object(monitor.resume_job, 'apply_async'):
        assert sweep_job_monitors() == 1
    own.refresh_from_db()
    foreign.refresh_from_db()
    assert own.celery_task_id != own_task
    assert foreign.celery_task_id == foreign_task and foreign.controller_node == 'dead-node'


@pytest.mark.django_db
def test_a_full_node_still_takes_back_its_own_jobs(me):
    """A node's own detached jobs count against its capacity already; reclaiming them changes nothing."""
    me.capacity = 2
    me.save()
    own = [running_job(controller_node=me.hostname, work_unit_id=f'own{i}') for i in range(3)]
    for job in own:
        leased(job)
    foreign = running_job()
    leased(foreign)
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 3
    assert {c.args[0][0] for c in dispatch.call_args_list} == {job.pk for job in own}
    foreign.refresh_from_db()
    assert foreign.controller_node == 'dead-node'


@pytest.mark.django_db
def test_sweep_leaves_a_unit_to_the_live_node_that_runs_it(me):
    """Local work on a hybrid or control node can only be read through that node's own receptor."""
    peer = Instance.objects.create(hostname='hybrid-2', node_type='hybrid', node_state='ready', capacity=100)
    job = running_job(controller_node='hybrid-2', execution_node='hybrid-2')
    leased(job, worker_started=True)
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 0
    dispatch.assert_not_called()
    # A node marks itself unavailable as its dispatcher stops, before its tasks detach, and is ready
    # again once the dispatcher is back; its receptor runs the unit throughout, so it is left the job.
    peer.mark_offline(update_last_seen=True, errors='Instance received normal shutdown signal')
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 0
    dispatch.assert_not_called()
    # once that node is gone, any node takes the job, to re-queue or fail it
    Instance.objects.filter(pk=peer.pk).update(last_seen=now() - timedelta(minutes=10))
    with mock.patch.object(monitor.resume_job, 'apply_async') as dispatch:
        assert sweep_job_monitors() == 1


@pytest.mark.django_db
def test_sweep_retires_leases_of_jobs_no_longer_running(me):
    canceled = running_job()
    leased(canceled)
    UnifiedJob.objects.filter(pk=canceled.pk).update(status='canceled')
    fresh = running_job(work_unit_id='unit2')
    leased(fresh, expired=False)
    UnifiedJob.objects.filter(pk=fresh.pk).update(status='successful')
    with mock.patch.object(monitor.resume_job, 'apply_async'):
        sweep_job_monitors()
    assert not JobMonitorLease.objects.filter(unified_job=canceled).exists()
    # a lease that is still current belongs to a task finishing the job right now
    assert JobMonitorLease.objects.filter(unified_job=fresh).exists()


# -- the reapers leave leased jobs alone --------------------------------------------------------


@pytest.mark.django_db
def test_startup_reaping_skips_leased_jobs(settings):
    plain = running_job(controller_node=settings.CLUSTER_HOST_ID, work_unit_id='')
    monitored = running_job(controller_node=settings.CLUSTER_HOST_ID)
    leased(monitored)
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'):
        reaper.startup_reaping()
    plain.refresh_from_db()
    monitored.refresh_from_db()
    assert plain.status == 'failed'
    assert monitored.status == 'running'


@pytest.mark.django_db
def test_lost_instance_reap_skips_leased_jobs():
    lost = Instance.objects.create(hostname='dead-node', node_type='control', node_state='unavailable')
    plain = running_job(work_unit_id='')
    monitored = running_job()
    leased(monitored)
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'):
        reaper.reap(lost, job_explanation='Job reaped due to instance shutdown')
    plain.refresh_from_db()
    monitored.refresh_from_db()
    assert plain.status == 'failed'
    assert monitored.status == 'running'


@pytest.mark.django_db
def test_reaping_a_lost_hybrid_node_leaves_a_claimed_local_job_to_its_claimer():
    """The peer that claimed it re-queues or fails it within moments; the heartbeat reaping the lost node must not fail it first."""
    lost = Instance.objects.create(hostname='hybrid-2', node_type='hybrid', node_state='unavailable')
    claimed = running_job(controller_node='live-node', execution_node='hybrid-2')
    leased(claimed, expired=False)
    plain = running_job(controller_node='hybrid-2', execution_node='hybrid-2', work_unit_id='')
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'):
        reaper.reap(lost, job_explanation='Job reaped due to instance shutdown')
    claimed.refresh_from_db()
    plain.refresh_from_db()
    assert claimed.status == 'running'
    assert plain.status == 'failed'


@pytest.mark.django_db
def test_lost_execution_node_reap_still_reaps_leased_jobs():
    # The controller is alive and renewing the lease, so no sweep would ever take the job, and
    # receptor waits for a lost execution node indefinitely: the job is reaped as it always was.
    lost = Instance.objects.create(hostname='exec-1', node_type='execution', node_state='unavailable')
    monitored = running_job(controller_node='live-node', execution_node='exec-1')
    leased(monitored, expired=False)
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'):
        reaper.reap(lost, job_explanation='Job reaped due to instance shutdown')
    monitored.refresh_from_db()
    assert monitored.status == 'failed'


@pytest.mark.django_db
def test_orphan_reaper_skips_leased_jobs_only_when_their_controller_is_gone():
    from ascender.main.scheduler import TaskManager

    Instance.objects.create(hostname='live-node', node_type='control', node_state='ready')
    # local work of a deprovisioned control node: its lease lapses, and the sweep re-queues or fails it
    local = running_job(controller_node='gone-node', execution_node='gone-node')
    leased(local)
    # work on an execution node that is no longer registered, read by a live controller
    remote = running_job(controller_node='live-node', execution_node='exec-gone')
    leased(remote, expired=False)
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'):
        TaskManager().reap_jobs_from_orphaned_instances()
    local.refresh_from_db()
    remote.refresh_from_db()
    assert local.status == 'running'
    assert remote.status == 'failed'


# -- the final write is fenced ------------------------------------------------------------------


@pytest.mark.django_db
def test_update_model_refuses_a_former_owner():
    job = running_job()
    owner = job.celery_task_id
    assert update_model(Job, job.pk, owner_task_id=owner, status='successful').status == 'successful'
    UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='newer', status='running')
    with pytest.raises(NotOwner):
        update_model(Job, job.pk, owner_task_id=owner, status='failed')
    job.refresh_from_db()
    assert job.status == 'running'


# -- what a resume decides ----------------------------------------------------------------------


class FakePodStream:
    kind = 'pod'

    def __init__(self, pod, output=True):
        self.pod = pod
        self.output = output
        self.pod_name = pod['metadata']['name'] if pod else ''
        self.deleted = False
        self.follow = True

    def find_pod(self):
        return self.pod

    def has_output(self):
        if self.pod['status']['phase'] == 'Pending':
            raise AssertionError('the log of a pending pod is an error from the API, and must not be asked for')
        return self.output

    def delete_pod(self):
        self.deleted = True
        return True


def pod(phase='Running', terminated=None, started_at=None, created_at=None):
    state = {}
    if terminated is not None:
        state['terminated'] = terminated
    elif started_at is not None:
        state['running'] = {'started_at': started_at}
    return {
        'metadata': {'name': 'automation-job-1-abcde', 'namespace': 'ascender', 'creation_timestamp': created_at or now()},
        'spec': {'containers': [{'name': 'worker'}]},
        'status': {'phase': phase, 'container_statuses': [{'name': 'worker', 'state': state}]},
    }


@pytest.fixture
def container_group_job(default_instance_group, kube_credential):
    default_instance_group.credential = kube_credential
    default_instance_group.is_container_group = True
    default_instance_group.save()
    return running_job(instance_group=default_instance_group)


@pytest.mark.django_db
@pytest.mark.parametrize(
    'make_pod,worker_started,output,expected',
    [
        (lambda: None, True, False, FAIL),
        (lambda: None, False, False, REQUEUE),
        (lambda: pod(terminated={'exit_code': 0}), False, False, RESUME),
        (lambda: pod(started_at=now()), True, False, RESUME),
        (lambda: pod(started_at=now()), False, True, RESUME),
        (lambda: pod(started_at=now()), False, False, WAIT),
        (lambda: pod(started_at=now() - timedelta(seconds=600)), False, False, REQUEUE),
        (lambda: pod(phase='Pending'), False, False, WAIT),
        (lambda: pod(phase='Pending', created_at=now() - timedelta(hours=3)), False, False, FAIL),
    ],
)
def test_container_group_plan(container_group_job, make_pod, worker_started, output, expected):
    # the pod is built here, not at collection time: a "just started" pod must still be young when the test runs
    the_pod = make_pod()
    lease = leased(container_group_job, worker_started=worker_started, pod_name='automation-job-1-abcde', pod_namespace='ascender')
    fake = FakePodStream(the_pod, output=output)
    with mock.patch.object(monitor, 'PodLogStream', return_value=fake):
        plan = plan_resume(container_group_job, lease)
    assert plan.action == expected, plan.reason
    if expected == RESUME:
        assert plan.stream is fake
        assert plan.follow is (
            the_pod['status']['phase'] not in ('Succeeded', 'Failed') and the_pod['status']['container_statuses'][0]['state'].get('terminated') is None
        )
    if expected in (REQUEUE, FAIL) and the_pod is not None:
        assert plan.cleanup == fake.delete_pod
    if the_pod is not None:
        # a cancel stops the pod through the plan, whatever the plan is
        assert plan.stream is fake


@pytest.mark.django_db(transaction=True)
def test_a_pending_pod_is_waited_for_until_its_own_timeout_not_the_deferral_budget(container_group_job, me, quiet_websockets):
    """A pod may stay pending for ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT, longer than all the deferrals together."""
    lease = leased(container_group_job, pod_name='automation-job-1-abcde', pod_namespace='ascender')
    task_id = claim_job(container_group_job, me.hostname)
    with mock.patch.object(monitor, 'PodLogStream', return_value=FakePodStream(pod(phase='Pending'))):
        plan = plan_resume(container_group_job, lease)
        assert (plan.action, plan.counts) == (WAIT, False)
        RunJob().resume(container_group_job.pk, task_id)
    lease.refresh_from_db()
    assert lease.deferrals == 0
    assert lease.expires > now()


@pytest.mark.django_db
def test_plan_gives_up_after_too_many_deferrals(container_group_job, settings):
    settings.JOB_MONITOR_MAX_DEFERRALS = 3
    lease = leased(container_group_job)
    JobMonitorLease.objects.filter(pk=lease.pk).update(deferrals=3)
    lease.refresh_from_db()
    assert plan_resume(container_group_job, lease).action == FAIL


class FakeReceptorStream:
    kind = 'receptor'

    def __init__(self, known, adoptable=True):
        self.known = known
        self.adoptable = adoptable
        self.adopted = False
        self.discarded = False

    def is_known(self):
        if isinstance(self.known, Exception):
            raise self.known
        return self.known

    def adopt(self):
        if not self.adoptable:
            raise RuntimeError('no route to node')
        self.adopted = True

    def discard(self):
        self.discarded = True
        return True


def fake_receptor_streams(known_locally, adoptable=True):
    def factory(job, receptor_ctl, unit_id, node=None, config_data=None):
        if node is None:
            return FakeReceptorStream(known_locally)
        stream = FakeReceptorStream(True, adoptable=adoptable)
        stream.node = node
        return stream

    return factory


@pytest.mark.django_db
def test_receptor_plan_resumes_a_unit_this_node_knows():
    job = running_job()
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(True)):
        plan = plan_resume(job, lease, receptor_ctl=mock.Mock())
    assert plan.action == RESUME


@pytest.mark.django_db
def test_receptor_plan_adopts_from_a_live_execution_node():
    Instance.objects.create(hostname='exec-1', node_type='execution', node_state='ready', capacity=10)
    job = running_job(execution_node='exec-1')
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False)):
        plan = plan_resume(job, lease, receptor_ctl=mock.Mock())
    assert plan.action == RESUME
    assert plan.stream.adopted and plan.stream.node == 'exec-1'


@pytest.mark.django_db
def test_receptor_plan_waits_for_an_execution_node_that_is_unavailable_but_not_lost():
    """Its receptor may still be running the unit: failing or re-queueing the job now could leave its work running."""
    node = Instance.objects.create(hostname='exec-1', node_type='execution', node_state='ready', capacity=10)
    node.mark_offline(update_last_seen=True, errors='health check failed')
    job = running_job(execution_node='exec-1')
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False)):
        plan = plan_resume(job, lease, receptor_ctl=mock.Mock())
        assert (plan.action, plan.counts) == (WAIT, True), plan.reason
        # once its peers would declare it lost, the unit is given up as before
        Instance.objects.filter(pk=node.pk).update(last_seen=now() - timedelta(minutes=10))
        assert plan_resume(job, lease, receptor_ctl=mock.Mock()).action == FAIL


@pytest.mark.django_db
def test_receptor_plan_waits_when_adoption_fails():
    Instance.objects.create(hostname='exec-1', node_type='execution', node_state='ready', capacity=10)
    job = running_job(execution_node='exec-1')
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False, adoptable=False)):
        plan = plan_resume(job, lease, receptor_ctl=mock.Mock())
    assert plan.action == WAIT


@pytest.mark.django_db
def test_receptor_plan_for_a_unit_that_died_with_its_controller():
    job = running_job(execution_node='dead-node')
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False)):
        assert plan_resume(job, leased(job, worker_started=False), receptor_ctl=mock.Mock()).action == REQUEUE
        assert plan_resume(job, leased(job, worker_started=True), receptor_ctl=mock.Mock()).action == FAIL
        unsubmitted = running_job(work_unit_id='')
        assert plan_resume(unsubmitted, leased(unsubmitted), receptor_ctl=mock.Mock()).action == REQUEUE


@pytest.mark.django_db
def test_receptor_plan_waits_when_receptor_cannot_be_asked():
    """A socket error is not an answer: the unit may be there, and failing the job on it would be a guess."""
    job = running_job()
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(ConnectionRefusedError('receptor is restarting'))):
        assert plan_resume(job, lease, receptor_ctl=mock.Mock()).action == WAIT


@pytest.mark.django_db
def test_receptor_plan_leaves_local_work_to_the_node_that_runs_it():
    peer = Instance.objects.create(hostname='hybrid-2', node_type='hybrid', node_state='ready', capacity=100)
    job = running_job(controller_node='hybrid-2', execution_node='hybrid-2')
    lease = leased(job, worker_started=True)
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False)):
        assert plan_resume(job, lease, receptor_ctl=mock.Mock()).action == WAIT
        # restarting its dispatcher: unavailable, but back before its peers would declare it lost
        peer.mark_offline(update_last_seen=True, errors='Instance received normal shutdown signal')
        assert plan_resume(job, lease, receptor_ctl=mock.Mock()).action == WAIT
        Instance.objects.filter(pk=peer.pk).update(last_seen=now() - timedelta(minutes=10))
        assert plan_resume(job, lease, receptor_ctl=mock.Mock()).action == FAIL


@pytest.mark.django_db
def test_a_project_update_is_never_resumed(project):
    """Its unit is stopped and the update run again, or failed when it is an inline sync, rather than read without the project lock."""
    pu = ProjectUpdate.objects.create(
        project=project, status='running', controller_node='dead-node', execution_node='dead-node', celery_task_id='t', work_unit_id='u', launch_type='manual'
    )
    sync = ProjectUpdate.objects.create(
        project=project, status='running', controller_node='dead-node', execution_node='dead-node', celery_task_id='t2', work_unit_id='u2', launch_type='sync'
    )
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(True)):
        plan = plan_resume(pu, leased(pu, worker_started=True), receptor_ctl=mock.Mock())
        assert plan.action == REQUEUE and plan.cleanup is not None
        assert plan.cleanup() and plan.stream.discarded
        assert plan_resume(sync, leased(sync, worker_started=True), receptor_ctl=mock.Mock()).action == FAIL


@pytest.mark.django_db
def test_a_job_launched_with_passwords_is_failed_rather_than_re_queued():
    """Passwords typed in at launch are removed as the job starts; a second start would fail for want of them."""
    unsubmitted = running_job(work_unit_id='')
    with mock.patch.object(Job, 'get_passwords_needed_to_start', return_value=['ssh_password']):
        plan = plan_resume(unsubmitted, leased(unsubmitted), receptor_ctl=mock.Mock())
    assert plan.action == FAIL
    assert 'passwords it was launched with' in plan.reason


@pytest.mark.django_db
def test_receptor_plan_repeats_a_project_update(project):
    pu = ProjectUpdate.objects.create(
        project=project, status='running', controller_node='dead-node', execution_node='dead-node', celery_task_id='t', work_unit_id='u', launch_type='manual'
    )
    sync = ProjectUpdate.objects.create(
        project=project, status='running', controller_node='dead-node', execution_node='dead-node', celery_task_id='t2', work_unit_id='u2', launch_type='sync'
    )
    with mock.patch.object(monitor, 'ReceptorUnitStream', side_effect=fake_receptor_streams(False)):
        assert plan_resume(pu, leased(pu, worker_started=True), receptor_ctl=mock.Mock()).action == REQUEUE
        assert plan_resume(sync, leased(sync, worker_started=True), receptor_ctl=mock.Mock()).action == FAIL


@pytest.mark.django_db
def test_requeue_resets_the_job_for_scheduling():
    job = running_job()
    leased(job)
    # the attempt given up saved some output; the next one numbers its events from 1 again
    save_events(job, [1, 2])
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'), mock.patch('ascender.main.tasks.jobs.ScheduleTaskManager') as stm:
        assert requeue_job(job, 'its pod never received its payload', job.celery_task_id)
    stm.return_value.schedule.assert_called_once()
    job.refresh_from_db()
    assert job.status == 'pending'
    assert job.controller_node == job.execution_node == job.work_unit_id == job.celery_task_id == ''
    assert job.started is None
    assert 'never received its payload' in job.job_explanation
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()
    assert not job.get_event_queryset().exists()


@pytest.mark.django_db
def test_requeue_is_fenced_by_the_owning_task(me):
    """A task that lost the job to a claim must neither reset a job another task is reading nor remove its lease."""
    job = running_job()
    leased(job)
    save_events(job, [1, 2])
    former = job.celery_task_id
    claimed = claim_job(job, me.hostname)
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'), mock.patch('ascender.main.tasks.jobs.ScheduleTaskManager') as stm:
        assert requeue_job(job, 'its pod never received its payload', former) is False
    stm.return_value.schedule.assert_not_called()
    job.refresh_from_db()
    assert (job.status, job.celery_task_id) == ('running', claimed)
    assert JobMonitorLease.objects.filter(unified_job=job).exists()
    assert job.get_event_queryset().count() == 2


@pytest.mark.django_db(transaction=True)
def test_a_requeue_and_a_claim_take_their_locks_in_the_same_order():
    """Both lock the lease row before the job's; in the opposite order they deadlock, and PostgreSQL aborts one."""
    job = running_job()
    leased(job)
    owner = job.celery_task_id
    locked = threading.Event()

    @in_a_thread_with_its_own_connection
    def claim_in_progress():
        with transaction.atomic():
            JobMonitorLease.objects.select_for_update().filter(unified_job_id=job.pk).first()
            locked.set()
            time.sleep(1)  # the re-queue reaches its first lock meanwhile
            UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='the-claimer')

    with mock.patch.object(UnifiedJob, 'websocket_emit_status'), mock.patch('ascender.main.tasks.jobs.ScheduleTaskManager'):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            claimer = pool.submit(claim_in_progress)
            assert locked.wait(10)
            requeue = pool.submit(in_a_thread_with_its_own_connection(lambda: requeue_job(job, 'its pod never received its payload', owner)))
            claimer.result(timeout=15)
            assert requeue.result(timeout=15) is False
    assert Job.objects.get(pk=job.pk).status == 'running'


@pytest.mark.parametrize(
    'value,expected',
    [('2h', 7200), ('30m', 1800), ('1h30m', 5400), ('1.5h', 5400), ('500ms', 0.5), ('90', 90), (90, 90), ('', 7), (None, 7), ('soon', 7), ('1h 30m', 7)],
)
def test_duration_seconds_reads_receptor_durations(value, expected):
    assert monitor.duration_seconds(value, 7) == pytest.approx(expected)


# -- what a resumed read skips ------------------------------------------------------------------


def save_events(job, counters):
    for counter in counters:
        JobEvent.objects.create(job=job, job_created=job.created, counter=counter, event='runner_on_ok', uuid=f'u{counter}', stdout=f'line {counter}')


@pytest.mark.django_db
def test_persisted_event_counters():
    job = running_job()
    save_events(job, [1, 2, 3, 5, 7, 8])
    assert persisted_event_counters(job) == ([(1, 3), (5, 5), (7, 8)], 6)
    gap_at_start = running_job(work_unit_id='unit2')
    save_events(gap_at_start, [2, 3])
    assert persisted_event_counters(gap_at_start) == ([(2, 3)], 2)
    assert persisted_event_counters(running_job(work_unit_id='unit3')) == ([], 0)


@pytest.mark.django_db
def test_a_replay_skips_every_saved_event_past_a_gap_however_many(settings):
    """
    The receiver drops an event it cannot save, and the job goes on: everything saved after that
    gap must still be skipped on replay, and counted once, or emitted_events never matches.
    """
    settings.JOB_EVENT_WORKERS = 1
    job = running_job()
    counters = [1, 2] + list(range(4, 2005))
    at = now()
    JobEvent.objects.bulk_create(
        JobEvent(job=job, job_created=job.created, counter=c, event='runner_on_ok', uuid=f'u{c}', stdout='', created=at, modified=at) for c in counters
    )
    callback = RunnerCallback(model=Job)
    callback.configure_for_resume(job, '/tmp/x', reading=False)
    assert callback.event_ct == len(counters)
    assert [c for c in range(1, 2006) if not callback._already_persisted({'counter': c})] == [3, 2005]


# -- the signal handling of the stream ----------------------------------------------------------


class FakeStream:
    """Serves a canned ansible-runner worker stream, and records what was done to it."""

    kind = 'fake'

    def __init__(self, lines):
        self.payload = b''.join(lines)
        self.bio = None
        self.closed = False
        self.cancelled = False
        self.released = False
        self.interrupted = False
        self.follow = True

    def open(self, follow=None):
        self.bio = io.BytesIO(self.payload)
        return self

    def readline(self, *args):
        return self.bio.readline(*args)

    def read(self, *args):
        return self.bio.read(*args)

    def readable(self):
        return True

    def writable(self):
        return False

    def write(self, data):
        raise io.UnsupportedOperation('not writable')

    def flush(self):
        pass

    def close(self):
        self.closed = True

    def interrupt(self):
        self.interrupted = True

    def cancel(self):
        self.cancelled = True

    def release(self):
        self.released = True

    live = False

    def stalled(self, idle_seconds):
        return False

    def is_live(self):
        return self.live

    def final_status(self):
        return 'successful', 0


class BrokenStream(FakeStream):
    """A stream whose reading fails the way an unreachable Kubernetes API makes a pod log fail."""

    def readline(self, *args):
        raise RuntimeError('the Kubernetes API is unreachable')


def runner_stream(counters, final='successful', persisted_created=None, env=None):
    created = (persisted_created or now()).isoformat()
    lines = [
        json.dumps(
            {
                'status': 'starting',
                'runner_ident': '1',
                'command': ['ansible-playbook', 'slow.yml'],
                'cwd': '/runner/project',
                'env': env or {'AWX_PRIVATE_DATA_DIR': '/tmp/original', 'SECRET_THING': 'hunter2'},
            }
        ).encode()
        + b'\n'
    ]
    for counter in counters:
        event = 'playbook_on_stats' if counter == counters[-1] else 'runner_on_ok'
        event_data = (
            {'ok': {'localhost': 1}, 'changed': {}, 'failures': {}, 'dark': {}, 'skipped': {}, 'processed': {'localhost': 1}, 'rescued': {}, 'ignored': {}}
            if event == 'playbook_on_stats'
            else {'host': 'localhost'}
        )
        lines.append(
            json.dumps(
                {
                    'event': event,
                    'uuid': f'u{counter}',
                    'counter': counter,
                    'stdout': f'line {counter}',
                    'start_line': counter - 1,
                    'end_line': counter,
                    'event_data': event_data,
                    'created': created,
                }
            ).encode()
            + b'\n'
        )
    lines.append(json.dumps({'status': final, 'runner_ident': '1', 'rc': 0 if final == 'successful' else 2}).encode() + b'\n')
    lines.append(json.dumps({'eof': True}).encode())
    return lines


@pytest.fixture
def quiet_websockets():
    with mock.patch.object(UnifiedJob, 'websocket_emit_status'), mock.patch('ascender.main.tasks.callback.CallbackQueueDispatcher') as dispatcher_cls:
        dispatcher_cls.return_value.dispatch = mock.Mock()
        yield dispatcher_cls.return_value.dispatch


@pytest.mark.django_db(transaction=True)
def test_resume_reads_the_rest_and_finishes_the_job(me, quiet_websockets, inventory, project):
    ended = now() - timedelta(minutes=5)
    job = running_job(inventory=inventory, project=project, started=now() - timedelta(minutes=10))
    save_events(job, [1, 2, 3])
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    job.refresh_from_db()
    stream = FakeStream(runner_stream([1, 2, 3, 4, 5], persisted_created=ended))

    lease_during_post_run = []

    def post_run_hook(task, instance, status):
        lease_during_post_run.append(JobMonitorLease.objects.filter(unified_job=instance).exists())

    with (
        mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream, follow=False)),
        mock.patch.object(RunJob, 'post_run_hook', post_run_hook),
    ):
        RunJob().resume(job.pk, task_id)

    job.refresh_from_db()
    assert job.status == 'successful', job.result_traceback
    # the post-run hooks can outlast a lease, so it is retired before them
    assert lease_during_post_run == [False]
    assert 'resumed on' in job.job_explanation
    assert job.celery_task_id == task_id
    # only the events not yet saved were dispatched, plus the EOF marker
    dispatched = [c.args[0] for c in quiet_websockets.call_args_list]
    assert [e.get('counter') for e in dispatched if 'counter' in e] == [4, 5]
    assert dispatched[-1]['event'] == 'EOF' and dispatched[-1]['final_counter'] == 5
    assert job.emitted_events == 5
    # the hooks were pointed at this run's private data dir, and the environment was masked
    assert job.job_env['AWX_PRIVATE_DATA_DIR'].startswith('/tmp/ascender_')
    assert job.job_env['SECRET_THING'] != 'hunter2'
    # the job finished when the playbook did, not when the resume noticed
    assert abs((job.finished - ended).total_seconds()) < 2
    assert job.elapsed > 0
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()
    assert stream.released and stream.closed
    assert not os.path.exists(job.job_env['AWX_PRIVATE_DATA_DIR'])


@pytest.mark.django_db(transaction=True)
def test_resume_stands_down_when_the_job_was_claimed_again(me, quiet_websockets, inventory, project):
    job = running_job(inventory=inventory, project=project)
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='a-later-claim')
    stream = FakeStream(runner_stream([1, 2]))
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream)) as planned:
        RunJob().resume(job.pk, task_id)
    planned.assert_not_called()
    job.refresh_from_db()
    assert job.status == 'running'
    quiet_websockets.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_resume_takes_the_final_status_from_the_stream_when_the_log_has_no_status_line(me, quiet_websockets, inventory, project):
    job = running_job(inventory=inventory, project=project)
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    # a log whose beginning rotated away: no 'starting', no final status, just the tail
    stream = FakeStream(
        [json.dumps({'event': 'runner_on_ok', 'uuid': 'u9', 'counter': 9, 'stdout': 'late', 'start_line': 8, 'end_line': 9, 'event_data': {}}).encode() + b'\n']
    )
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream, follow=False)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    assert job.status == 'successful'
    assert 'taken from the job' in job.job_explanation


@pytest.mark.django_db
def test_resume_requeues_and_fails_as_planned(me, quiet_websockets, inventory, project):
    job = running_job(inventory=inventory, project=project)
    leased(job)
    task_id = claim_job(job, me.hostname)
    cleanup = mock.Mock(return_value=True)
    with (
        mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(REQUEUE, 'its pod never received its payload', cleanup=cleanup)),
        mock.patch('ascender.main.tasks.jobs.ScheduleTaskManager'),
    ):
        RunJob().resume(job.pk, task_id)
    cleanup.assert_called_once()
    job.refresh_from_db()
    assert job.status == 'pending'

    other = running_job(inventory=inventory, project=project, work_unit_id='unit2')
    leased(other, worker_started=True)
    task_id = claim_job(other, me.hostname)
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(FAIL, 'its pod no longer exists')):
        with pytest.raises(Exception):
            RunJob().resume(other.pk, task_id)
    other.refresh_from_db()
    assert other.status == 'failed'
    assert 'its pod no longer exists' in other.job_explanation
    assert not JobMonitorLease.objects.filter(unified_job=other).exists()


@pytest.mark.django_db(transaction=True)
def test_a_lease_keeper_renews_while_its_owner_is_busy_and_tells_when_the_job_is_lost(settings):
    settings.JOB_MONITOR_RENEW_SECONDS = 0.05
    job = running_job()
    lease = leased(job, expired=False)
    JobMonitorLease.objects.filter(pk=lease.pk).update(expires=now() + timedelta(seconds=1))
    with LeaseKeeper(job, job.celery_task_id) as keeper:
        time.sleep(0.3)
    lease.refresh_from_db()
    assert lease.expires > now() + timedelta(seconds=30)
    assert not keeper.lost
    with LeaseKeeper(job, job.celery_task_id) as keeper:
        UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='the-claimer')
        time.sleep(0.3)
    assert keeper.lost


@pytest.mark.django_db(transaction=True)
def test_a_slow_resume_keeps_its_lease_until_it_is_ready(me, quiet_websockets, inventory, project, settings):
    """Setup that outlasts a lease, such as the host map of a large inventory, must not hand the job to the next sweep before it is read."""
    settings.JOB_MONITOR_LEASE_SECONDS = 1
    settings.JOB_MONITOR_RENEW_SECONDS = 0.1
    job = running_job(inventory=inventory, project=project)
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    stale = Job.objects.get(pk=job.pk)
    claims = []

    def slow_plan(job, lease):
        time.sleep(1.5)
        claims.append(claim_job(stale, 'another-node'))
        return ResumePlan(WAIT, 'its pod is still pending')

    with mock.patch('ascender.main.tasks.jobs.plan_resume', side_effect=slow_plan):
        RunJob().resume(job.pk, task_id)
    assert claims == [None]
    job.refresh_from_db()
    assert job.celery_task_id == task_id
    assert JobMonitorLease.objects.get(unified_job=job).deferrals == 1


@pytest.mark.django_db(transaction=True)
def test_a_resume_that_loses_its_job_while_planning_does_nothing_about_the_plan(me, quiet_websockets, inventory, project, settings):
    settings.JOB_MONITOR_RENEW_SECONDS = 0.05
    job = running_job(inventory=inventory, project=project)
    leased(job)
    task_id = claim_job(job, me.hostname)
    cleanup = mock.Mock(return_value=True)

    def plan_while_claimed(job, lease):
        UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='the-claimer')
        time.sleep(0.3)
        return ResumePlan(REQUEUE, 'its pod never received its payload', cleanup=cleanup)

    with mock.patch('ascender.main.tasks.jobs.plan_resume', side_effect=plan_while_claimed):
        RunJob().resume(job.pk, task_id)
    cleanup.assert_not_called()
    job.refresh_from_db()
    assert (job.status, job.celery_task_id) == ('running', 'the-claimer')


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('how', ['failed', 'canceled'])
def test_finishing_a_project_update_it_never_read_leaves_the_project_alone(me, quiet_websockets, project, settings, tmp_path, how):
    """Another update of the project may be writing its stage directory, under the lock this resume does not hold."""
    settings.PROJECTS_ROOT = str(tmp_path)
    sync = ProjectUpdate.objects.create(
        project=project,
        status='running',
        controller_node='dead-node',
        execution_node='dead-node',
        celery_task_id='t',
        work_unit_id='u',
        launch_type='sync',
        local_path='_1__monitor_test',
    )
    leased(sync, worker_started=True)
    task_id = claim_job(sync, me.hostname)
    stage = os.path.join(sync.get_cache_path(), 'stage')
    os.makedirs(stage)
    if how == 'canceled':
        ProjectUpdate.objects.filter(pk=sync.pk).update(cancel_flag=True)
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(FAIL, 'its work unit was lost with its controller')):
        with pytest.raises(Exception):
            RunProjectUpdate().resume(sync.pk, task_id)
    sync.refresh_from_db()
    assert sync.status == how
    assert os.path.isdir(stage)


@pytest.mark.django_db
def test_resume_waits_when_the_output_is_not_reachable_yet(me, inventory, project, settings):
    job = running_job(inventory=inventory, project=project)
    lease = leased(job)
    task_id = claim_job(job, me.hostname)
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(WAIT, 'its pod is still pending')):
        RunJob().resume(job.pk, task_id)
    lease.refresh_from_db()
    assert lease.deferrals == 1
    assert lease.expires > now() + timedelta(seconds=settings.JOB_MONITOR_RETRY_SECONDS - 5)
    job.refresh_from_db()
    assert job.status == 'running'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'cancel_flag,worker_started,resuming,expected',
    [
        (True, True, False, 'canceled'),
        (False, False, False, 'requeued'),
        (False, True, False, 'detached'),
        (False, False, True, 'detached'),
    ],
)
def test_signal_handling_tells_a_cancel_from_a_shutdown(cancel_flag, worker_started, resuming, expected):
    job = running_job(cancel_flag=cancel_flag)
    task = mock.Mock()
    task.instance = job
    task.runner_callback.worker_started = worker_started
    task.owner_task_id = job.celery_task_id
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.resuming = resuming
    receptor_job.unit_id = 'unit1'
    stream = FakeStream([])
    done = mock.Mock()
    done.result.return_value = _PhaseResult('error', 1)
    res = receptor_job._handle_signal(stream, done)
    assert stream.interrupted
    if expected == 'canceled':
        assert res.status == 'canceled' and stream.cancelled and not receptor_job.detached
    elif expected == 'requeued':
        assert receptor_job.requeued and stream.cancelled and not receptor_job.detached
    else:
        assert receptor_job.detached and not stream.cancelled and not receptor_job.requeued


# -- the callback receiver drops a replayed duplicate -------------------------------------------


class FakeValkey:
    def keys(self, *args, **kwargs):
        return []

    def set(self, *args, **kwargs):
        pass

    def get(self, *args, **kwargs):
        return None

    @classmethod
    def from_url(cls, *args, **kwargs):
        return cls()

    def pipeline(self):
        return self


@pytest.mark.django_db(transaction=True)
def test_callback_receiver_drops_an_event_that_is_already_saved():
    from ascender.main.dispatch.worker.callback import CallbackBrokerWorker

    job = running_job()
    save_events(job, [1, 2])
    with (
        mock.patch('ascender.main.dispatch.worker.callback.valkey.Valkey', FakeValkey),
        mock.patch('ascender.main.dispatch.worker.callback.emit_event_detail', lambda *a, **kw: None),
    ):
        worker = CallbackBrokerWorker()
        for counter in (2, 3):
            worker.perform_work(
                {
                    'event': 'runner_on_ok',
                    'job_id': job.id,
                    'job_created': job.created.isoformat(),
                    'counter': counter,
                    'uuid': f'replay{counter}',
                    'stdout': 'again',
                    'start_line': 0,
                    'end_line': 1,
                    'event_data': {},
                    'created': now().isoformat(),
                }
            )
        worker.flush(force=True)
    counters = list(JobEvent.objects.filter(job=job).order_by('counter').values_list('counter', 'uuid'))
    assert counters == [(1, 'u1'), (2, 'u2'), (3, 'replay3')]
    assert worker.buff.get(JobEvent, []) == []


@pytest.mark.django_db(transaction=True)
def test_resume_keeps_the_environment_the_launch_masked(me, quiet_websockets, inventory, project):
    """The launch masked credential values by the values it injected; a replayed 'starting' must not overwrite that record."""
    launch_env = {'AWX_PRIVATE_DATA_DIR': '/tmp/original', 'MY_DB_CONNECTION': '**********', 'JOB_ID': '1'}
    job = running_job(inventory=inventory, project=project, job_env=launch_env)
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    # a custom credential type may inject any name that is not ANSIBLE_* or blocklisted
    replayed = {'AWX_PRIVATE_DATA_DIR': '/tmp/original', 'MY_DB_CONNECTION': 'postgres://app:hunter2@db/app', 'JOB_ID': '1'}
    stream = FakeStream(runner_stream([1, 2], env=replayed))
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream, follow=False)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    assert job.status == 'successful', job.result_traceback
    assert job.job_env['MY_DB_CONNECTION'] == '**********'
    assert job.job_env['AWX_PRIVATE_DATA_DIR'] != '/tmp/original'
    assert 'hunter2' not in json.dumps(job.job_env)


@pytest.mark.django_db(transaction=True)
def test_resume_hides_what_a_credential_could_have_set_when_the_launch_stored_nothing(me, quiet_websockets, inventory, project):
    job = running_job(inventory=inventory, project=project)
    leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    replayed = {'MY_DB_CONNECTION': 'hunter2', 'ANSIBLE_FORCE_COLOR': 'True', 'JOB_ID': '1', 'ANSIBLE_NET_PASSWORD': 'hunter2'}
    stream = FakeStream(runner_stream([1, 2], env=replayed))
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream, follow=False)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    assert job.job_env['MY_DB_CONNECTION'] == '**********'
    assert job.job_env['ANSIBLE_NET_PASSWORD'] == '**********'
    assert job.job_env['ANSIBLE_FORCE_COLOR'] == 'True'
    assert job.job_env['JOB_ID'] == '1'


@pytest.mark.django_db
def test_a_resumed_jobs_post_run_hook_finds_its_artifacts_without_a_stored_environment(inventory, project):
    """A launch that never stored the environment, and a log whose start was rotated away, leave no AWX_PRIVATE_DATA_DIR in job_env."""
    job = running_job(inventory=inventory, project=project)
    assert not job.job_env
    task = RunJob()
    task.instance = job
    task.runner_callback.private_data_dir_override = '/tmp/awx_resumed'
    task.runner_callback.artifacts_processed = True
    with mock.patch.object(RunJob, 'should_use_fact_cache', return_value=True), mock.patch('ascender.main.tasks.jobs.finish_fact_cache') as finish_fact_cache:
        task.post_run_hook(job, 'successful')
    assert finish_fact_cache.call_args.kwargs['artifacts_dir'] == f'/tmp/awx_resumed/artifacts/{job.id}'


@pytest.mark.django_db(transaction=True)
def test_resume_tries_again_later_when_reading_fails(me, quiet_websockets, inventory, project):
    job = running_job(inventory=inventory, project=project)
    lease = leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    stream = BrokenStream([])
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    lease.refresh_from_db()
    assert job.status == 'running'
    assert lease.deferrals == 1 and lease.expires > now()
    assert not stream.released and not stream.cancelled
    quiet_websockets.assert_not_called()


class CutStream(FakeStream):
    """Serves its lines, then breaks off the way a pod log's final pass does when its connection drops."""

    def readline(self, *args):
        line = self.bio.readline(*args)
        if not line:
            raise PodLogIncomplete('the log of pod automation-job-1 could not be read to its end')
        return line


@pytest.mark.django_db(transaction=True)
def test_resume_tries_again_later_when_the_last_read_of_a_pod_log_breaks_off(me, quiet_websockets, inventory, project):
    """Through ansible-runner's processor: a log cut short is not the end of the job, and the pod is kept for the next try."""
    job = running_job(inventory=inventory, project=project)
    lease = leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    stream = CutStream(runner_stream([1, 2, 3])[:3])
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream, follow=False)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    lease.refresh_from_db()
    assert job.status == 'running'
    assert lease.deferrals == 1
    assert not stream.released and not stream.cancelled


@pytest.mark.django_db(transaction=True)
def test_resume_counts_a_failure_to_get_ready_against_the_deferrals(me, quiet_websockets, inventory, project):
    """Uncounted, a failure that persists would have the job claimed and fail again forever, never running out of deferrals."""
    job = running_job(inventory=inventory, project=project)
    lease = leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    with mock.patch('ascender.main.tasks.jobs.plan_resume', side_effect=RuntimeError('invalid kubeconfig in the container group credential')):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    lease.refresh_from_db()
    assert job.status == 'running'
    assert lease.deferrals == 1 and lease.expires > now()


@pytest.mark.django_db(transaction=True)
def test_a_job_out_of_deferrals_is_failed_without_the_setup_that_kept_failing(me, quiet_websockets, inventory, project, settings):
    job = running_job(inventory=inventory, project=project)
    leased(job, worker_started=True, deferrals=settings.JOB_MONITOR_MAX_DEFERRALS)
    task_id = claim_job(job, me.hostname)
    with mock.patch.object(RunJob, 'build_private_data_dir', side_effect=OSError(28, 'No space left on device')):
        with pytest.raises(Exception):  # finish_run raises for a failed job, as at the end of a launch
            RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    assert job.status == 'failed'
    assert 'stayed unreachable' in job.job_explanation
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()


@pytest.mark.django_db(transaction=True)
def test_resume_tries_again_later_when_the_stream_ends_while_the_work_runs(me, quiet_websockets, inventory, project):
    """A stream that broke off is not the end of a job whose pod or unit is still running."""
    job = running_job(inventory=inventory, project=project)
    lease = leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    stream = FakeStream(runner_stream([1, 2, 3])[:-2])  # no final status, no eof
    stream.live = True
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(RESUME, 'test', stream=stream)):
        RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    lease.refresh_from_db()
    assert job.status == 'running'
    assert lease.deferrals == 1
    assert not stream.released
    # the events read were saved, but no EOF announced an end the job has not reached
    dispatched = [c.args[0] for c in quiet_websockets.call_args_list]
    assert [e.get('counter') for e in dispatched] == [1, 2, 3]
    assert all(e.get('event') != 'EOF' for e in dispatched)


@pytest.mark.django_db(transaction=True)
def test_resume_carries_out_a_cancel_that_found_nobody_reading(me, quiet_websockets, inventory, project):
    """A cancel that reached an earlier resume, which then had to wait, is carried out by the next one."""
    job = running_job(inventory=inventory, project=project, cancel_flag=True)
    lease = leased(job, worker_started=True)
    task_id = claim_job(job, me.hostname)
    stream = FakeStream(runner_stream([1, 2]))
    with mock.patch('ascender.main.tasks.jobs.plan_resume', return_value=ResumePlan(WAIT, 'its pod is still pending', stream=stream)):
        with pytest.raises(Exception):  # the task reports a cancel the way a launch does
            RunJob().resume(job.pk, task_id)
    job.refresh_from_db()
    assert job.status == 'canceled'
    assert stream.cancelled
    assert not JobMonitorLease.objects.filter(pk=lease.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    'kind,worker_started,expected',
    [
        ('job', True, 'detached'),
        ('project_update', True, 'requeued'),
        ('inline_sync', True, 'cancelled'),
        ('inline_sync', False, 'cancelled'),
        ('job_with_passwords', False, 'cancelled'),
    ],
)
def test_a_project_update_is_never_left_running_on_shutdown(project, kind, worker_started, expected):
    if kind in ('job', 'job_with_passwords'):
        job = running_job()
    else:
        job = ProjectUpdate.objects.create(
            project=project,
            status='running',
            celery_task_id='t',
            work_unit_id='u',
            launch_type='sync' if kind == 'inline_sync' else 'manual',
        )
    task = mock.Mock()
    task.instance = job
    task.runner_callback.worker_started = worker_started
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.resuming = False
    receptor_job.unit_id = 'u'
    stream = FakeStream([])
    done = mock.Mock()
    done.result.return_value = _PhaseResult('error', 1)
    with mock.patch.object(Job, 'get_passwords_needed_to_start', return_value=['ssh_password'] if kind == 'job_with_passwords' else []):
        res = receptor_job._handle_signal(stream, done)
    if expected == 'detached':
        assert receptor_job.detached and not stream.cancelled
    elif expected == 'requeued':
        assert receptor_job.requeued and stream.cancelled and res.status == 'canceled'
    else:
        assert stream.cancelled and not receptor_job.requeued and not receptor_job.detached and res.status == 'canceled'


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('kind', ['job', 'project_update'])
def test_a_reader_that_loses_its_lease_stops_the_work_of_a_project_update_only(project, settings, kind):
    """A project update is never read by another task, and its task is about to give up the project lock: its work is stopped too."""
    settings.JOB_MONITOR_RENEW_SECONDS = 0.01
    if kind == 'job':
        job = running_job()
    else:
        job = ProjectUpdate.objects.create(project=project, status='running', celery_task_id='t', work_unit_id='u', launch_type='manual')
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(mock.Mock(instance=job), {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.unit_id = 'u'
    stream = FakeStream([])
    processor_future = mock.Mock()
    processor_future.result.side_effect = [concurrent.futures.TimeoutError(), _PhaseResult('error', 1)]
    with mock.patch.object(JobMonitorLease.objects, 'renew', side_effect=LeaseLost(job.pk, 't')):
        receptor_job._await_processor(processor_future, stream, owner_task_id='t')
    assert receptor_job.lease_lost and stream.interrupted
    assert stream.cancelled is (kind == 'project_update')


@pytest.mark.django_db
@pytest.mark.parametrize('armed', [False, True])
def test_waiting_for_the_streamer_leaves_signal_handling_as_the_caller_set_it(armed):
    """
    process_stream arms signal_state for the wait and disarms it after. Left armed behind the
    caller's back, the next SIGTERM anywhere in the process raises SignalExit in code that does not
    expect it, as test_signals.py did when it ran after a test of this in the same worker.
    """
    job = running_job()
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(mock.Mock(instance=job), {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.unit_id = 'u'
    processor_future = mock.Mock()
    processor_future.result.side_effect = [concurrent.futures.TimeoutError(), _PhaseResult('error', 1)]
    signal_state.raise_exception = armed
    try:
        with mock.patch.object(JobMonitorLease.objects, 'renew', side_effect=LeaseLost(job.pk, 't')):
            receptor_job._await_processor(processor_future, FakeStream([]), owner_task_id='t')
        assert signal_state.raise_exception is armed
    finally:
        signal_state.reset()


@pytest.mark.django_db
@pytest.mark.parametrize('work_type, kept', [('local', True), ('ansible-runner', False), ('kubernetes-incluster-auth', False)])
def test_a_detached_job_keeps_its_private_data_dir_only_for_local_work(work_type, kept):
    """The execution environment of local work has the directory bind-mounted; remote work took a copy, and the directory holds credentials."""
    job = running_job()
    leased(job, expired=False)
    task = RunJob()
    task.instance = job
    task.cleanup_paths = ['/tmp/awx_1_abcd']
    task._leave_to_resume(mock.Mock(detached=True, lease_lost=False, work_type=work_type, unit_id='unit1'))
    assert (task.cleanup_paths == []) is kept


@pytest.mark.django_db
def test_a_job_does_not_go_on_after_its_inline_sync_was_taken_over(project, tmp_path):
    """
    run() returns without finishing an inline sync whose monitoring another task took over, and
    that task stops the sync and fails it. The job that started the sync fails with it instead
    of recording the sync's revision and running against a half-updated project.
    """
    job = running_job(project=project, controller_node='')
    task = RunJob()
    task.instance = job
    with mock.patch.object(RunJob, 'get_sync_needs', return_value=['update_project']), mock.patch.object(RunProjectUpdate, 'run', return_value=None):
        with pytest.raises(RuntimeError):
            task.sync_and_copy_without_lock(project, str(tmp_path))
    job.refresh_from_db()
    assert job.status == 'failed'
    assert 'Previous Task Failed' in job.job_explanation
    assert job.project_update.launch_type == 'sync' and job.project_update.status == 'running'


@pytest.mark.django_db
def test_a_project_update_that_lost_its_lease_does_not_keep_its_private_data_dir(project):
    """Its work was stopped as it lost the lease, so nothing uses the directory, which holds its SCM credentials."""
    update = ProjectUpdate.objects.create(project=project, status='running', celery_task_id='t', work_unit_id='u', launch_type='manual')
    task = RunProjectUpdate()
    task.instance = update
    task.cleanup_paths = ['/tmp/awx_1_abcd']
    task._leave_to_resume(mock.Mock(detached=False, lease_lost=True, work_type='local', unit_id='u'))
    assert task.cleanup_paths == ['/tmp/awx_1_abcd']


def lockable_by_another_process(path):
    """fcntl locks belong to a process, which can always lock again what it holds itself."""
    probe = 'import fcntl, os, sys; fcntl.lockf(os.open(sys.argv[1], os.O_RDWR), fcntl.LOCK_EX | fcntl.LOCK_NB)'
    return subprocess.run([sys.executable, '-c', probe, str(path)], capture_output=True).returncode == 0


@pytest.mark.django_db
@pytest.mark.parametrize('how', ['requeued', 'lease_lost', 'taken_over_before_finishing'])
def test_a_run_that_ends_without_its_post_run_hook_releases_the_project_lock(project, tmp_path, how):
    """The dispatcher worker outlives the task; a lock it kept would hold up every later update of the project on the node."""
    update = ProjectUpdate.objects.create(project=project, status='running', celery_task_id='t', work_unit_id='u', launch_type='manual')
    lock_file = tmp_path / 'project.lock'
    task = RunProjectUpdate()
    task.instance = update
    task.lock_fd = os.open(lock_file, os.O_RDWR | os.O_CREAT)
    fcntl.lockf(task.lock_fd, fcntl.LOCK_EX)
    assert not lockable_by_another_process(lock_file)
    with mock.patch('ascender.main.tasks.jobs.requeue_job') as requeue, mock.patch.object(RunProjectUpdate, 'post_run_hook') as post_run_hook:
        if how == 'taken_over_before_finishing':
            task.owner_task_id = 'a-task-that-lost-the-job'
            task.finish_run(update.pk, 'successful', 0, str(tmp_path))
        else:
            task._end_without_finalizing(mock.Mock(detached=False, lease_lost=how == 'lease_lost', requeued=how == 'requeued', unit_id='u'))
    assert task.lock_fd is None
    assert lockable_by_another_process(lock_file)
    assert requeue.called is (how == 'requeued')
    post_run_hook.assert_not_called()


class UncancellableStream(FakeStream):
    """A work unit receptor would not cancel, its control socket gone with the shutdown."""

    def cancel(self):
        raise RuntimeError('receptor control socket is gone')


@pytest.mark.django_db
@pytest.mark.parametrize('kind', ['job_not_started', 'project_update'])
def test_work_that_could_not_be_cancelled_on_shutdown_is_not_run_again(project, kind):
    """Re-queueing it would start a second copy; the next monitor re-queues it only once it has stopped what is left."""
    if kind == 'project_update':
        job = ProjectUpdate.objects.create(project=project, status='running', celery_task_id='t', work_unit_id='u', launch_type='manual')
    else:
        job = running_job()
    task = mock.Mock()
    task.instance = job
    task.runner_callback.worker_started = kind == 'project_update'
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.resuming = False
    receptor_job.unit_id = 'u'
    stream = UncancellableStream([])
    done = mock.Mock()
    done.result.return_value = _PhaseResult('error', 1)
    res = receptor_job._handle_signal(stream, done)
    assert receptor_job.detached and not receptor_job.requeued
    assert res.status == 'detached' and stream.interrupted


@pytest.mark.django_db
def test_an_abandoned_stream_sends_no_eof():
    job = running_job()
    task = mock.Mock()
    task.instance = job
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.resuming = False
    for flag in ('detached', 'requeued', 'lease_lost'):
        setattr(receptor_job, flag, True)
        receptor_job.finished_callback(None)
        setattr(receptor_job, flag, False)
    task.runner_callback.finished_callback.assert_not_called()
    receptor_job.finished_callback(None)
    task.runner_callback.finished_callback.assert_called_once()
    # a resumed read holds it back until it knows the job is done
    receptor_job.resuming = True
    receptor_job.finished_callback(None)
    assert receptor_job.eof_held
    assert task.runner_callback.finished_callback.call_count == 1


@pytest.mark.django_db
@pytest.mark.parametrize('cancellable', [True, False])
def test_an_attempt_given_up_on_shutdown_sends_no_eof_while_its_stream_drains(cancellable):
    """The streamer calls the finished callback as the stream is drained; by then the attempt must already be marked given up."""
    job = running_job()
    task = mock.Mock()
    task.instance = job
    task.runner_callback.worker_started = False
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    receptor_job.resuming = False
    receptor_job.unit_id = 'u'
    stream = FakeStream([]) if cancellable else UncancellableStream([])
    draining = mock.Mock()
    # what the streamer thread does as it exits on the dropped stream
    draining.result.side_effect = lambda timeout=None: (receptor_job.finished_callback(None), _PhaseResult('error', 1))[1]
    receptor_job._handle_signal(stream, draining)
    assert (receptor_job.requeued, receptor_job.detached) == ((True, False) if cancellable else (False, True))
    task.runner_callback.finished_callback.assert_not_called()


@pytest.mark.django_db
def test_a_database_error_recording_the_pod_is_tried_again_not_fatal():
    """Like a failed renewal, a failed write of the pod's name must not end the read of a job that is running."""
    job = running_job()
    leased(job, expired=False)
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.task, receptor_job.unit_id, receptor_job.pod_recorded = mock.Mock(instance=job), 'unit1', False
    ctl = mock.Mock()
    ctl.simple_command.return_value = {'ExtraData': {'PodName': 'automation-job-1-abcde', 'KubeNamespace': 'ascender'}}
    with (
        mock.patch.object(Job, 'is_container_group_task', new_callable=mock.PropertyMock, return_value=True),
        mock.patch.object(AWXReceptorJob, 'mesh_node', new_callable=mock.PropertyMock, return_value=None),
    ):
        with mock.patch.object(JobMonitorLease.objects, 'record', side_effect=OperationalError('server closed the connection unexpectedly')):
            receptor_job._record_pod(ctl)
        assert receptor_job.pod_recorded is False
        receptor_job._record_pod(ctl)
    assert receptor_job.pod_recorded is True
    assert JobMonitorLease.objects.get(unified_job=job).pod_name == 'automation-job-1-abcde'


@pytest.mark.django_db
def test_a_failed_write_of_the_worker_start_is_tried_again_at_the_next_renewal():
    """A lease that never learns that the worker started would let a later reader re-queue a job that ran."""
    job = running_job()
    lease = leased(job, expired=False)
    callback = RunnerCallback(model=Job)
    callback.instance = job
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.task, receptor_job.receptor_ctl = mock.Mock(instance=job, runner_callback=callback), None
    receptor_job.unit_id, receptor_job.pod_recorded = 'unit1', True
    callback.worker_started = True
    with mock.patch.object(JobMonitorLease.objects, 'record', side_effect=OperationalError('server closed the connection unexpectedly')):
        callback.record_worker_started()
    lease.refresh_from_db()
    assert lease.worker_started is False and callback.worker_started_recorded is False
    receptor_job._record_progress()
    lease.refresh_from_db()
    assert lease.worker_started is True and callback.worker_started_recorded is True


@pytest.mark.django_db
def test_a_launch_whose_job_was_claimed_as_it_finished_leaves_lease_and_unit_to_the_claimer(settings):
    settings.RECEPTOR_RELEASE_WORK = True
    job = running_job()
    leased(job, expired=False)
    task = mock.Mock(instance=job, owner_task_id=job.celery_task_id)
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    ctl = mock.Mock()

    def run_internal(receptor_ctl):
        receptor_job.unit_id = 'unit1'
        UnifiedJob.objects.filter(pk=job.pk).update(celery_task_id='the-claimer')
        return _PhaseResult('successful', 0)

    with (
        mock.patch('ascender.main.tasks.receptor.read_receptor_config', return_value={}),
        mock.patch('ascender.main.tasks.receptor.get_receptor_ctl', return_value=ctl),
        mock.patch.object(receptor_job, '_run_internal', run_internal),
    ):
        receptor_job.run()
    assert receptor_job.lease_lost
    assert JobMonitorLease.objects.filter(unified_job=job).exists()
    ctl.simple_command.assert_not_called()


@pytest.mark.django_db
def test_the_lease_is_retired_when_the_launch_is_done_with_the_unit(settings):
    """Before the post-run hooks, which can outlast a lease: otherwise a sweep would take a job that is finishing."""
    settings.RECEPTOR_RELEASE_WORK = True
    job = running_job()
    leased(job, expired=False)
    task = mock.Mock()
    task.instance = job
    task.owner_task_id = job.celery_task_id
    receptor_job = AWXReceptorJob.__new__(AWXReceptorJob)
    receptor_job.__init__(task, {'private_data_dir': '/tmp/x'}, resuming=True)
    ctl = mock.Mock()

    def run_internal(receptor_ctl):
        receptor_job.unit_id = 'unit1'
        return _PhaseResult('successful', 0)

    with (
        mock.patch('ascender.main.tasks.receptor.read_receptor_config', return_value={}),
        mock.patch('ascender.main.tasks.receptor.get_receptor_ctl', return_value=ctl),
        mock.patch.object(receptor_job, '_run_internal', run_internal),
    ):
        assert receptor_job.run().status == 'successful'
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()
    ctl.simple_command.assert_called_once_with('work release unit1')

    # a task that detached leaves both for the next monitor
    other = running_job(work_unit_id='unit2')
    leased(other, expired=False)
    task.instance, task.owner_task_id = other, other.celery_task_id
    ctl.reset_mock()

    def detach(receptor_ctl):
        receptor_job.unit_id = 'unit2'
        receptor_job.detached = True
        return _PhaseResult('detached', 1)

    with (
        mock.patch('ascender.main.tasks.receptor.read_receptor_config', return_value={}),
        mock.patch('ascender.main.tasks.receptor.get_receptor_ctl', return_value=ctl),
        mock.patch.object(receptor_job, '_run_internal', detach),
    ):
        receptor_job.run()
    assert JobMonitorLease.objects.filter(unified_job=other).exists()
    ctl.simple_command.assert_not_called()
