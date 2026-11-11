# Python
from collections import namedtuple
import concurrent.futures
from enum import Enum
import io
import json
import logging
import os
import shutil
import socket
import time
import yaml

# Django
from ascender.settings.typed import settings
from django.db import connections, DatabaseError, connection as django_connection

# Runner
import ansible_runner

# Ascender
from ascender.main.utils.execution_environments import get_default_pod_spec
from ascender.main.exceptions import ReceptorNodeNotFound
from ascender.main.utils.common import (
    deepmerge,
    parse_yaml_or_json,
    cleanup_new_process,
)
from ascender.main.constants import MAX_ISOLATED_PATH_COLON_DELIMITER
from ascender.main.tasks.signals import signal_state, signal_callback, SignalExit
from ascender.main.models import Instance, InstanceLink, UnifiedJob, ReceptorAddress, JobMonitorLease, LeaseLost
from ascender.main.dispatch import get_task_queuename
from ascender.main.dispatch.publish import task
from ascender.main.utils.pglock import advisory_lock

# Receptorctl
from receptorctl.socket_interface import ReceptorControl

from filelock import FileLock

logger = logging.getLogger('ascender.main.tasks.receptor')
__RECEPTOR_CONF = '/etc/receptor/receptor.conf'
__RECEPTOR_CONF_LOCKFILE = f'{__RECEPTOR_CONF}.lock'
RECEPTOR_ACTIVE_STATES = ('Pending', 'Running')


class ReceptorConnectionType(Enum):
    DATAGRAM = 0
    STREAM = 1
    STREAMTLS = 2


def read_receptor_config():
    # for K8S deployments, getting a lock is necessary as another process
    # may be re-writing the config at this time
    if settings.IS_K8S:
        lock = FileLock(__RECEPTOR_CONF_LOCKFILE)
        with lock:
            with open(__RECEPTOR_CONF, 'r') as f:
                return yaml.safe_load(f)
    else:
        with open(__RECEPTOR_CONF, 'r') as f:
            return yaml.safe_load(f)


def work_signing_enabled(config_data):
    for section in config_data:
        if 'work-signing' in section:
            return True
    return False


def get_receptor_sockfile(config_data):
    for section in config_data:
        for entry_name, entry_data in section.items():
            if entry_name == 'control-service':
                if 'filename' in entry_data:
                    return entry_data['filename']
                else:
                    raise RuntimeError(f'Receptor conf {__RECEPTOR_CONF} control-service entry does not have a filename parameter')
    else:
        raise RuntimeError(f'Receptor conf {__RECEPTOR_CONF} does not have control-service entry needed to get sockfile')


def get_tls_client(config_data, use_stream_tls=None):
    if not use_stream_tls:
        return None

    for section in config_data:
        for entry_name, entry_data in section.items():
            if entry_name == 'tls-client':
                if 'name' in entry_data:
                    return entry_data['name']
    return None


def get_receptor_ctl(config_data=None):
    if config_data is None:
        config_data = read_receptor_config()
    receptor_sockfile = get_receptor_sockfile(config_data)
    try:
        return ReceptorControl(receptor_sockfile, config=__RECEPTOR_CONF, tlsclient=get_tls_client(config_data, True))
    except RuntimeError:
        return ReceptorControl(receptor_sockfile)


def find_node_in_mesh(node_name, receptor_ctl):
    attempts = 10
    backoff = 1
    for attempt in range(attempts):
        all_nodes = receptor_ctl.simple_command("status").get('Advertisements', None)
        for node in all_nodes:
            if node.get('NodeID') == node_name:
                return node
        else:
            logger.warning(f"Instance {node_name} is not in the receptor mesh. {attempts - attempt} attempts left.")
            time.sleep(backoff)
            backoff += 1
    else:
        raise ReceptorNodeNotFound(f'Instance {node_name} is not in the receptor mesh')


def get_conn_type(node_name, receptor_ctl):
    node = find_node_in_mesh(node_name, receptor_ctl)
    return ReceptorConnectionType(node.get('ConnType'))


def administrative_workunit_reaper(work_list=None):
    """
    This releases completed work units that were spawned by actions inside of this module
    specifically, this should catch any completed work unit left by
     - worker_info
     - worker_cleanup
    These should ordinarily be released when the method finishes, but this is a
    cleanup of last-resort, in case something went awry
    """
    receptor_ctl = get_receptor_ctl()
    if work_list is None:
        work_list = receptor_ctl.simple_command("work list")

    for unit_id, work_data in work_list.items():
        extra_data = work_data.get('ExtraData')
        if extra_data is None:
            continue  # if this is not ansible-runner work, we do not want to touch it
        if isinstance(extra_data, str):
            if not work_data.get('StateName', None) or work_data.get('StateName') in RECEPTOR_ACTIVE_STATES:
                continue
        else:
            if extra_data.get('RemoteWorkType') != 'ansible-runner':
                continue
            params = extra_data.get('RemoteParams', {}).get('params')
            if not params:
                continue
            if not (params == '--worker-info' or params.startswith('cleanup')):
                continue  # if this is not a cleanup or health check, we do not want to touch it
            if work_data.get('StateName') in RECEPTOR_ACTIVE_STATES:
                continue  # do not want to touch active work units
            logger.info(f'Reaping orphaned work unit {unit_id} with params {params}')
        receptor_ctl.simple_command(f"work release {unit_id}")


class RemoteJobError(RuntimeError):
    pass


