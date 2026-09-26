# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Matrix notifications, spoken straight to the homeserver's client-server API.

A message is a `PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`
carrying an `m.text` event, and the access token rides in the Authorization
header. No client library is needed: it is one JSON request, plus one GET to
turn a room alias (`#automation:example.org`) into a room ID first.
"""

import logging
import time
import uuid
from urllib.parse import quote

import requests

from django.utils.encoding import smart_str
from django.utils.translation import gettext_lazy as _

from ascender.settings.typed import settings
from ascender.main.notifications.base import AscenderBaseEmailBackend
from ascender.main.notifications.custom_notification_base import CustomNotificationBase
from ascender.main.utils import get_ascender_http_client_headers

logger = logging.getLogger('ascender.main.notifications.matrix_backend')

CLIENT_API = '/_matrix/client/v3'
HTML_FORMAT = 'org.matrix.custom.html'

# A homeserver answers 429 when a sender goes over its rate limit, and says in
# `retry_after_ms` how long to hold off. One notification is a single event, so
# a couple of bounded waits are enough for a burst of jobs finishing together.
MAX_ATTEMPTS = 3
MAX_RETRY_WAIT_SECONDS = 10


class MatrixBackend(AscenderBaseEmailBackend, CustomNotificationBase):
    init_parameters = {
        "homeserver_url": {"label": "Homeserver URL", "type": "string"},
        "access_token": {"label": "Access Token", "type": "password"},
        "rooms": {"label": "Destination Rooms", "type": "list"},
        "use_html": {"label": "Send HTML formatted body", "type": "bool", "default": True},
        "disable_ssl_verification": {"label": "Disable SSL Verification", "type": "bool", "default": False},
    }
    recipient_parameter = "rooms"
    sender_parameter = None

    # The message is the plain-text `body` every Matrix client can show. The
    # body template is the HTML rendering of the same thing, sent alongside as
    # `formatted_body` so the job link is clickable. Names come from users, so
    # they are escaped where they land inside markup.
    DEFAULT_HTML_BODY = "<strong>{{ job_friendly_name }} #{{ job.id }}</strong> '{{ job.name | e }}' {{ job.status }}: <a href=\"{{ url }}\">{{ url }}</a>"
    DEFAULT_CHANGED_HTML_BODY = (
        "<strong>{{ job_friendly_name }} #{{ job.id }}</strong> '{{ job.name | e }}' reported changes: <a href=\"{{ url }}\">{{ url }}</a>"
    )
    DEFAULT_APPROVAL_RUNNING_HTML_BODY = (
        'The approval node "<strong>{{ approval_node_name | e }}</strong>" needs review. '
        'This node can be viewed at: <a href="{{ workflow_url }}">{{ workflow_url }}</a>'
        '{% if context_message %}<br><br>Context:<br>{{ context_message | e }}{% endif %}'
    )
    DEFAULT_APPROVAL_APPROVED_HTML_BODY = (
        'The approval node "<strong>{{ approval_node_name | e }}</strong>" was approved. <a href="{{ workflow_url }}">{{ workflow_url }}</a>'
    )
    DEFAULT_APPROVAL_TIMEOUT_HTML_BODY = (
        'The approval node "<strong>{{ approval_node_name | e }}</strong>" has timed out. <a href="{{ workflow_url }}">{{ workflow_url }}</a>'
    )
    DEFAULT_APPROVAL_DENIED_HTML_BODY = (
        'The approval node "<strong>{{ approval_node_name | e }}</strong>" was denied. <a href="{{ workflow_url }}">{{ workflow_url }}</a>'
    )

    default_messages = {
        "started": {"message": CustomNotificationBase.DEFAULT_MSG, "body": DEFAULT_HTML_BODY},
        "success": {"message": CustomNotificationBase.DEFAULT_MSG, "body": DEFAULT_HTML_BODY},
        "error": {"message": CustomNotificationBase.DEFAULT_MSG, "body": DEFAULT_HTML_BODY},
        "changed": {"message": CustomNotificationBase.DEFAULT_CHANGED_MSG, "body": DEFAULT_CHANGED_HTML_BODY},
        "workflow_approval": {
            "running": {"message": CustomNotificationBase.DEFAULT_APPROVAL_RUNNING_MSG, "body": DEFAULT_APPROVAL_RUNNING_HTML_BODY},
            "approved": {"message": CustomNotificationBase.DEFAULT_APPROVAL_APPROVED_MSG, "body": DEFAULT_APPROVAL_APPROVED_HTML_BODY},
            "timed_out": {"message": CustomNotificationBase.DEFAULT_APPROVAL_TIMEOUT_MSG, "body": DEFAULT_APPROVAL_TIMEOUT_HTML_BODY},
            "denied": {"message": CustomNotificationBase.DEFAULT_APPROVAL_DENIED_MSG, "body": DEFAULT_APPROVAL_DENIED_HTML_BODY},
        },
    }

    def __init__(self, homeserver_url, access_token, use_html=True, disable_ssl_verification=False, fail_silently=False, **kwargs):
        # Django 6.1 deprecated BaseEmailBackend.fail_silently: a subclass that
        # supports it owns the attribute instead of passing it up.
        super(MatrixBackend, self).__init__()
        self.fail_silently = fail_silently
        self.homeserver_url = homeserver_url.strip().rstrip('/')
        self.access_token = access_token
        self.use_html = use_html
        self.disable_ssl_verification = disable_ssl_verification

    def format_body(self, body):
        return body

    def _request(self, method, path, **kwargs):
        """One call to the client-server API, retried while the homeserver rate limits it."""
        headers = {**get_ascender_http_client_headers(), 'Authorization': 'Bearer {}'.format(self.access_token)}
        url = self.homeserver_url + CLIENT_API + path
        for attempt in range(1, MAX_ATTEMPTS + 1):
            resp = requests.request(
                method,
                url,
                headers=headers,
                verify=(not self.disable_ssl_verification),
                timeout=settings.ASCENDER_NOTIFICATION_REQUEST_TIMEOUT,
                **kwargs,
            )
            if resp.status_code != 429 or attempt == MAX_ATTEMPTS:
                return resp
            wait = min(self._error_details(resp).get('retry_after_ms', 1000) / 1000.0, MAX_RETRY_WAIT_SECONDS)
            logger.warning("Matrix homeserver rate limited the notification, retrying in %.1fs (attempt %d of %d)", wait, attempt, MAX_ATTEMPTS)
            time.sleep(wait)
        return resp

    @staticmethod
    def _error_details(resp):
        """The standard `{"errcode": ..., "error": ...}` a homeserver puts in an error response, or nothing."""
        try:
            details = resp.json()
        except ValueError:
            return {}
        return details if isinstance(details, dict) else {}

    @staticmethod
    def _accepted(resp):
        """Whether the homeserver accepted the request: only a 2xx answer is, a 1xx or 3xx is not."""
        return 200 <= resp.status_code < 300

    def _describe_failure(self, what, resp):
        details = self._error_details(resp)
        reason = ' '.join(str(details[key]) for key in ('errcode', 'error') if details.get(key))
        message = _("Error {} via Matrix: {}").format(what, resp.status_code)
        if reason:
            message = '{} ({})'.format(message, reason)
        return smart_str(message)

    def _resolve_room(self, room):
        """The room ID an alias points to. Room IDs (`!…`) are used as they are."""
        room = room.strip()
        if not room.startswith('#'):
            return room
        resp = self._request('GET', '/directory/room/{}'.format(quote(room, safe='')))
        if not self._accepted(resp):
            raise Exception(self._describe_failure(_("resolving room alias {}").format(room), resp))
        room_id = self._error_details(resp).get('room_id')
        if not room_id:
            raise Exception(smart_str(_("Error resolving room alias {} via Matrix: no room_id in the response").format(room)))
        return room_id

    def send_messages(self, messages):
        sent_messages = 0
        resolved = {}
        for m in messages:
            content = {'msgtype': 'm.text', 'body': m.subject}
            if self.use_html and m.body:
                content['format'] = HTML_FORMAT
                content['formatted_body'] = m.body
            for room in m.recipients():
                try:
                    if room not in resolved:
                        resolved[room] = self._resolve_room(room)
                    path = '/rooms/{}/send/m.room.message/{}'.format(quote(resolved[room], safe=''), uuid.uuid4().hex)
                    resp = self._request('PUT', path, json=content)
                    if not self._accepted(resp):
                        raise Exception(self._describe_failure(_("sending notification to room {}").format(room), resp))
                    sent_messages += 1
                except Exception as e:
                    logger.error(smart_str(_("Exception sending messages: {}").format(e)))
                    if not self.fail_silently:
                        raise
        return sent_messages
