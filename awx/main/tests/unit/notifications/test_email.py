# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

import warnings

import pytest
from django.core.mail import InvalidMailer
from django.utils.deprecation import RemovedInDjango70Warning

from awx.main.notifications.email_backend import CustomEmailBackend

CONFIG = {
    'host': 'smtp.example.com',
    'port': 2525,
    'username': 'notifier',
    'password': 'secret',
    'use_tls': False,
    'use_ssl': False,
    'timeout': 30,
}


def test_backend_construction_is_not_deprecated():
    """Django 6.1 warns when an SMTP backend is built without an alias, and 7.0
    removes that path. Raising on the warning keeps this from regressing quietly,
    which is how it went unnoticed before: nothing constructed one in a test."""
    with warnings.catch_warnings():
        warnings.simplefilter('error', RemovedInDjango70Warning)
        backend = CustomEmailBackend(**CONFIG)

    assert backend.alias == CustomEmailBackend.MAILER_ALIAS


def test_configuration_comes_from_the_notification_template():
    """A template supplies every one of these from the database, per send."""
    backend = CustomEmailBackend(**CONFIG)

    assert backend.host == 'smtp.example.com'
    assert backend.port == 2525
    assert backend.username == 'notifier'
    assert backend.password == 'secret'
    assert backend.timeout == 30


def test_a_missing_host_is_an_error_rather_than_a_settings_fallback():
    """The clearest evidence of which branch ran. Without an alias Django fills
    a missing host from EMAIL_HOST, which would silently point a notification at
    localhost; with one it refuses. The serializer requires host anyway, since
    init_parameters gives it no default."""
    with pytest.raises(InvalidMailer):
        CustomEmailBackend(**dict(CONFIG, host=None))


def test_tls_and_ssl_together_are_rejected():
    """A misconfiguration on either path, so the move must not have made it
    silently acceptable."""
    with pytest.raises(InvalidMailer):
        CustomEmailBackend(**dict(CONFIG, use_tls=True, use_ssl=True))
