"""
The job monitor lease: who reads a running job's output, and what happens when they stop.

These run against the database with transaction=True where a stream is actually read, because
ansible-runner's process streamer runs in a thread with its own connection.
"""

import io
import json
import os
from datetime import timedelta
from unittest import mock
import uuid

import pytest

from django.utils.timezone import now

from ascender.main.dispatch import reaper
from ascender.main.models import Instance, Job, JobEvent, JobMonitorLease, LeaseLost, ProjectUpdate, UnifiedJob
from ascender.main.tasks import monitor
from ascender.main.tasks.callback import persisted_event_counters
from ascender.main.tasks.jobs import RunJob
from ascender.main.tasks.monitor import FAIL, REQUEUE, RESUME, WAIT, ResumePlan, claim_job, plan_resume, requeue_job, sweep_job_monitors
from ascender.main.tasks.receptor import AWXReceptorJob, _PhaseResult
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
    JobMonitorLease.objects.release(job)
    lease.refresh_from_db()
    assert lease.expires <= now()
    assert JobMonitorLease.objects.finish(job) == 1
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()


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
    # once that node is gone, any node takes the job, to re-queue or fail it
    peer.node_state = 'unavailable'
    peer.save()
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
        peer.node_state = 'unavailable'
        peer.save()
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
        assert requeue_job(job, 'its pod never received its payload')
    stm.return_value.schedule.assert_called_once()
    job.refresh_from_db()
    assert job.status == 'pending'
    assert job.controller_node == job.execution_node == job.work_unit_id == job.celery_task_id == ''
    assert job.started is None
    assert 'never received its payload' in job.job_explanation
    assert not JobMonitorLease.objects.filter(unified_job=job).exists()
    assert not job.get_event_queryset().exists()


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
    save_events(job, [1, 2, 3, 5, 7])
    assert persisted_event_counters(job) == (3, {5, 7}, 5)
    gap_at_start = running_job(work_unit_id='unit2')
    save_events(gap_at_start, [2, 3])
    assert persisted_event_counters(gap_at_start) == (0, {2, 3}, 2)
    assert persisted_event_counters(running_job(work_unit_id='unit3')) == (0, set(), 0)


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
