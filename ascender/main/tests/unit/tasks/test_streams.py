import io
import json
import time
from datetime import datetime, timezone
from unittest import mock

import pytest
from kubernetes.client.rest import ApiException
from urllib3.exceptions import ReadTimeoutError

from ascender.main.tasks import streams
from ascender.main.tasks.receptor import ReceptorUnitStream
from ascender.main.tasks.streams import PodLogStream, pod_exit_code, container_terminated, container_started_at


class FakeResponse:
    """
    What read_namespaced_pod_log returns with _preload_content=False: a raw urllib3 response,
    streamed in chunks. An exception in the payload list is raised where it stands, the way a
    read timeout or a dropped connection surfaces from urllib3.
    """

    def __init__(self, payload):
        self.payload = payload
        self.closed = False
        self.released = False
        self.calls = []
        self.data = payload if isinstance(payload, bytes) else b''

    def stream(self, amt=None, decode_content=None):
        parts = self.payload if isinstance(self.payload, list) else [self.payload]
        for part in parts:
            if isinstance(part, Exception):
                raise part
            # one chunk per line, the way the kubelet relays each write; the last one may lack its newline
            for line in io.BytesIO(part):
                yield line

    def release_conn(self):
        self.released = True
        self.calls.append('release_conn')

    def close(self):
        self.closed = True
        self.calls.append('close')


class FakeKubeApi:
    """Serves a pod and successive versions of its log, the way the API would across reconnects."""

    def __init__(self, pod, logs):
        self.pod = pod
        self.logs = list(logs)  # one payload per connection, in order
        self.log_calls = []
        self.responses = []
        self.deleted = []

    def read_namespaced_pod(self, name, namespace, **kwargs):
        if self.pod is None:
            raise ApiException(status=404)
        v = mock.Mock()
        v.to_dict.return_value = self.pod
        return v

    def list_namespaced_pod(self, namespace, label_selector=None, **kwargs):
        v = mock.Mock()
        v.to_dict.return_value = {'items': [self.pod] if self.pod else []}
        return v

    def read_namespaced_pod_log(self, name, namespace, **kwargs):
        self.log_calls.append(kwargs)
        if kwargs.get('tail_lines'):
            return FakeResponse(self.logs[0][-200:] if self.logs else b'')
        payload = self.logs.pop(0) if self.logs else b''
        self.responses.append(FakeResponse(payload))
        return self.responses[-1]

    def delete_namespaced_pod(self, name, namespace, **kwargs):
        self.deleted.append(name)


def running_pod(name='automation-job-7-abcde', phase='Running', terminated=None, started_at=None):
    state = {}
    if terminated is not None:
        state['terminated'] = terminated
    elif started_at is not None:
        state['running'] = {'started_at': started_at}
    return {
        'metadata': {'name': name, 'namespace': 'ascender', 'creation_timestamp': datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)},
        'spec': {'containers': [{'name': 'worker'}]},
        'status': {'phase': phase, 'container_statuses': [{'name': 'worker', 'state': state}]},
    }


def make_stream(pod, logs):
    api = FakeKubeApi(pod, logs)
    pm = mock.Mock()
    pm.kube_api = api
    pm.namespace = 'ascender'
    job = mock.Mock(id=7, log_format='job 7')
    stream = PodLogStream(job, pod_name=pod['metadata']['name'] if pod else '', namespace='ascender', pod_manager=pm)
    return stream, api


def stamped(lines, second=0, nanos_start=100):
    """Log lines the way the kubelet serves them with timestamps=True."""
    out = b''
    for i, line in enumerate(lines):
        out += f'2026-11-10T09:00:{second:02d}.{nanos_start + i:09d}Z '.encode() + line
    return out


def test_timestamps_are_stripped_and_blank_lines_skipped():
    lines = [b'{"status": "starting"}\n', b'\n', b'{"event": "runner_on_ok", "counter": 1}\n']
    stream, api = make_stream(running_pod(terminated={'exit_code': 0}), [stamped(lines)])
    stream.open(follow=False)
    assert json.loads(stream.readline()) == {'status': 'starting'}
    assert json.loads(stream.readline()) == {'event': 'runner_on_ok', 'counter': 1}
    assert stream.readline() == b''
    assert api.log_calls[0]['timestamps'] is True
    assert api.log_calls[0]['follow'] is False


def test_read_n_serves_bytes_across_line_boundaries():
    """Base64IO reads the artifacts archive with read(n), straddling the log's lines."""
    lines = [b'{"zipfile": 8}\n', b'ABCDEFGHIJKL{"eof": true}\n']
    stream, api = make_stream(running_pod(terminated={'exit_code': 0}), [stamped(lines)])
    stream.open(follow=False)
    assert json.loads(stream.readline()) == {'zipfile': 8}
    assert stream.read(5) == b'ABCDE'
    assert stream.read(7) == b'FGHIJKL'
    assert json.loads(stream.readline()) == {'eof': True}


