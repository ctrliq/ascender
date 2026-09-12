# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

import logging

import requests

from django.conf import settings
from django.utils.encoding import smart_str
from django.utils.translation import gettext_lazy as _

from awx.main.notifications.base import AWXBaseEmailBackend
from awx.main.utils import get_awx_http_client_headers
from awx.main.notifications.custom_notification_base import CustomNotificationBase

logger = logging.getLogger('awx.main.notifications.twilio_backend')

# The Messages endpoint the SDK posts to, with the account SID interpolated.
MESSAGES_URL = 'https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json'


class TwilioBackend(AWXBaseEmailBackend, CustomNotificationBase):
    init_parameters = {
        "account_sid": {"label": "Account SID", "type": "string"},
        "account_token": {"label": "Account Token", "type": "password"},
        "from_number": {"label": "Source Phone Number", "type": "string"},
        "to_numbers": {"label": "Destination SMS Numbers", "type": "list"},
    }
    recipient_parameter = "to_numbers"
    sender_parameter = "from_number"

    def __init__(self, account_sid, account_token, fail_silently=False, **kwargs):
        # Django 6.1 deprecated BaseEmailBackend.fail_silently: a subclass that
        # supports it owns the attribute instead of passing it up.
        super(TwilioBackend, self).__init__()
        self.fail_silently = fail_silently
        self.account_sid = account_sid
        self.account_token = account_token

    def send_messages(self, messages):
        sent_messages = 0
        url = MESSAGES_URL.format(self.account_sid)

        for m in messages:
            failure = None
            for dest in m.to:
                try:
                    logger.debug(smart_str(_("FROM: {} / TO: {}").format(m.from_email, dest)))
                    r = requests.post(
                        url,
                        auth=(self.account_sid, self.account_token),
                        data={"To": dest, "From": m.from_email, "Body": m.subject},
                        headers=get_awx_http_client_headers(),
                        timeout=settings.AWX_NOTIFICATION_REQUEST_TIMEOUT,
                    )
                    r.raise_for_status()
                    sent_messages += 1
                except Exception as e:
                    logger.error(smart_str(_("Exception sending messages: {}").format(e)))
                    if failure is None:
                        failure = e
            # a bare raise here would be outside the handler that caught this,
            # so the exception has to be kept to report what actually failed
            if not self.fail_silently and failure is not None:
                raise failure
        return sent_messages