def run_until_complete(node, timing_data=None, **kwargs):
    """
    Runs an ansible-runner work_type on remote node, waits until it completes, then returns stdout.
    """
    config_data = read_receptor_config()
    receptor_ctl = get_receptor_ctl(config_data)

    use_stream_tls = getattr(get_conn_type(node, receptor_ctl), 'name', None) == "STREAMTLS"
    kwargs.setdefault('tlsclient', get_tls_client(config_data, use_stream_tls))
    kwargs.setdefault('ttl', '20s')
    kwargs.setdefault('payload', '')
    if work_signing_enabled(config_data):
        kwargs['signwork'] = True

    transmit_start = time.time()
    result = receptor_ctl.submit_work(worktype='ansible-runner', node=node, **kwargs)

    unit_id = result['unitid']
    run_start = time.time()
    if timing_data:
        timing_data['transmit_timing'] = run_start - transmit_start
    run_timing = 0.0
    stdout = ''

    try:
        resultfile = receptor_ctl.get_work_results(unit_id)

        while run_timing < 20.0:
            status = receptor_ctl.simple_command(f'work status {unit_id}')
            state_name = status.get('StateName')
            if state_name not in RECEPTOR_ACTIVE_STATES:
                break
            run_timing = time.time() - run_start
            time.sleep(0.5)
        else:
            raise RemoteJobError(f'Receptor job timeout on {node} after {run_timing} seconds, state remains in {state_name}')

        if timing_data:
            timing_data['run_timing'] = run_timing

        stdout = resultfile.read()
        stdout = str(stdout, encoding='utf-8')

    finally:
        if settings.RECEPTOR_RELEASE_WORK:
            res = receptor_ctl.simple_command(f"work release {unit_id}")
            if res != {'released': unit_id}:
                logger.warning(f'Could not confirm release of receptor work unit id {unit_id} from {node}, data: {res}')

        receptor_ctl.close()

    if state_name.lower() == 'failed':
        work_detail = status.get('Detail', '')
        if work_detail:
            if stdout:
                raise RemoteJobError(f'Receptor error from {node}, detail:\n{work_detail}\nstdout:\n{stdout}')
            else:
                raise RemoteJobError(f'Receptor error from {node}, detail:\n{work_detail}')
        else:
            raise RemoteJobError(f'Unknown ansible-runner error on node {node}, stdout:\n{stdout}')

    return stdout


def worker_info(node_name, work_type='ansible-runner'):
    error_list = []
    data = {'errors': error_list, 'transmit_timing': 0.0}

    try:
        stdout = run_until_complete(node=node_name, timing_data=data, params={"params": "--worker-info"})

        yaml_stdout = stdout.strip()
        remote_data = {}
        try:
            remote_data = yaml.safe_load(yaml_stdout)
        except Exception as json_e:
            error_list.append(f'Failed to parse node {node_name} --worker-info output as YAML, error: {json_e}, data:\n{yaml_stdout}')

        if not isinstance(remote_data, dict):
            error_list.append(f'Remote node {node_name} --worker-info output is not a YAML dict, output:{stdout}')
        else:
            error_list.extend(remote_data.pop('errors', []))  # merge both error lists
            data.update(remote_data)

    except RemoteJobError as exc:
        details = exc.args[0]
        if 'unrecognized arguments: --worker-info' in details:
            error_list.append(f'Old version (2.0.1 or earlier) of ansible-runner on node {node_name} without --worker-info')
        else:
            error_list.append(details)

    except Exception as exc:
        error_list.append(str(exc))

    # If we have a connection error, missing keys would be trivial consequence of that
    if not data['errors']:
        # see tasks.py usage of keys
        missing_keys = set(('runner_version', 'mem_in_bytes', 'cpu_count')) - set(data.keys())
        if missing_keys:
            data['errors'].append('Worker failed to return keys {}'.format(' '.join(missing_keys)))

    return data


def _convert_args_to_cli(vargs):
    """
    For the ansible-runner worker cleanup command
    converts the dictionary (parsed argparse variables) used for python interface
    into a string of CLI options, which has to be used on execution nodes.
    """
    args = ['cleanup']
    for option in ('exclude_strings', 'remove_images'):
        if vargs.get(option):
            args.append('--{}={}'.format(option.replace('_', '-'), ' '.join(vargs.get(option))))
    for option in ('file_pattern', 'image_prune', 'process_isolation_executable', 'grace_period'):
        if vargs.get(option) is True:
            args.append('--{}'.format(option.replace('_', '-')))
        elif vargs.get(option) not in (None, ''):
            args.append('--{}={}'.format(option.replace('_', '-'), vargs.get(option)))
    return args


def worker_cleanup(node_name, vargs, timeout=300.0):
    args = _convert_args_to_cli(vargs)

    remote_command = ' '.join(args)
    logger.debug(f'Running command over receptor mesh on {node_name}: ansible-runner worker {remote_command}')

    stdout = run_until_complete(node=node_name, params={"params": remote_command})

    return stdout


_PhaseResult = namedtuple('result', ['status', 'rc'])

RECEPTOR_TERMINAL_STATES = ('Succeeded', 'Failed', 'Canceled')


