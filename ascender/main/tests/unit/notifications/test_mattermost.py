from unittest import mock

from django.conf import settings
from django.core.mail.message import EmailMessage

import ascender.main.notifications.mattermost_backend as mattermost_backend


def test_send_messages():
    with mock.patch('ascender.main.notifications.mattermost_backend.requests') as requests_mock:
        requests_mock.post.return_value.status_code = 200
        backend = mattermost_backend.MattermostBackend()
        message = EmailMessage(
            'test subject',
            'test body',
            [],
            [
                'http://example.com',
            ],
        )

        sent_messages = backend.send_messages(
            [
                message,
            ]
        )

        requests_mock.post.assert_called_once_with(
            'http://example.com',
            json={'text': 'test subject'},
            verify=True,
            allow_redirects=False,
            timeout=settings.ASCENDER_NOTIFICATION_REQUEST_TIMEOUT,
        )
        assert sent_messages == 1


def test_send_messages_redirect_not_counted_as_sent():
    with (
        mock.patch('ascender.main.notifications.mattermost_backend.requests') as requests_mock,
        mock.patch('ascender.main.notifications.mattermost_backend.logger') as logger_mock,
    ):
        requests_mock.post.return_value.status_code = 302
        backend = mattermost_backend.MattermostBackend(fail_silently=True)
        message = EmailMessage('test subject', 'test body', [], ['http://example.com'])
        sent_messages = backend.send_messages([message])
        logger_mock.error.assert_called_once()
        assert '302' in logger_mock.error.call_args[0][0]
        assert sent_messages == 0
