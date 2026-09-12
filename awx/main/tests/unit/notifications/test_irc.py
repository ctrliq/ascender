from unittest import mock

from django.core.mail.message import EmailMessage

import awx.main.notifications.irc_backend as irc_backend


class FakeSocket:
    """A socket that hands back a scripted conversation and records what was sent."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.sent = []
        self.closed = False

    def sendall(self, payload):
        self.sent.append(payload.decode())

    def recv(self, _size):
        return self.replies.pop(0) if self.replies else b''

    def settimeout(self, _timeout):
        pass

    def close(self):
        self.closed = True

    def lines_starting(self, prefix):
        return [line for line in self.sent if line.startswith(prefix)]


def backend_with(sock, **kwargs):
    params = dict(server='irc.example.com', port=6667, nickname='ascender', password='', use_ssl=False)
    params.update(kwargs)
    with mock.patch('awx.main.notifications.irc_backend.socket.create_connection', return_value=sock):
        return irc_backend.IrcBackend(**params)


def test_send_messages_joins_channels_and_messages_nicks():
    sock = FakeSocket(b':irc 001 ascender :Welcome\r\n', b':ascender!u@h JOIN #ops\r\n')
    backend = backend_with(sock)
    message = EmailMessage('a job finished', 'body', 'ascender', ['#ops', 'operator'])

    with mock.patch('awx.main.notifications.irc_backend.socket.create_connection', return_value=sock):
        sent = backend.send_messages([message])

    assert sent == 2
    assert sock.lines_starting('JOIN #ops\r\n')
    assert 'PRIVMSG #ops :a job finished\r\n' in sock.sent
    assert 'PRIVMSG operator :a job finished\r\n' in sock.sent
    assert sock.closed


def test_registration_answers_ping():
    sock = FakeSocket(b'PING :12345\r\n', b':irc 001 ascender :Welcome\r\n')
    backend = backend_with(sock, password='hunter2')

    with mock.patch('awx.main.notifications.irc_backend.socket.create_connection', return_value=sock):
        backend.open()

    assert 'PONG :12345\r\n' in sock.sent
    assert 'PASS hunter2\r\n' in sock.sent
    assert 'NICK ascender\r\n' in sock.sent


def test_connection_failure_is_raised():
    backend = backend_with(FakeSocket())

    with mock.patch('awx.main.notifications.irc_backend.socket.create_connection', side_effect=OSError('refused')):
        try:
            backend.open()
        except OSError as e:
            assert 'refused' in str(e)
        else:
            raise AssertionError('the connection error should have been raised')


def test_connection_failure_fail_silently():
    backend = backend_with(FakeSocket(), fail_silently=True)
    message = EmailMessage('a job finished', 'body', 'ascender', ['#ops'])

    with mock.patch('awx.main.notifications.irc_backend.socket.create_connection', side_effect=OSError('refused')):
        assert backend.send_messages([message]) == 0
