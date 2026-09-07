# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

from django.core.mail.backends.smtp import EmailBackend

from awx.main.notifications.custom_notification_base import CustomNotificationBase

DEFAULT_MSG = CustomNotificationBase.DEFAULT_MSG
DEFAULT_BODY = CustomNotificationBase.DEFAULT_BODY

DEFAULT_CHANGED_MSG = CustomNotificationBase.DEFAULT_CHANGED_MSG
DEFAULT_CHANGED_BODY = CustomNotificationBase.DEFAULT_CHANGED_BODY

DEFAULT_APPROVAL_RUNNING_MSG = CustomNotificationBase.DEFAULT_APPROVAL_RUNNING_MSG
DEFAULT_APPROVAL_RUNNING_BODY = CustomNotificationBase.DEFAULT_APPROVAL_RUNNING_BODY

DEFAULT_APPROVAL_APPROVED_MSG = CustomNotificationBase.DEFAULT_APPROVAL_APPROVED_MSG
DEFAULT_APPROVAL_APPROVED_BODY = CustomNotificationBase.DEFAULT_APPROVAL_APPROVED_BODY

DEFAULT_APPROVAL_TIMEOUT_MSG = CustomNotificationBase.DEFAULT_APPROVAL_TIMEOUT_MSG
DEFAULT_APPROVAL_TIMEOUT_BODY = CustomNotificationBase.DEFAULT_APPROVAL_TIMEOUT_BODY

DEFAULT_APPROVAL_DENIED_MSG = CustomNotificationBase.DEFAULT_APPROVAL_DENIED_MSG
DEFAULT_APPROVAL_DENIED_BODY = CustomNotificationBase.DEFAULT_APPROVAL_DENIED_BODY


class CustomEmailBackend(EmailBackend, CustomNotificationBase):
    # Django's SMTP backend has two constructors behind one signature. Without
    # an alias it takes the deprecated path, filling anything not passed from
    # the EMAIL_* settings and raising RemovedInDjango70Warning; 7.0 deletes
    # that path. With an alias it takes the values it is given and nothing else.
    #
    # The second is what a notification template has always wanted. The
    # serializer requires every init_parameter that has no default, so host,
    # port, username, password, use_tls and use_ssl are always present and the
    # EMAIL_* fallback was never reached. Passing an alias moves us onto the
    # supported branch and keeps the behaviour we already had.
    #
    # The alias is only a label here. Django uses it to name the mailer in
    # error messages and never resolves it against MAILERS for a backend built
    # directly, which is what NotificationTemplate.send does with configuration
    # decrypted per send.
    MAILER_ALIAS = 'ascender-notification'

    def __init__(self, **kwargs):
        super().__init__(alias=self.MAILER_ALIAS, **kwargs)

    init_parameters = {
        "host": {"label": "Host", "type": "string"},
        "port": {"label": "Port", "type": "int"},
        "username": {"label": "Username", "type": "string"},
        "password": {"label": "Password", "type": "password"},
        "use_tls": {"label": "Use TLS", "type": "bool"},
        "use_ssl": {"label": "Use SSL", "type": "bool"},
        "sender": {"label": "Sender Email", "type": "string"},
        "recipients": {"label": "Recipient List", "type": "list"},
        "timeout": {"label": "Timeout", "type": "int", "default": 30},
    }
    recipient_parameter = "recipients"
    sender_parameter = "sender"

    default_messages = {
        "started": {"message": DEFAULT_MSG, "body": DEFAULT_BODY},
        "success": {"message": DEFAULT_MSG, "body": DEFAULT_BODY},
        "error": {"message": DEFAULT_MSG, "body": DEFAULT_BODY},
        "changed": {"message": DEFAULT_CHANGED_MSG, "body": DEFAULT_CHANGED_BODY},
        "workflow_approval": {
            "running": {"message": DEFAULT_APPROVAL_RUNNING_MSG, "body": DEFAULT_APPROVAL_RUNNING_BODY},
            "approved": {"message": DEFAULT_APPROVAL_APPROVED_MSG, "body": DEFAULT_APPROVAL_APPROVED_BODY},
            "timed_out": {"message": DEFAULT_APPROVAL_TIMEOUT_MSG, "body": DEFAULT_APPROVAL_TIMEOUT_BODY},
            "denied": {"message": DEFAULT_APPROVAL_DENIED_MSG, "body": DEFAULT_APPROVAL_DENIED_BODY},
        },
    }

    def format_body(self, body):
        # leave body unchanged (expect a string)
        return body