def test_dropped_connection_resumes_from_last_timestamp_without_duplicates():
    """A live pod whose stream drops is reopened since the last second seen, and replayed lines are skipped."""
    first = stamped([b'{"counter": 1}\n', b'{"counter": 2}\n'], second=5, nanos_start=100)
    # the API replays everything from second 5 on; the first two were delivered already
    second = stamped([b'{"counter": 1}\n', b'{"counter": 2}\n', b'{"counter": 3}\n'], second=5, nanos_start=100)
    final = b''
    pod = running_pod(started_at=datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc))
    stream, api = make_stream(pod, [first, second, final])
    live = [True, False]
    stream.is_live = lambda: live.pop(0)
    stream.open(follow=True)
    counters = []
    while True:
        line = stream.readline()
        if not line:
            break
        counters.append(json.loads(line)['counter'])
    assert counters == [1, 2, 3]
    assert api.log_calls[1]['since_time'] == '2026-11-10T09:00:05Z'
    assert stream.reconnects == 2


def test_finished_pod_gets_one_final_pass():
    """When the pod turns out finished at EOF, what was written after the last line is read once more, not followed."""
    pod = running_pod(terminated={'exit_code': 0})
    stream, api = make_stream(pod, [stamped([b'{"counter": 1}\n']), stamped([b'{"counter": 1}\n', b'{"eof": true}\n'])])
    stream.open(follow=True)
    assert json.loads(stream.readline())['counter'] == 1
    assert json.loads(stream.readline()) == {'eof': True}
    assert stream.readline() == b''
    assert api.log_calls[1]['follow'] is False
    assert len(api.log_calls) == 2


def test_interrupt_unblocks_and_ends_the_stream():
    stream, api = make_stream(running_pod(), [stamped([b'{"counter": 1}\n'])])
    stream.open(follow=True)
    stream.interrupt()
    assert stream.readline() == b''


def test_find_pod_by_label_when_no_name_recorded():
    pod = running_pod(name='automation-job-7-zzzzz')
    stream, api = make_stream(pod, [])
    stream.pod_name = ''
    assert stream.find_pod()['metadata']['name'] == 'automation-job-7-zzzzz'
    assert stream.pod_name == 'automation-job-7-zzzzz'
    assert stream.namespace == 'ascender'


def test_find_pod_gone():
    stream, api = make_stream(running_pod(), [])
    api.pod = None
    assert stream.find_pod() is None


def test_has_output_is_false_for_an_empty_log():
    stream, api = make_stream(running_pod(), [b''])
    assert stream.has_output() is False
    stream2, api2 = make_stream(running_pod(), [stamped([b'{"status": "starting"}\n'])])
    assert stream2.has_output() is True


def test_exit_code_and_container_state_helpers():
    assert pod_exit_code(running_pod(terminated={'exit_code': 2})) == 2
    assert pod_exit_code(running_pod(terminated={'exit_code': 0})) == 0
    assert pod_exit_code(running_pod(phase='Succeeded')) == 0
    assert pod_exit_code(running_pod(phase='Failed')) == 1
    assert container_terminated(running_pod()) is None
    started = datetime(2026, 11, 10, 9, 1, tzinfo=timezone.utc)
    assert container_started_at(running_pod(started_at=started)) == started


def test_final_status_from_exit_code():
    stream, api = make_stream(running_pod(terminated={'exit_code': 0}), [])
    assert stream.final_status() == ('successful', 0)
    api.pod = running_pod(terminated={'exit_code': 2})
    assert stream.final_status() == ('failed', 2)


def test_release_deletes_the_pod_unless_work_is_kept(settings):
    stream, api = make_stream(running_pod(), [])
    settings.RECEPTOR_RELEASE_WORK = False
    stream.release()
    assert api.deleted == []
    settings.RECEPTOR_RELEASE_WORK = True
    stream.release()
    assert api.deleted == ['automation-job-7-abcde']


@pytest.mark.parametrize('line', [b'2026-11-10T09:00:05.1Z {"a": 1}\n', b'2026-11-10T09:00:05Z {"a": 1}\n', b'2026-11-10T09:00:05.123456789Z {"a": 1}\n'])
def test_timestamp_regex_accepts_trimmed_fractions(line):
    m = streams._TIMESTAMP_RE.match(line)
    assert m is not None
    assert line[m.end() :] == b'{"a": 1}\n'


def test_stream_satisfies_base64io_contract():
    """ansible-runner wraps the stream in Base64IO to decode the artifacts archive; it checks these attributes up front."""
    from ansible_runner.utils.base64io import Base64IO

    stream, api = make_stream(running_pod(terminated={'exit_code': 0}), [stamped([b'QUJD\n'])])
    stream.open(follow=False)
    with Base64IO(stream) as decoder:
        assert decoder.read(3) == b'ABC'