class ReceptorUnitStream:
    """
    A receptor work unit's results, read from the start, as the process streamer's input.

    The unit may be this node's own, the one the launch submitted or one it adopted earlier,
    or one on another node (an execution node, or the hop node that runs a container group's
    pods), which ``adopt()`` makes this receptor track. Either way ``work results`` serves the
    whole stdout the unit holds, so a resumed read sees the same stream the launch did.
    """

    kind = 'receptor'

    def __init__(self, job, receptor_ctl, unit_id, node=None, config_data=None):
        self.job = job
        self.receptor_ctl = receptor_ctl
        self.unit_id = unit_id
        self.node = node
        self.config_data = config_data
        self.sock = None
        self.sockfile = None
        self.bytes_read = 0
        # When the reader started waiting for bytes that have not come yet; None while it is not waiting
        self._waiting_since = None
        self.closed = False
        self._interrupted = False

    def status(self):
        return self.receptor_ctl.simple_command(f'work status {self.unit_id}')

    def is_known(self):
        """Does this node's receptor have the unit? Raises when receptor cannot be asked at all."""
        try:
            self.status()
        except RuntimeError as exc:
            # receptor's answer for a unit it has no record of
            if str(exc).startswith('unknown work unit'):
                return False
            raise
        return True

    def adopt(self):
        """
        Track, on this node, a unit that another node submitted to ``node``, so that
        ``work results`` can serve it here. receptor's ``work adopt``; the JSON form of the
        command is sent directly because receptorctl 1.6 has no client for it.
        """
        if self.config_data is None:
            self.config_data = read_receptor_config()
        use_stream_tls = get_conn_type(self.node, self.receptor_ctl).name == 'STREAMTLS'
        command = {'command': 'work', 'subcommand': 'adopt', 'node': self.node, 'unitid': self.unit_id}
        tls_client = get_tls_client(self.config_data, use_stream_tls)
        if tls_client:
            command['tlsclient'] = tls_client
        if work_signing_enabled(self.config_data):
            # the string form, which is what receptorctl sends for submit as well
            command['signwork'] = 'true'
        self.receptor_ctl.connect()
        self.receptor_ctl.writestr(json.dumps(command) + '\n')
        reply = self.receptor_ctl.read_and_parse_json()
        # "Adopt Pending" is an adoption too: the unit is allocated here and connects to the node in
        # the background, and ``work results`` serves its output as it arrives.
        if reply.get('result') not in ('Adopted', 'Adopt Pending'):
            raise RuntimeError(f'receptor did not adopt work unit {self.unit_id} from {self.node}: {reply}')
        return reply

    def open(self, follow=True, startpos=0):
        self.sock, self.sockfile = self.receptor_ctl.get_work_results(self.unit_id, startpos=startpos, return_socket=True, return_sockfile=True)
        return self

    def _wait_for(self, reader, *args):
        self._waiting_since = time.monotonic()
        try:
            data = reader(*args)
        finally:
            self._waiting_since = None
        if data:
            self.bytes_read += len(data)
        return data

    def readline(self, *args):
        return self._wait_for(self.sockfile.readline, *args)

    def read(self, *args):
        return self._wait_for(self.sockfile.read, *args)

    def readable(self):
        return True

    def writable(self):
        return False

    def write(self, data):
        # ansible-runner's Base64IO insists the stream it wraps has write(), close(), closed and flush() too
        raise io.UnsupportedOperation('not writable')

    def flush(self):
        pass

    def interrupt(self):
        """Unblock a reader thread stuck in readline(): take the socket away from under it."""
        self._interrupted = True
        self.close()

    def close(self):
        self.closed = True
        if self.sock is not None:
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
        if self.sockfile is not None:
            try:
                self.sockfile.close()
            except Exception:
                pass
        if self.sock is not None:
            try:
                self.sock.close()
            except Exception:
                pass

    def cancel(self):
        self.receptor_ctl.simple_command(f'work cancel {self.unit_id}')

    def release(self):
        if settings.RECEPTOR_RELEASE_WORK:
            self.receptor_ctl.simple_command(f'work release {self.unit_id}')

    def discard(self):
        """Stop the unit and let receptor forget it; False when receptor would not."""
        try:
            self.cancel()
            self.release()
        except Exception:
            logger.exception(f'Could not cancel and release work unit {self.unit_id} of {self.job.log_format}')
            return False
        return True

    def is_live(self):
        """The unit may still produce output. Raises when receptor cannot be asked."""
        return self.status().get('StateName') in RECEPTOR_ACTIVE_STATES

    def stalled(self, idle_seconds):
        """
        The reader has waited idle_seconds for bytes, the unit is done, and its stdout holds more
        than has arrived: the stream between here and the node that holds the output is what
        failed, not the job. A reader that is busy with the events it already has is not waiting,
        however long that takes.
        """
        waiting_since = self._waiting_since
        if waiting_since is None or time.monotonic() - waiting_since < idle_seconds:
            return False
        try:
            status = self.status()
        except Exception:
            return False
        if status.get('StateName') not in RECEPTOR_TERMINAL_STATES:
            return False
        return self.bytes_read < (status.get('StdoutSize') or 0)

    def final_status(self):
        """(status, rc) from the work unit itself, for when the stream carried no status line."""
        status = self.status()
        state = status.get('StateName')
        if state == 'Succeeded':
            return 'successful', 0
        if state == 'Canceled':
            return 'canceled', 1
        return 'failed', 1

    def tail(self, nbytes=1000):
        """The last bytes of the unit's stdout, for a job that failed before producing events."""
        stdout_size = self.status().get('StdoutSize') or 0
        sock, sockfile = self.receptor_ctl.get_work_results(self.unit_id, startpos=max(stdout_size - nbytes, 0), return_socket=True, return_sockfile=True)
        try:
            return b"".join(sockfile.readlines()).decode()
        finally:
            for closer in (sockfile.close, sock.close):
                try:
                    closer()
                except Exception:
                    pass


