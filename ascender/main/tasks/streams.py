# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Reading a container group job's output straight from its pod.

A container group job runs in a pod that receptor created, but the receptor work unit that
watched it lived in the control pod's own receptor, whose data directory is gone the moment
that pod is replaced. The job pod is not: it is a Kubernetes object in its own right, and its
log holds the same bytes the work unit's results socket carried, the ``ansible-runner worker``
event stream, during and after execution. PodLogStream reads that log the way the results
socket was read, as a file-like object with readline() for the event lines and read(n) for the
base64 artifacts archive at the end, so ansible-runner's process streamer consumes it unchanged.

The kubelet serves the log with one timestamp per line when asked. Those are what let a dropped
connection be resumed in place: the stream reopens from the last timestamp seen and skips the
lines it already delivered, which is the same reconnect receptor itself uses for these pods.
A connection that stays silent for JOB_MONITOR_STREAM_IDLE_SECONDS is reopened the same way,
so a connection that died without being closed cannot hold the stream forever.
"""

import io
import logging
import re
import socket
from datetime import datetime, timezone

from kubernetes.client.rest import ApiException
from urllib3.exceptions import ReadTimeoutError

from ascender.settings.typed import settings

logger = logging.getLogger('ascender.main.tasks.streams')

# The pod is done and its log is complete.
TERMINAL_PHASES = ('Succeeded', 'Failed')
# The pod may still produce output.
LIVE_PHASES = ('Pending', 'Running')

# receptor names the container it streams, and the one the pod spec must contain, "worker"
WORKER_CONTAINER = 'worker'

# "2026-11-10T20:01:02.123456789Z <message>"; the kubelet trims trailing zeros of the fraction
_TIMESTAMP_RE = re.compile(rb'^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z ')


def pod_phase(pod):
    return ((pod or {}).get('status') or {}).get('phase')


def worker_container_status(pod):
    """The status of the pod's worker container, or of its only container when it is named differently."""
    statuses = ((pod or {}).get('status') or {}).get('container_statuses') or []
    for status in statuses:
        if status.get('name') == WORKER_CONTAINER:
            return status
    return statuses[0] if statuses else None


def container_terminated(pod):
    """The terminated state of the worker container, or None while it has not finished."""
    status = worker_container_status(pod)
    return ((status or {}).get('state') or {}).get('terminated') or None


def container_started_at(pod):
    """When the worker container started running, or None while it has not."""
    status = worker_container_status(pod)
    return (((status or {}).get('state') or {}).get('running') or {}).get('started_at')


def pod_created_at(pod):
    return ((pod or {}).get('metadata') or {}).get('creation_timestamp')


def pod_exit_code(pod):
    """
    The worker container's exit code once the pod is done.

    The pod phase only distinguishes success from failure; the container's own terminated
    state carries the real code. A successful job exits 0, so the check is for None, not falsy.
    """
    terminated = container_terminated(pod)
    if terminated and terminated.get('exit_code') is not None:
        return int(terminated['exit_code'])
    return 0 if pod_phase(pod) == 'Succeeded' else 1