def test_a_connection_is_closed_before_it_is_handed_back():
    """A followed log is still streaming when it is dropped; the pool must not get it back open."""
    stream, api = make_stream(running_pod(), [stamped([b'{"counter": 1}\n'])])
    stream.open(follow=True)
    response = api.responses[0]
    stream.close()
    assert response.calls == ['close', 'release_conn']


def test_an_idle_follow_is_reopened_from_the_last_line(settings):
    """A log connection silent past JOB_MONITOR_STREAM_IDLE_SECONDS times out and is reopened, so a dead one cannot hang the read."""
    settings.JOB_MONITOR_STREAM_IDLE_SECONDS = 120
    timeout = ReadTimeoutError(None, '/log', 'Read timed out.')
    first = [stamped([b'{"counter": 1}\n'], second=7), timeout]
    second = stamped([b'{"counter": 1}\n', b'{"counter": 2}\n'], second=7)
    stream, api = make_stream(running_pod(started_at=datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)), [first, second, b''])
    live = [True, False]
    stream.is_live = lambda: live.pop(0)
    stream.open(follow=True)
    assert json.loads(stream.readline())['counter'] == 1
    assert json.loads(stream.readline())['counter'] == 2
    assert stream.readline() == b''
    assert api.log_calls[0]['_request_timeout'] == (settings.ASCENDER_CONTAINER_GROUP_K8S_API_TIMEOUT, 120)
    assert api.log_calls[1]['follow'] is True and api.log_calls[1]['since_time'] == '2026-11-10T09:00:07Z'


def test_an_api_error_while_checking_the_pod_is_raised_not_taken_for_the_end():
    """The read cannot tell a finished pod from an unreachable API, so it must not end the stream on a guess."""
    stream, api = make_stream(running_pod(), [stamped([b'{"counter": 1}\n'])])

    def unreachable():
        raise ApiException(status=503)

    stream.is_live = unreachable
    stream.open(follow=True)
    assert json.loads(stream.readline())['counter'] == 1
    with pytest.raises(ApiException):
        stream.readline()


def test_the_final_pass_of_a_pod_that_is_gone_ends_the_stream():
    stream, api = make_stream(running_pod(terminated={'exit_code': 0}), [stamped([b'{"counter": 1}\n'])])
    stream.open(follow=False)
    assert json.loads(stream.readline())['counter'] == 1

    def gone(**kwargs):
        raise ApiException(status=404)

    api.read_namespaced_pod_log = lambda name, namespace, **kwargs: gone()
    assert stream.readline() == b''


# -- the receptor work unit stream -------------------------------------------------------------


class FakeReceptorCtl:
    def __init__(self, status=None, error=None):
        self.status = status or {}
        self.error = error
        self.commands = []

    def simple_command(self, command):
        self.commands.append(command)
        if self.error:
            raise self.error
        return self.status


def test_an_unknown_unit_is_told_from_an_unreachable_receptor():
    job = mock.Mock(log_format='job 7')
    assert ReceptorUnitStream(job, FakeReceptorCtl(status={'StateName': 'Running'}), 'u1').is_known() is True
    assert ReceptorUnitStream(job, FakeReceptorCtl(error=RuntimeError('unknown work unit u1')), 'u1').is_known() is False
    with pytest.raises(ValueError):
        ReceptorUnitStream(job, FakeReceptorCtl(error=ValueError('Socket path does not exist')), 'u1').is_known()


def test_a_unit_stream_stalls_only_while_its_reader_waits():
    """A reader busy with events it already has is slow, not stalled; one waiting on the socket past the limit, for a finished unit, is."""
    job = mock.Mock(log_format='job 7')
    ctl = FakeReceptorCtl(status={'StateName': 'Succeeded', 'StdoutSize': 100})
    stream = ReceptorUnitStream(job, ctl, 'u1')
    stream.bytes_read = 40
    assert stream.stalled(0) is False  # not waiting at all
    stream._waiting_since = time.monotonic() - 300
    assert stream.stalled(120) is True
    stream._waiting_since = time.monotonic() - 30
    assert stream.stalled(120) is False  # not waiting long enough
    stream._waiting_since = time.monotonic() - 300
    ctl.status = {'StateName': 'Running', 'StdoutSize': 100}
    assert stream.stalled(120) is False  # the unit may still write
    ctl.status = {'StateName': 'Succeeded', 'StdoutSize': 40}
    assert stream.stalled(120) is False  # everything arrived


def test_a_unit_stream_marks_its_reader_waiting_only_inside_a_read():
    job = mock.Mock(log_format='job 7')
    stream = ReceptorUnitStream(job, FakeReceptorCtl(), 'u1')
    seen = []

    class SockFile:
        def readline(self, *args):
            seen.append(stream._waiting_since)
            return b'{"counter": 1}\n'

    stream.sockfile = SockFile()
    assert stream.readline() == b'{"counter": 1}\n'
    assert seen[0] is not None and stream._waiting_since is None
    assert stream.bytes_read == len(b'{"counter": 1}\n')
