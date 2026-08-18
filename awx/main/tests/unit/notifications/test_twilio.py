from unittest import mock

import pytest

from django.core.mail.message import EmailMessage

import awx.main.notifications.twilio_backend as twilio_backend


class TwilioError(Exception):
    pass


def test_send_messages():
    with mock.patch('awx.main.notifications.twilio_backend.Client') as client_mock:
        backend = twilio_backend.TwilioBackend('account-sid', 'account-token')
        message = EmailMessage('test subject', 'test body', '+15005550006', ['+15005550001', '+15005550002'])

        sent_messages = backend.send_messages([message])

        assert sent_messages == 2
        assert client_mock.return_value.messages.create.call_count == 2


def test_send_messages_reports_the_twilio_error():
    """A failed send has to surface what Twilio said.

    The handler that caught it has already exited by the time the backend
    reports the failure, so a bare raise would report a RuntimeError about
    there being no active exception instead.
    """
    with mock.patch('awx.main.notifications.twilio_backend.Client') as client_mock:
        client_mock.return_value.messages.create.side_effect = TwilioError('is not a valid phone number')
        backend = twilio_backend.TwilioBackend('account-sid', 'account-token')
        message = EmailMessage('test subject', 'test body', '+15005550006', ['+15005550009'])

        with pytest.raises(TwilioError) as exc:
            backend.send_messages([message])

        assert 'is not a valid phone number' in str(exc.value)


def test_send_messages_fail_silently():
    with mock.patch('awx.main.notifications.twilio_backend.Client') as client_mock:
        client_mock.return_value.messages.create.side_effect = TwilioError('is not a valid phone number')
        backend = twilio_backend.TwilioBackend('account-sid', 'account-token', fail_silently=True)
        message = EmailMessage('test subject', 'test body', '+15005550006', ['+15005550009'])

        assert backend.send_messages([message]) == 0
