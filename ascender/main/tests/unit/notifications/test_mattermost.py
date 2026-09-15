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
            timeout=settings.ASCENDER_NOTIFICATION_REQUEST_TIMEOUT,
        )
        assert sent_messages == 1