class AWXReceptorJob:
    def __init__(self, task, runner_params=None, resuming=False):
        self.task = task
        self.runner_params = runner_params
        self.unit_id = None
        self.config_data = None
        self.receptor_ctl = None
        self.stream = None
        # Reading the output of a job another task launched, see BaseTask.resume
        self.resuming = resuming
        # Why the stream ended without a result, for the caller to act on:
        # detached: a shutdown signal arrived and the work was left running for the next monitor
        # requeued: a shutdown signal arrived and the work was cancelled so that the job runs again,
        #   either because the worker never had its payload or because the job is a project update
        # lease_lost: another task took over the job while this one was reading it
        # stream_stalled: the unit finished but the rest of its output never arrived here
        self.detached = False
        self.requeued = False
        self.lease_lost = False
        self.stream_stalled = False
        self.pod_recorded = False
        # A resumed read holds back the streamer's EOF until the job is known to be done
        self.eof_held = False

        if self.task and not self.task.instance.is_container_group_task and not resuming:
            execution_environment_params = self.task.build_execution_environment_params(self.task.instance, runner_params['private_data_dir'])
            self.runner_params.update(execution_environment_params)

        if not settings.IS_K8S and self.work_type == 'local' and 'only_transmit_kwargs' not in self.runner_params:
            self.runner_params['only_transmit_kwargs'] = True

    def run(self):
        # We establish a connection to the Receptor socket
        self.config_data = read_receptor_config()
        receptor_ctl = get_receptor_ctl(self.config_data)
        self.receptor_ctl = receptor_ctl

        res = None
        try:
            res = self._run_internal(receptor_ctl)
            return res
        finally:
            # Once this task is done with the work unit, so is the lease: the output has been
            # read, or will not be, and the post-run hooks that follow (an inventory import, the
            # fact cache) can take longer than a lease lasts without renewal. A task that detached
            # from the unit on shutdown, or that lost the job to a resumed monitor, leaves both
            # alone: the unit, and the pod it stands for, is what the next monitor reads. The
            # unit is released only once the lease is retired, which fails if the job was claimed
            # meanwhile.
            if self.unit_id is not None and not (self.detached or self.lease_lost) and self._retire_lease():
                if settings.RECEPTOR_RELEASE_WORK:
                    try:
                        receptor_ctl.simple_command(f"work release {self.unit_id}")
                    except Exception:
                        logger.exception(f"Error releasing work unit {self.unit_id}.")

    def _retire_lease(self):
        """Remove the job's lease; True when this task still owned the job, and may release its work."""
        job = self.task.instance
        try:
            if JobMonitorLease.objects.retire(job, getattr(self.task, 'owner_task_id', None)):
                return True
            self.lease_lost = True
            logger.warning(f'{job.log_format}: another task took over its monitoring; leaving work unit {self.unit_id} to it')
        except Exception:
            # Cannot tell; a unit left behind is cleaned up by the work unit reaper, a unit
            # released from under a resumed monitor is not recoverable.
            logger.exception(f'Could not retire the monitor lease of {job.log_format}; leaving work unit {self.unit_id}')
        return False

    def _run_internal(self, receptor_ctl):
        self._transmit_phase(receptor_ctl)

        stream = ReceptorUnitStream(self.task.instance, receptor_ctl, self.unit_id, config_data=self.config_data)
        res = self.process_stream(stream, owner_task_id=getattr(self.task, 'owner_task_id', None))
        if self.detached or self.requeued or self.lease_lost:
            return res
        if self.stream_stalled:
            return self.stalled_result(stream)

        if res.status == 'error':
            return self._handle_work_error(stream, res)
        return res

    def stalled_result(self, stream):
        """The job's result from its work unit, for a stream abandoned after the unit finished."""
        status, rc = stream.final_status()
        callback = self.task.runner_callback
        # The streamer's own complaint about the cut stream is not what happened to the job
        callback.extra_update_fields.pop('job_explanation', None)
        callback.delay_update(
            job_explanation=f'The output of work unit {self.unit_id} stopped arriving after the unit finished; the final status was taken from the unit, which reported it as {status}.'
        )
        return _PhaseResult(status, rc)

    def _transmit_phase(self, receptor_ctl):
        # Create a socketpair. Where the left side will be used for writing our payload
        # (private data dir, kwargs). The right side will be passed to Receptor for
        # reading.
        sockin, sockout = socket.socketpair()

        # Prepare the submit_work kwargs before creating threads, because references to settings are not thread-safe
        work_submit_kw = dict(worktype=self.work_type, params=self.receptor_params, signwork=self.sign_work)
        if self.work_type == 'ansible-runner' or self.mesh_node:
            work_submit_kw['node'] = self.mesh_node or self.task.instance.execution_node
            use_stream_tls = get_conn_type(work_submit_kw['node'], receptor_ctl).name == "STREAMTLS"
            if self.mesh_node and not use_stream_tls:
                # Receptor refuses to send the pod spec, a secret_ param, over a connection without TLS
                raise RuntimeError(f'Mesh node {self.mesh_node} must serve its control service over TLS to run the pods of a container group.')
            work_submit_kw['tlsclient'] = get_tls_client(self.config_data, use_stream_tls)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            transmitter_future = executor.submit(self.transmit, sockin)

            # submit our work, passing in the right side of our socketpair for reading.
            result = receptor_ctl.submit_work(payload=sockout.makefile('rb'), **work_submit_kw)

            sockin.close()
            sockout.close()

            self.unit_id = result['unitid']
            # Update the job with the work unit in-memory so that the log_lifecycle
            # will print out the work unit that is to be associated with the job in the database
            # via the update_model() call.
            # We want to log the work_unit_id as early as possible. A failure can happen in between
            # when we start the job in receptor and when we associate the job <-> work_unit_id.
            # In that case, there will be work running in receptor and Controller will not know
            # which Job it is associated with.
            # We do not programatically handle this case. Ideally, we would handle this with a reaper case.
            # The two distinct job lifecycle log events below allow for us to at least detect when this
            # edge case occurs. If the lifecycle event work_unit_id_received occurs without the
            # work_unit_id_assigned event then this case may have occured.
            self.task.instance.work_unit_id = result['unitid']  # Set work_unit_id in-memory only
            self.task.instance.log_lifecycle("work_unit_id_received")
            self.task.update_model(self.task.instance.pk, work_unit_id=result['unitid'])
            self.task.instance.log_lifecycle("work_unit_id_assigned")

            # From here the job is monitored: it is leased to this task until its output has been
            # read. submit_work returns once receptor has the whole payload, so the unit is running
            # or about to, whatever happens to this task.
            JobMonitorLease.objects.start(self.task.instance)
            self.task.instance.log_lifecycle("monitor_leased")

            # Throws an exception if the transmit failed.
            # Will be caught by the try/except in BaseTask#run.
            transmitter_future.result()

        # Artifacts are an output, but sometimes they are an input as well
        # this is the case with fact cache, where clearing facts deletes a file, and this must be captured
        artifact_dir = os.path.join(self.runner_params['private_data_dir'], 'artifacts')
        if self.work_type != 'local' and os.path.exists(artifact_dir):
            shutil.rmtree(artifact_dir)

        self._record_pod(receptor_ctl)

    def _renew_lease(self, owner_task_id):
        """Extend the job's monitor lease; raises LeaseLost when another task owns the job now."""
        job = self.task.instance
        try:
            if owner_task_id:
                JobMonitorLease.objects.renew(job, owner_task_id)
            else:
                JobMonitorLease.objects.filter(unified_job_id=job.pk).update(expires=JobMonitorLease.objects.expiry())
        except LeaseLost:
            raise
        except DatabaseError as exc:
            # Transient, with luck: the lease holds for JOB_MONITOR_LEASE_SECONDS without this.
            logger.warning(f'{job.log_format}: could not renew its monitor lease: {exc}')
        finally:
            # Do not hold an idle connection for the rest of the job over a query every few seconds.
            django_connection.close()

    def _record_pod(self, receptor_ctl):
        """Note which pod a container group job runs in, so its log can be read if this task is lost."""
        if self.pod_recorded or receptor_ctl is None or not self.unit_id:
            return
        if not self.task.instance.is_container_group_task or self.mesh_node:
            self.pod_recorded = True
            return
        try:
            status = receptor_ctl.simple_command(f'work status {self.unit_id}')
        except Exception:
            return
        extra = status.get('ExtraData') or {}
        if not isinstance(extra, dict):
            return
        # receptor settles the namespace before it creates the pod, so both are there once the pod is
        pod_name, namespace = extra.get('PodName'), extra.get('KubeNamespace')
        if not pod_name or not namespace:
            return
        try:
            JobMonitorLease.objects.record(self.task.instance, pod_name=pod_name, pod_namespace=namespace)
        except DatabaseError as exc:
            # Like a lease renewal that fails, not a reason to stop reading: the next renewal tick tries again
            logger.warning(f'{self.task.instance.log_format}: could not record its pod {pod_name} on its monitor lease: {exc}')
            return
        self.task.instance.log_lifecycle("pod_recorded")
        self.pod_recorded = True

    def _record_progress(self):
        """Write to the lease what a later reader needs, trying again at every renewal until it is written."""
        self._record_pod(self.receptor_ctl)
        callback = self.task.runner_callback
        if callback.worker_started and not callback.worker_started_recorded:
            callback.record_worker_started()

    def process_stream(self, stream, owner_task_id=None):
        """
        Read the job's output from ``stream`` with ansible-runner's process streamer, in a
        thread, while this thread keeps the job's monitor lease and watches for signals.
        """
        self.stream = stream
        reader = stream.open()

        connections.close_all()

        # "processor" and the main thread will be separate threads.
        # If a cancel happens, the main thread will encounter an exception, in which case
        # we yank the socket out from underneath the processor, which will cause it to exit.
        # The ThreadPoolExecutor context manager ensures we do not leave any threads laying around.
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            processor_future = executor.submit(self.processor, reader)

            try:
                signal_state.raise_exception = True
                # address race condition where SIGTERM was issued after this dispatcher task started
                if signal_callback():
                    raise SignalExit()
                res = self._await_processor(processor_future, stream, owner_task_id)
            except SignalExit:
                # Nothing below may be interrupted by a second signal
                signal_state.raise_exception = False
                res = self._handle_signal(stream, processor_future)
            finally:
                signal_state.raise_exception = False
                try:
                    stream.close()
                except Exception:
                    pass

        return res

    def _await_processor(self, processor_future, stream, owner_task_id):
        """Wait for the streamer, renewing the lease, and stop reading the moment the job is no longer ours."""
        from ascender.main.tasks.monitor import job_can_detach  # circular import

        interval = settings.JOB_MONITOR_RENEW_SECONDS
        job = self.task.instance
        # Whether a signal interrupts the wait is for the caller to say (process_stream arms it for the
        # wait and disarms it after), and this leaves it as the caller set it on every way out.
        armed = signal_state.raise_exception
        while True:
            try:
                return processor_future.result(timeout=interval)
            except concurrent.futures.TimeoutError:
                pass
            # Database work here must not be torn by a signal; one that arrives is acted on after.
            signal_state.raise_exception = False
            try:
                try:
                    self._renew_lease(owner_task_id)
                except LeaseLost:
                    self.lease_lost = True
                    logger.warning(f'{job.log_format}: its monitoring was taken over by another task; dropping this stream')
                    if not job_can_detach(job):
                        # A project update is never read by another task: its new owner stops it and runs it
                        # again. Stop it from here as well, before this task gives up the lock on its project.
                        self._stop_work(stream, processor_future)
                        return _PhaseResult('error', 1)
                    stream.interrupt()
                    return self._drain(processor_future, 'error')
                self._record_progress()
                if stream.stalled(settings.JOB_MONITOR_STREAM_IDLE_SECONDS):
                    self.stream_stalled = True
                    logger.warning(f'{job.log_format}: work unit {self.unit_id} is done but its output stopped arriving; abandoning the stream')
                    stream.interrupt()
                    return self._drain(processor_future, 'error')
            finally:
                signal_state.raise_exception = armed
            if signal_callback():
                raise SignalExit()

    def _drain(self, processor_future, status):
        """Let the streamer thread notice its closed stream and exit, then answer for it."""
        try:
            processor_future.result(timeout=settings.JOB_MONITOR_RENEW_SECONDS)
        except concurrent.futures.TimeoutError:
            logger.error(f'{self.task.instance.log_format}: the streamer thread did not stop after its stream was closed')
        except Exception:
            pass
        return _PhaseResult(status, 1)

    def _cancel_requested(self):
        """
        The job row's cancel_flag, which UnifiedJob.cancel() commits before it signals the
        dispatcher, is what tells a cancel from a shutdown: the signal itself cannot.
        """
        try:
            return bool(UnifiedJob.objects.filter(pk=self.task.instance.pk).values_list('cancel_flag', flat=True).first())
        except Exception:
            logger.warning(f'{self.task.instance.log_format}: could not read its cancel flag; treating the signal as a shutdown', exc_info=True)
            return False

    def _handle_signal(self, stream, processor_future):
        """
        A SIGTERM reached this task. Only a cancel means the work should stop. On a shutdown
        the work goes on without us: an execution environment that has its payload is left
        running for the next monitor. One that has not is cancelled and the job re-queued,
        since nothing has run yet, and so is a project update, which is never left running
        without the lock on its project (see job_can_detach). An inline project sync is only
        cancelled, since the job that runs it is stopping too, and so is a job that cannot be
        re-queued (see can_requeue). A job whose work could not be cancelled is not re-queued
        either, which would start a second copy: it is left to the next monitor, which re-queues
        it only once it has stopped what is left.
        """
        from ascender.main.tasks.monitor import can_requeue, is_inline_sync, job_can_detach  # circular import

        job = self.task.instance
        if self._cancel_requested():
            self._stop_work(stream, processor_future)
            return _PhaseResult('canceled', 1)

        if self.resuming or (self.task.runner_callback.worker_started and job_can_detach(job)):
            self.detached = True
            logger.warning(f'{job.log_format}: shutdown signal received; detaching from its output without stopping the job')
            stream.interrupt()
            self._drain(processor_future, 'error')
            return _PhaseResult('detached', 1)

        if is_inline_sync(job) or not can_requeue(job):
            logger.warning(f'{job.log_format}: shutdown signal received; cancelling work unit {self.unit_id}, and the job cannot be re-queued')
            self._stop_work(stream, processor_future)
            return _PhaseResult('canceled', 1)
        # Set before the stream is dropped: the streamer's finished callback runs as the stream is
        # drained, and must send no EOF for an attempt that is given up (see finished_callback).
        self.requeued = True
        if not self._stop_work(stream, processor_future):
            self.requeued, self.detached = False, True
            logger.warning(
                f'{job.log_format}: shutdown signal received; work unit {self.unit_id} could not be cancelled, so the next monitor, not a second run, takes the job'
            )
            return _PhaseResult('detached', 1)
        why = 'the project update' if not job_can_detach(job) else 'its execution environment had not received its payload, so the job'
        logger.warning(f'{job.log_format}: shutdown signal received; {why} is cancelled (work unit {self.unit_id}) and re-queued')
        return _PhaseResult('canceled', 1)

    def _stop_work(self, stream, processor_future):
        """Cancel the work and drop the stream; False when the work could not be cancelled."""
        try:
            cancelled = stream.cancel() is not False
        except Exception:
            logger.exception(f'{self.task.instance.log_format}: could not cancel work unit {self.unit_id}')
            cancelled = False
        stream.interrupt()
        self._drain(processor_future, 'canceled')
        return cancelled

    def _handle_work_error(self, stream, res):
        # If ansible-runner ran, but an error occured at runtime, the traceback information
        # is saved via the status_handler passed in to the processor.
        if 'result_traceback' in self.task.runner_callback.extra_update_fields:
            return res

        try:
            unit_status = stream.status()
            detail = unit_status.get('Detail', None)
            state_name = unit_status.get('StateName', None)
        except Exception:
            detail = ''
            state_name = ''
            logger.exception(f'An error was encountered while getting status for work unit {self.unit_id}')

        if 'exceeded quota' in detail:
            logger.warning(detail)
            log_name = self.task.instance.log_format
            logger.warning(f"Could not launch pod for {log_name}. Exceeded quota.")
            JobMonitorLease.objects.finish(self.task.instance)
            self.task.update_model(self.task.instance.pk, status='pending')
            return

        try:
            receptor_output = ''
            if state_name == 'Failed' and self.task.runner_callback.event_ct == 0:
                # if receptor work unit failed and no events were emitted, work results may
                # contain useful information about why the job failed. In case stdout is
                # massive, only ask for last 1000 bytes
                receptor_output = stream.tail(1000)
            if receptor_output:
                self.task.runner_callback.delay_update(result_traceback=f'Worker output:\n{receptor_output}')
            elif detail:
                self.task.runner_callback.delay_update(result_traceback=f'Receptor detail:\n{detail}')
            else:
                logger.warning(f'No result details or output from {self.task.instance.log_format}, status:\n{state_name}')
        except Exception:
            logger.exception(f'Work results error from job id={self.task.instance.id} work_unit={self.task.instance.work_unit_id}')
            raise RuntimeError(detail)

        return res

    # Spawned in a thread so Receptor can start reading before we finish writing, we
    # write our payload to the left side of our socketpair.
    @cleanup_new_process
    def transmit(self, _socket):
        try:
            ansible_runner.interface.run(streamer='transmit', _output=_socket.makefile('wb'), **self.runner_params)
        finally:
            # Socket must be shutdown here, or the reader will hang forever.
            _socket.shutdown(socket.SHUT_WR)

    def finished_callback(self, runner_obj):
        """
        The streamer calls this however its stream ended. A stream abandoned for another task
        to read is not the end of the job's output, so it sends no EOF, which would announce an
        event count the job has not reached and, for most job types, wrap the job up early. A
        resumed read only learns afterwards whether a stream that ended without a status line
        ended with the job, so it holds the EOF back for BaseTask.resume to send.
        """
        if self.detached or self.requeued or self.lease_lost:
            return
        if self.resuming:
            self.eof_held = True
            return
        self.task.runner_callback.finished_callback(runner_obj)

    @cleanup_new_process
    def processor(self, resultfile):
        return ansible_runner.interface.run(
            streamer='process',
            quiet=True,
            _input=resultfile,
            event_handler=self.task.runner_callback.event_handler,
            finished_callback=self.finished_callback,
            status_handler=self.task.runner_callback.status_handler,
            artifacts_handler=self.task.runner_callback.artifacts_handler,
            **self.runner_params,
        )

    @property
    def receptor_params(self):
        if self.task.instance.is_container_group_task:
            spec_yaml = yaml.dump(self.pod_definition, explicit_start=True)

            receptor_params = {
                "secret_kube_pod": spec_yaml,
                "pod_pending_timeout": getattr(settings, 'ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT', "5m"),
            }

            if self.credential:
                kubeconfig_yaml = yaml.dump(self.kube_config, explicit_start=True)
                receptor_params["secret_kube_config"] = kubeconfig_yaml
        else:
            private_data_dir = self.runner_params['private_data_dir']
            if self.work_type == 'ansible-runner' and settings.ASCENDER_CLEANUP_PATHS:
                # on execution nodes, we rely on the private data dir being deleted
                cli_params = f"--private-data-dir={private_data_dir} --delete"
            else:
                # on hybrid nodes, we rely on the private data dir NOT being deleted
                cli_params = f"--private-data-dir={private_data_dir}"
            receptor_params = {"params": cli_params}

        return receptor_params

    @property
    def sign_work(self):
        if self.work_type in ('ansible-runner', 'local') or self.mesh_node:
            return work_signing_enabled(self.config_data)
        return False

    @property
    def mesh_node(self):
        """Hostname of the hop node that runs the pod of a container group in its own cluster, if any."""
        if self.task and self.task.instance.is_container_group_task:
            mesh_node = self.task.instance.instance_group.mesh_node
            if mesh_node:
                return mesh_node.hostname
        return None

    @property
    def work_type(self):
        if self.task.instance.is_container_group_task:
            # A mesh node authenticates with the service account it runs under, never with a credential of ours
            if self.credential and not self.mesh_node:
                return 'kubernetes-runtime-auth'
            return 'kubernetes-incluster-auth'
        if self.task.instance.execution_node == settings.CLUSTER_HOST_ID or self.task.instance.execution_node == self.task.instance.controller_node:
            return 'local'
        return 'ansible-runner'

    @property
    def pod_definition(self):
        ee = self.task.instance.execution_environment

        default_pod_spec = get_default_pod_spec()

        pod_spec_override = {}
        if self.task and self.task.instance.instance_group.pod_spec_override:
            pod_spec_override = parse_yaml_or_json(self.task.instance.instance_group.pod_spec_override)
        # According to the deepmerge docstring, the second dictionary will override when
        # they share keys, which is the desired behavior.
        # This allows user to only provide elements they want to override, and for us to still provide any
        # defaults they don't want to change
        pod_spec = deepmerge(default_pod_spec, pod_spec_override)

        # The default namespace belongs to this cluster and means nothing on the one behind a mesh
        # node, so drop it and let the namespace configured on that node's receptor apply. An override
        # still carrying the default is treated the same, since the UI seeds its editor with it.
        override_namespace = (pod_spec_override.get('metadata') or {}).get('namespace')
        if self.mesh_node and override_namespace in (None, '', settings.ASCENDER_CONTAINER_GROUP_DEFAULT_NAMESPACE):
            pod_spec['metadata'].pop('namespace', None)

        pod_spec['spec']['containers'][0]['image'] = ee.image
        pod_spec['spec']['containers'][0]['args'] = ['ansible-runner', 'worker', '--private-data-dir=/runner']

        if settings.ASCENDER_RUNNER_KEEPALIVE_SECONDS:
            pod_spec['spec']['containers'][0].setdefault('env', [])
            pod_spec['spec']['containers'][0]['env'].append(
                {'name': 'ANSIBLE_RUNNER_KEEPALIVE_SECONDS', 'value': str(settings.ASCENDER_RUNNER_KEEPALIVE_SECONDS)}
            )

        # Enforce EE Pull Policy
        pull_options = {"always": "Always", "missing": "IfNotPresent", "never": "Never"}
        if self.task and self.task.instance.execution_environment:
            if self.task.instance.execution_environment.pull:
                pod_spec['spec']['containers'][0]['imagePullPolicy'] = pull_options[self.task.instance.execution_environment.pull]

        # This allows the user to also expose the isolated path list
        # to EEs running in k8s/ocp environments, i.e. container groups.
        # This assumes the node and SA supports hostPath volumes
        # type is not passed due to backward compatibility,
        # which means that no checks will be performed before mounting the hostPath volume.
        if settings.ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S and settings.ASCENDER_ISOLATION_SHOW_PATHS:
            spec_volume_mounts = []
            spec_volumes = []

            for idx, this_path in enumerate(settings.ASCENDER_ISOLATION_SHOW_PATHS):
                mount_option = None
                if this_path.count(':') == MAX_ISOLATED_PATH_COLON_DELIMITER:
                    src, dest, mount_option = this_path.split(':')
                elif this_path.count(':') == MAX_ISOLATED_PATH_COLON_DELIMITER - 1:
                    src, dest = this_path.split(':')
                else:
                    src = dest = this_path

                # Enforce read-only volume if 'ro' has been explicitly passed
                # We do this so we can use the same configuration for regular scenarios and k8s
                # Since flags like ':O', ':z' or ':Z' are not valid in the k8s realm
                # Example: /data:/data:ro
                read_only = bool('ro' == mount_option)

                # Since type is not being passed, k8s by default will not perform any checks if the
                # hostPath volume exists on the k8s node itself.
                spec_volumes.append({'name': f'volume-{idx}', 'hostPath': {'path': src}})

                spec_volume_mounts.append({'name': f'volume-{idx}', 'mountPath': f'{dest}', 'readOnly': read_only})

            # merge any volumes definition already present in the pod_spec
            if 'volumes' in pod_spec['spec']:
                pod_spec['spec']['volumes'] += spec_volumes
            else:
                pod_spec['spec']['volumes'] = spec_volumes

            # merge any volumesMounts definition already present in the pod_spec
            if 'volumeMounts' in pod_spec['spec']['containers'][0]:
                pod_spec['spec']['containers'][0]['volumeMounts'] += spec_volume_mounts
            else:
                pod_spec['spec']['containers'][0]['volumeMounts'] = spec_volume_mounts

        if self.task and self.task.instance.is_container_group_task and not self.mesh_node:
            # If EE credential is passed, create an imagePullSecret.
            # We cannot reach the API of the cluster behind a mesh node, so there the pull secret has to
            # exist already and be named in the pod spec override.
            if self.task.instance.execution_environment and self.task.instance.execution_environment.credential:
                # Create pull secret in k8s cluster based on ee cred
                from ascender.main.scheduler.kubernetes import PodManager  # prevent circular import

                pm = PodManager(self.task.instance)
                secret_name = pm.create_secret(job=self.task.instance)

                # Inject secret name into podspec
                pod_spec['spec']['imagePullSecrets'] = [{"name": secret_name}]

        if self.task:
            pod_spec['metadata'] = deepmerge(
                pod_spec.get('metadata', {}),
                dict(name=self.pod_name, labels={'ansible-awx': settings.INSTALL_UUID, 'ansible-awx-job-id': str(self.task.instance.id)}),
            )

        return pod_spec

    @property
    def pod_name(self):
        return f"automation-job-{self.task.instance.id}"

    @property
    def credential(self):
        return self.task.instance.instance_group.credential

    @property
    def namespace(self):
        return self.pod_definition['metadata']['namespace']

    @property
    def kube_config(self):
        from ascender.main.scheduler.kubernetes import apply_tls_verification  # prevent circular import

        host_input = self.credential.get_input('host')
        config = {
            "apiVersion": "v1",
            "kind": "Config",
            "preferences": {},
            "clusters": [{"name": host_input, "cluster": {"server": host_input}}],
            "users": [{"name": host_input, "user": {"token": self.credential.get_input('bearer_token')}}],
            "contexts": [{"name": host_input, "context": {"cluster": host_input, "user": host_input, "namespace": self.namespace}}],
            "current-context": host_input,
        }

        apply_tls_verification(config, self.credential)
        return config


