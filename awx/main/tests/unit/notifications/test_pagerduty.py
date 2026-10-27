from unittest import mock

import pytest

from django.core.mail.message import EmailMessage

import awx.main.notifications.pagerduty_backend as pagerduty_backend


class PagerDutyError(Exception):
    pass


def test_send_messages_triggers_one_incident_per_message():
    with mock.patch('awx.main.notifications.pagerduty_backend.requests.post') as post_mock:
        backend = pagerduty_backend.PagerDutyBackend('subdomain', 'token')
        message = EmailMessage('a job failed', 'the details', 'ascender', ['service-key'])

        sent_messages = backend.send_messages([message])

        assert sent_messages == 1
        payload = post_mock.call_args.kwargs['json']
        assert payload == {
            "service_key": "service-key",
            "event_type": "trigger",
            "description": "a job failed",
            "details": "the details",
            "client": "ascender",
        }
        assert post_mock.call_args.args[0] == pagerduty_backend.EVENTS_URL
        assert post_mock.call_args.kwargs['timeout']


def test_send_messages_reports_the_error():
    with mock.patch('awx.main.notifications.pagerduty_backend.requests.post') as post_mock:
        post_mock.side_effect = PagerDutyError('invalid service key')
        backend = pagerduty_backend.PagerDutyBackend('subdomain', 'token')
        message = EmailMessage('a job failed', 'the details', 'ascender', ['service-key'])

        with pytest.raises(PagerDutyError) as exc:
            backend.send_messages([message])

        assert 'invalid service key' in str(exc.value)


def test_send_messages_fail_silently():
    with mock.patch('awx.main.notifications.pagerduty_backend.requests.post') as post_mock:
        post_mock.side_effect = PagerDutyError('invalid service key')
        backend = pagerduty_backend.PagerDutyBackend('subdomain', 'token', fail_silently=True)
        message = EmailMessage('a job failed', 'the details', 'ascender', ['service-key'])

        assert backend.send_messages([message]) == 0