class PodLogStream:
    """
    A file-like view of a job pod's log, timestamps stripped, that survives dropped connections.

    ``open()`` returns the stream itself. ``readline()`` serves the event lines and ``read(n)``
    the artifacts archive, which is how ansible-runner's Processor and its Base64IO reader
    consume a results socket today. With ``follow`` the stream keeps reading until the pod's
    worker container has finished; without it, it serves what the log holds now, which is how
    a pod that finished while nobody was watching is harvested.
    """

    kind = 'pod'

    def __init__(self, job, pod_name='', namespace='', pod_manager=None):
        self.job = job
        self.pod_name = pod_name
        self.namespace = namespace
        if pod_manager is None:
            from ascender.main.scheduler.kubernetes import PodManager  # circular import through the scheduler package

            pod_manager = PodManager(job)
        self._pm = pod_manager
        self.pod = None
        self.follow = True
        self._resp = None
        self._chunks = None
        self._rawbuf = b''
        self._buf = b''
        self._last_stamp = None
        self._interrupted = False
        self._final_pass_done = False
        self._eof = False
        self.reconnects = 0
        self.closed = False

    # -- the pod ----------------------------------------------------------------------------

    @property
    def api(self):
        return self._pm.kube_api

    @property
    def _timeout(self):
        return settings.ASCENDER_CONTAINER_GROUP_K8S_API_TIMEOUT

    @property
    def _stream_timeout(self):
        """(connect, read): a log connection silent for longer than the read timeout is reopened."""
        return (settings.ASCENDER_CONTAINER_GROUP_K8S_API_TIMEOUT, settings.JOB_MONITOR_STREAM_IDLE_SECONDS)

    @property
    def _namespace(self):
        return self.namespace or self._pm.namespace

    def find_pod(self):
        """
        Load the job's pod: by the name recorded on its lease, or by its labels when the
        controller died before the name was recorded. None when no pod exists.
        """
        if self.pod_name:
            self.pod = self._read_pod()
            return self.pod
        namespace = self._namespace
        selector = f'ansible-awx={settings.INSTALL_UUID},ansible-awx-job-id={self.job.id}'
        items = self.api.list_namespaced_pod(namespace, label_selector=selector, _request_timeout=self._timeout).to_dict().get('items') or []
        if not items:
            self.pod = None
            return None
        # A re-queued job keeps its id, so the pod of its first run can still be terminating; the newest is the current run's.
        floor = datetime.min.replace(tzinfo=timezone.utc)
        items.sort(key=lambda p: pod_created_at(p) or floor)
        self.pod = items[-1]
        self.pod_name = self.pod['metadata']['name']
        self.namespace = self.pod['metadata']['namespace']
        return self.pod

    def _read_pod(self):
        try:
            return self.api.read_namespaced_pod(self.pod_name, self._namespace, _request_timeout=self._timeout).to_dict()
        except ApiException as exc:
            if exc.status == 404:
                return None
            raise

    def refresh(self):
        self.pod = self._read_pod()
        return self.pod

    @property
    def container_name(self):
        containers = (((self.pod or {}).get('spec') or {}).get('containers')) or []
        for container in containers:
            if container.get('name') == WORKER_CONTAINER:
                return WORKER_CONTAINER
        return containers[0]['name'] if containers else WORKER_CONTAINER

    def is_live(self):
        """The worker container has not finished, so more output may come."""
        pod = self.refresh()
        if pod is None or pod_phase(pod) not in LIVE_PHASES:
            return False
        return container_terminated(pod) is None

    def has_output(self):
        """
        Has the pod written anything yet?

        One line is enough: a pod with output has received its payload and is running the
        playbook, a silent one may still be waiting for it. ``_preload_content=False`` is what
        makes the answer right, because the client's own deserialization of an empty log
        yields the three-character string "b''", which is truthy.
        """
        resp = self.api.read_namespaced_pod_log(
            name=self.pod_name, namespace=self._namespace, container=self.container_name, tail_lines=1, _preload_content=False, _request_timeout=self._timeout
        )
        try:
            return bool(resp.data and resp.data.strip())
        finally:
            resp.release_conn()

    def exit_code(self):
        self.refresh()
        return pod_exit_code(self.pod)

    def final_status(self):
        """(status, rc) from the pod once its log is exhausted, for when the stream carried no status line."""
        rc = self.exit_code()
        return ('successful' if rc == 0 else 'failed'), rc

    # -- the stream ---------------------------------------------------------------------------

    def open(self, follow=None):
        if follow is not None:
            self.follow = follow
        if self.pod is None:
            self.refresh()
        self._open_stream(since=None)
        return self

    def _open_stream(self, since):
        if since is None:
            self._resp = self.api.read_namespaced_pod_log(
                name=self.pod_name,
                namespace=self._namespace,
                container=self.container_name,
                follow=self.follow,
                timestamps=True,
                _preload_content=False,
                _request_timeout=self._stream_timeout,
            )
        else:
            self._resp = self._read_log_since(since)
        # Chunk by chunk as the API sends them, never waiting to fill a buffer: a followed log
        # is served with chunked transfer encoding, one chunk per write by the container, and
        # a buffered reader over it would hold each event back until 8 KiB had accumulated.
        self._chunks = self._resp.stream(amt=65536, decode_content=False)
        self._rawbuf = b''

    def _read_log_since(self, since):
        """
        The pod's log from the second ``since`` on, which is how receptor itself reconnects to these pods.

        The log API takes sinceTime, but the generated client's read_namespaced_pod_log leaves the
        parameter out and rejects since_time as an unexpected keyword argument. This sends the request
        that method sends, with sinceTime added. sinceSeconds would work only as far as this node's
        clock agrees with the kubelet's.
        """
        client = self.api.api_client
        return client.call_api(
            '/api/v1/namespaces/{namespace}/pods/{name}/log',
            'GET',
            path_params={'name': self.pod_name, 'namespace': self._namespace},
            query_params=[('container', self.container_name), ('follow', self.follow), ('sinceTime', since), ('timestamps', True)],
            # The media types read_namespaced_pod_log offers, of which the client picks JSON: the API
            # server answers a log request that accepts only text/plain with 406 Not Acceptable.
            header_params={
                'Accept': client.select_header_accept(
                    ['text/plain', 'application/json', 'application/yaml', 'application/vnd.kubernetes.protobuf', 'application/cbor']
                )
            },
            auth_settings=['BearerToken'],
            response_types_map={200: 'str', 401: None},
            _return_http_data_only=True,
            _preload_content=False,
            _request_timeout=self._stream_timeout,
        )

    def _raw_readline(self):
        """The next raw line of the current connection, as soon as it is complete; b'' at its end."""
        while b'\n' not in self._rawbuf:
            if self._chunks is None:
                break
            try:
                chunk = next(self._chunks)
            except StopIteration:
                break
            if chunk:
                self._rawbuf += chunk
        if b'\n' not in self._rawbuf:
            line, self._rawbuf = self._rawbuf, b''
            return line
        line, _, self._rawbuf = self._rawbuf.partition(b'\n')
        return line + b'\n'

    def _close_resp(self):
        resp, self._resp, self._chunks = self._resp, None, None
        self._rawbuf = b''
        if resp is not None:
            # Close before releasing: a followed log is still streaming, and a connection handed
            # back to the pool open would carry the rest of it into the next API call made on it.
            try:
                resp.close()
            except Exception:
                pass
            try:
                resp.release_conn()
            except Exception:
                pass

    def _since(self):
        """The last timestamp seen at second precision, which is all the log API accepts."""
        if self._last_stamp is None:
            return None
        return self._last_stamp[0].decode() + 'Z'

    def _reconnect(self, follow):
        self.reconnects += 1
        self._close_resp()
        self.follow = follow
        self._open_stream(since=self._since())

    def _next_line(self):
        """
        The next raw log line, reconnecting while the pod is live. b'' once nothing more will come.

        An error from the Kubernetes API while deciding whether to reconnect is raised: the
        caller cannot tell a finished pod from an unreachable API, and must not guess.
        """
        while True:
            if self._chunks is None or self._interrupted:
                return b''
            try:
                line = self._raw_readline()
            except Exception as exc:
                if self._interrupted:
                    return b''
                if isinstance(exc, ReadTimeoutError):
                    logger.debug(
                        f'Log stream of pod {self.pod_name} for {self.job.log_format} idle for {settings.JOB_MONITOR_STREAM_IDLE_SECONDS}s; reopening it'
                    )
                else:
                    logger.info(f'Log stream of pod {self.pod_name} for {self.job.log_format} dropped ({exc!r}); reconnecting')
                line = b''
            if line:
                return line
            if self._interrupted or self._final_pass_done:
                return b''
            if self.follow and self.is_live():
                self._reconnect(follow=True)
                continue
            # The pod has finished, or this is a harvest of a finished pod. A stream that ended on its
            # own has everything, but one that broke may have missed the last lines, so serve what was
            # written after the last line seen, without following, exactly once.
            self._final_pass_done = True
            try:
                self._reconnect(follow=False)
            except ApiException as exc:
                if exc.status != 404:
                    raise
                return b''

    def _fill(self):
        """Move the next log line, minus its timestamp, into the buffer. False at the end."""
        while True:
            line = self._next_line()
            if not line:
                return False
            m = _TIMESTAMP_RE.match(line)
            if m:
                stamp = (m.group(1), int((m.group(2) or b'0').ljust(9, b'0')))
                body = line[m.end() :]
                # A reconnect replays from the last timestamp at second precision; these were delivered already.
                if self._last_stamp is not None and stamp <= self._last_stamp:
                    continue
                self._last_stamp = stamp
            else:
                body = line
            if not body.strip():
                continue
            self._buf += body
            return True

    def readline(self, size=-1):
        while b'\n' not in self._buf:
            if not self._fill():
                line, self._buf = self._buf, b''
                return line
        line, _, self._buf = self._buf.partition(b'\n')
        return line + b'\n'

    def read(self, size=-1):
        if size is None or size < 0:
            while self._fill():
                pass
            data, self._buf = self._buf, b''
            return data
        while len(self._buf) < size:
            if not self._fill():
                break
        data, self._buf = self._buf[:size], self._buf[size:]
        return data

    def readable(self):
        return True

    def writable(self):
        return False

    def write(self, data):
        # ansible-runner's Base64IO insists the stream it wraps has write(), close(), closed and flush() too
        raise io.UnsupportedOperation('not writable')

    def flush(self):
        pass

    def close(self):
        self.closed = True
        self._close_resp()

    def interrupt(self):
        """Unblock a reader thread stuck in readline(): close the connection under it."""
        self._interrupted = True
        resp = self._resp
        if resp is None:
            return
        conn = getattr(resp, 'connection', None) or getattr(resp, '_connection', None)
        sock = getattr(conn, 'sock', None)
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
        self._close_resp()

    # -- the pod's lifecycle ----------------------------------------------------------------

    def delete_pod(self):
        """Delete the job pod; False when it could not be, so the caller can decide to wait."""
        try:
            self.api.delete_namespaced_pod(name=self.pod_name, namespace=self._namespace, _request_timeout=self._timeout)
            return True
        except ApiException as exc:
            if exc.status == 404:
                return True
            logger.exception(f'Failed to delete pod {self.pod_name} of {self.job.log_format}')
            return False
        except Exception:
            logger.exception(f'Failed to delete pod {self.pod_name} of {self.job.log_format}')
            return False

    def cancel(self):
        self.delete_pod()

    def release(self):
        """What ``work release`` would have done for this pod: remove it, once the job is final."""
        if settings.RECEPTOR_RELEASE_WORK:
            self.delete_pod()

    def stalled(self, idle_seconds):
        # A silent connection is reopened by the read timeout instead, see _stream_timeout
        return False
