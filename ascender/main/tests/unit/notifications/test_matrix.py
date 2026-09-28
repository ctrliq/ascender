from unittest import mock

import pytest
from django.conf import settings
from django.core.mail.message import EmailMessage

import ascender.main.notifications.matrix_backend as matrix_backend

HEADERS = {'Content-Type': 'application/json', 'User-Agent': 'Ascender 0.0.1.dev (open)'}
AUTHED_HEADERS = {**HEADERS, 'Authorization': 'Bearer secret-token'}


def response(status_code, payload=None):
    resp = mock.Mock(status_code=status_code)
    if payload is None:
        resp.json.side_effect = ValueError('no body')
    else:
        resp.json.return_value = payload
    return resp


def message(*rooms, body='<b>test body</b>'):
    return EmailMessage('test subject', body, [], list(rooms))


@pytest.fixture
def requests_mock():
    with (
        mock.patch('ascender.main.notifications.matrix_backend.requests') as requests_mock,
        mock.patch('ascender.main.notifications.matrix_backend.get_ascender_http_client_headers', return_value=HEADERS),
        mock.patch('ascender.main.notifications.matrix_backend.uuid.uuid4') as uuid4,
    ):
        uuid4.return_value.hex = 'txn1'
        yield requests_mock


def test_send_messages_to_room_id(requests_mock):
    requests_mock.request.return_value = response(200, {'event_id': '$abc'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org/', 'secret-token')

    sent_messages = backend.send_messages([message('!room:example.org')])

    requests_mock.request.assert_called_once_with(
        'PUT',
        'https://matrix.example.org/_matrix/client/v3/rooms/%21room%3Aexample.org/send/m.room.message/txn1',
        headers=AUTHED_HEADERS,
        verify=True,
        timeout=settings.ASCENDER_NOTIFICATION_REQUEST_TIMEOUT,
        json={'msgtype': 'm.text', 'body': 'test subject', 'format': 'org.matrix.custom.html', 'formatted_body': '<b>test body</b>'},
    )
    assert sent_messages == 1


def test_send_messages_plain_text_only(requests_mock):
    requests_mock.request.return_value = response(200, {'event_id': '$abc'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token', use_html=False, disable_ssl_verification=True)

    sent_messages = backend.send_messages([message('!room:example.org')])

    _, kwargs = requests_mock.request.call_args
    assert kwargs['json'] == {'msgtype': 'm.text', 'body': 'test subject'}
    assert kwargs['verify'] is False
    assert sent_messages == 1


def test_send_messages_resolves_alias_once(requests_mock):
    requests_mock.request.side_effect = [
        response(200, {'room_id': '!resolved:example.org', 'servers': ['example.org']}),
        response(200, {'event_id': '$1'}),
        response(200, {'event_id': '$2'}),
    ]
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    sent_messages = backend.send_messages([message('#automation:example.org'), message('#automation:example.org')])

    calls = requests_mock.request.call_args_list
    assert [(c.args[0], c.args[1]) for c in calls] == [
        ('GET', 'https://matrix.example.org/_matrix/client/v3/directory/room/%23automation%3Aexample.org'),
        ('PUT', 'https://matrix.example.org/_matrix/client/v3/rooms/%21resolved%3Aexample.org/send/m.room.message/txn1'),
        ('PUT', 'https://matrix.example.org/_matrix/client/v3/rooms/%21resolved%3Aexample.org/send/m.room.message/txn1'),
    ]
    assert sent_messages == 2


def test_send_messages_to_several_rooms(requests_mock):
    requests_mock.request.return_value = response(200, {'event_id': '$abc'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    sent_messages = backend.send_messages([message('!one:example.org', '!two:example.org')])

    assert requests_mock.request.call_count == 2
    assert sent_messages == 2


def test_send_messages_reports_homeserver_error(requests_mock):
    requests_mock.request.return_value = response(403, {'errcode': 'M_FORBIDDEN', 'error': 'You are not in this room'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with pytest.raises(Exception) as excinfo:
        backend.send_messages([message('!room:example.org')])

    assert 'Error sending notification to room !room:example.org via Matrix: 403 (M_FORBIDDEN You are not in this room)' in str(excinfo.value)


def test_send_messages_fail_silently_counts_only_successes(requests_mock):
    requests_mock.request.side_effect = [response(404), response(200, {'event_id': '$abc'})]
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token', fail_silently=True)

    with mock.patch('ascender.main.notifications.matrix_backend.logger') as logger_mock:
        sent_messages = backend.send_messages([message('!missing:example.org', '!room:example.org')])

    logger_mock.error.assert_called_once()
    assert 'via Matrix: 404' in logger_mock.error.call_args[0][0]
    assert sent_messages == 1


@pytest.mark.parametrize('status_code', [102, 304])
def test_send_messages_non_2xx_is_not_a_send(requests_mock, status_code):
    # requests follows redirects itself, so a 3xx (or 1xx) that reaches the backend is a
    # proxy or homeserver quirk with no accepted event behind it, not a delivered message.
    requests_mock.request.return_value = response(status_code)
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with pytest.raises(Exception) as excinfo:
        backend.send_messages([message('!room:example.org')])

    assert 'Error sending notification to room !room:example.org via Matrix: {}'.format(status_code) in str(excinfo.value)


def test_send_messages_non_2xx_alias_lookup_fails(requests_mock):
    requests_mock.request.return_value = response(302, {'room_id': '!resolved:example.org'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with pytest.raises(Exception) as excinfo:
        backend.send_messages([message('#alias:example.org')])

    assert 'Error resolving room alias #alias:example.org via Matrix: 302' in str(excinfo.value)
    assert requests_mock.request.call_count == 1


def test_send_messages_fail_silently_does_not_count_non_2xx(requests_mock):
    requests_mock.request.side_effect = [response(304), response(200, {'event_id': '$abc'})]
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token', fail_silently=True)

    with mock.patch('ascender.main.notifications.matrix_backend.logger') as logger_mock:
        sent_messages = backend.send_messages([message('!cached:example.org', '!room:example.org')])

    logger_mock.error.assert_called_once()
    assert 'via Matrix: 304' in logger_mock.error.call_args[0][0]
    assert sent_messages == 1


def test_send_messages_alias_without_room_id(requests_mock):
    requests_mock.request.return_value = response(404, {'errcode': 'M_NOT_FOUND', 'error': 'Room alias not found'})
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with pytest.raises(Exception) as excinfo:
        backend.send_messages([message('#nowhere:example.org')])

    assert 'resolving room alias #nowhere:example.org' in str(excinfo.value)
    assert 'M_NOT_FOUND' in str(excinfo.value)
    assert requests_mock.request.call_count == 1


def test_send_messages_retries_when_rate_limited(requests_mock):
    requests_mock.request.side_effect = [
        response(429, {'errcode': 'M_LIMIT_EXCEEDED', 'error': 'Too Many Requests', 'retry_after_ms': 250}),
        response(200, {'event_id': '$abc'}),
    ]
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with mock.patch('ascender.main.notifications.matrix_backend.time.sleep') as sleep:
        sent_messages = backend.send_messages([message('!room:example.org')])

    sleep.assert_called_once_with(0.25)
    assert requests_mock.request.call_count == 2
    assert sent_messages == 1


def test_send_messages_gives_up_after_max_rate_limit_attempts(requests_mock):
    limited = response(429, {'errcode': 'M_LIMIT_EXCEEDED', 'error': 'Too Many Requests', 'retry_after_ms': 60000})
    requests_mock.request.return_value = limited
    backend = matrix_backend.MatrixBackend('https://matrix.example.org', 'secret-token')

    with mock.patch('ascender.main.notifications.matrix_backend.time.sleep') as sleep, pytest.raises(Exception) as excinfo:
        backend.send_messages([message('!room:example.org')])

    # The wait is capped, and the last attempt is not followed by a sleep.
    assert sleep.call_args_list == [mock.call(matrix_backend.MAX_RETRY_WAIT_SECONDS)] * (matrix_backend.MAX_ATTEMPTS - 1)
    assert requests_mock.request.call_count == matrix_backend.MAX_ATTEMPTS
    assert 'M_LIMIT_EXCEEDED' in str(excinfo.value)


def test_default_html_bodies_render_and_escape():
    from jinja2 import sandbox

    from ascender.main.models import JobNotificationMixin

    env = sandbox.ImmutableSandboxedEnvironment()
    context = JobNotificationMixin.context_stub()
    context['job']['name'] = 'Deploy <prod> & "stage"'
    rendered = env.from_string(matrix_backend.MatrixBackend.default_messages['success']['body']).render(**context)
    assert 'Deploy &lt;prod&gt; &amp; &#34;stage&#34;' in rendered
    assert '<a href="https://towerhost/#/jobs/playbook/1010">' in rendered

    approval = matrix_backend.MatrixBackend.default_messages['workflow_approval']
    for template in approval.values():
        rendered = env.from_string(template['body']).render(**context, context_message='Why <now>')
        assert '<a href="https://towerhost/#/jobs/workflow/1010">' in rendered
    running = env.from_string(approval['running']['body']).render(**context, context_message='Why <now>')
    assert 'Context:<br>Why &lt;now&gt;' in running