# TODO: receptor reload expects ordering within config items to be preserved
# if python dictionary is not preserving order properly, may need to find a
# solution. yaml.dump does not seem to work well with OrderedDict. below line may help
# yaml.add_representer(OrderedDict, lambda dumper, data: dumper.represent_mapping('tag:yaml.org,2002:map', data.items()))
#
RECEPTOR_CONFIG_STARTER = (
    {'local-only': None},
    {'log-level': settings.RECEPTOR_LOG_LEVEL},
    {'node': {'firewallrules': [{'action': 'reject', 'tonode': settings.CLUSTER_HOST_ID, 'toservice': 'control'}]}},
    {'control-service': {'service': 'control', 'filename': '/var/run/receptor/receptor.sock', 'permissions': '0660'}},
    {'work-command': {'worktype': 'local', 'command': 'ansible-runner', 'params': 'worker', 'allowruntimeparams': True}},
    {'work-signing': {'privatekey': '/etc/receptor/work_private_key.pem', 'tokenexpiration': '1m'}},
    {
        'work-kubernetes': {
            'worktype': 'kubernetes-runtime-auth',
            'authmethod': 'runtime',
            'allowruntimeauth': True,
            'allowruntimepod': True,
            'allowruntimeparams': True,
        }
    },
    {
        'work-kubernetes': {
            'worktype': 'kubernetes-incluster-auth',
            'authmethod': 'incluster',
            'allowruntimeauth': True,
            'allowruntimepod': True,
            'allowruntimeparams': True,
        }
    },
    {
        'tls-client': {
            'name': 'tlsclient',
            'rootcas': '/etc/receptor/tls/ca/mesh-CA.crt',
            'cert': '/etc/receptor/tls/receptor.crt',
            'key': '/etc/receptor/tls/receptor.key',
            'mintls13': False,
        }
    },
)


def should_update_config(new_config):
    '''
    checks that the list of instances matches the list of
    tcp-peers in the config
    '''

    current_config = read_receptor_config()  # this gets receptor conf lock
    for config_entry in current_config:
        if config_entry not in new_config:
            logger.warning(f"{config_entry} should not be in receptor config. Updating.")
            return True
    for config_entry in new_config:
        if config_entry not in current_config:
            logger.warning(f"{config_entry} missing from receptor config. Updating.")
            return True

    return False


def generate_config_data():
    # returns two values
    #   receptor config - based on current database peers
    #   should_update   - If True, receptor_config differs from the receptor conf file on disk
    addresses = ReceptorAddress.objects.filter(peers_from_control_nodes=True)

    receptor_config = list(RECEPTOR_CONFIG_STARTER)
    for address in addresses:
        if address.get_peer_type():
            peer = {
                f'{address.get_peer_type()}': {
                    'address': f'{address.get_full_address()}',
                    'tls': 'tlsclient',
                }
            }
            receptor_config.append(peer)
        else:
            logger.warning(f"Receptor address {address} has unsupported peer type, skipping.")
    should_update = should_update_config(receptor_config)
    return receptor_config, should_update


def reload_receptor():
    logger.warning("Receptor config changed, reloading receptor")

    # This needs to be outside of the lock because this function itself will acquire the lock.
    receptor_ctl = get_receptor_ctl()

    attempts = 10
    for backoff in range(1, attempts + 1):
        try:
            receptor_ctl.simple_command("reload")
            break
        except ValueError:
            logger.warning(f"Unable to reload Receptor configuration. {attempts - backoff} attempts left.")
            time.sleep(backoff)
    else:
        raise RuntimeError("Receptor reload failed")


@task()
def write_receptor_config():
    """
    This task runs async on each control node, K8S only.
    It is triggered whenever remote is added or removed, or if peers_from_control_nodes
    is flipped.
    It is possible for write_receptor_config to be called multiple times.
    For example, if new instances are added in quick succession.
    To prevent that case, each control node first grabs a DB advisory lock, specific
    to just that control node (i.e. multiple control nodes can run this function
    at the same time, since it only writes the local receptor config file)
    """
    with advisory_lock(f"{settings.CLUSTER_HOST_ID}_write_receptor_config", wait=True):
        # Config file needs to be updated
        receptor_config, should_update = generate_config_data()
        if should_update:
            lock = FileLock(__RECEPTOR_CONF_LOCKFILE)
            with lock:
                with open(__RECEPTOR_CONF, 'w') as file:
                    yaml.dump(receptor_config, file, default_flow_style=False)
            reload_receptor()


@task(queue=get_task_queuename)
def remove_deprovisioned_node(hostname):
    InstanceLink.objects.filter(source__hostname=hostname).update(link_state=InstanceLink.States.REMOVING)
    InstanceLink.objects.filter(target__instance__hostname=hostname).update(link_state=InstanceLink.States.REMOVING)

    node_jobs = UnifiedJob.objects.filter(
        execution_node=hostname,
        status__in=(
            'running',
            'waiting',
        ),
    )
    while node_jobs.exists():
        time.sleep(60)

    # This will as a side effect also delete the InstanceLinks that are tied to it.
    Instance.objects.filter(hostname=hostname).delete()
