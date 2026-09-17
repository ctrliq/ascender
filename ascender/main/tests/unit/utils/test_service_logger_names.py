# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""The names on the service loggers, and the selector that outlives them.

The platform's own diagnostics are logged under `ascender.*`, one name per
subsystem. The names themselves are only half the contract. The other half is
LOG_AGGREGATOR_LOGGERS, a database setting holding the first segment of the
names a deployment forwards to its aggregator, which means an install made
before the rename still has `awx` stored in it.

If that stored value stopped matching, a deployment would keep logging and
quietly stop forwarding, which is the failure this file exists to prevent.
"""

import pytest

from ascender.conf.views import connection_test_logger_name
from ascender.main.constants import ANALYTICS_LOGGER_PREFIX, LEGACY_SERVICE_LOGGER_PREFIX, SERVICE_LOGGER_PREFIX
from ascender.main.utils.filters import ExternalLoggerEnabled


def test_the_prefixes_are_what_the_rest_of_the_code_assumes():
    assert SERVICE_LOGGER_PREFIX == 'ascender'
    assert LEGACY_SERVICE_LOGGER_PREFIX == 'awx'


@pytest.mark.parametrize(
    'record_name',
    [
        'ascender',
        'ascender.main',
        'ascender.main.dispatch',
        'ascender.main.scheduler',
        'ascender.api.permissions',
    ],
)
@pytest.mark.parametrize('stored_selector', ['ascender', 'awx'])
def test_a_service_record_is_forwarded_under_either_selector(record_name, stored_selector):
    """The whole point: an install that still says awx keeps forwarding."""
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=[stored_selector])

    assert enabled.filter(record=_record(record_name)) is True


def test_a_blocklisted_logger_is_never_forwarded():
    """ascender.conf is on LOGGER_BLOCKLIST: reading a setting to decide whether
    to forward a log line about reading a setting does not end well."""
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['ascender', 'awx'])

    assert enabled.filter(record=_record('ascender.conf.settings')) is False


def test_a_logger_nobody_selected_is_not_forwarded():
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['ascender'])

    assert enabled.filter(record=_record('django.request')) is False


def test_the_legacy_selector_does_not_forward_everything():
    """Accepting awx must not turn into accepting anything at all."""
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['awx'])

    assert enabled.filter(record=_record('django.request')) is False


@pytest.mark.parametrize('stored_selector', ['ascender', 'awx'])
def test_the_connection_test_message_goes_through_the_service_logger_under_either_selector(stored_selector):
    """The settings page's connectivity test sends a record through the first
    selected logger. A record named plain awx would reach no handler now that the
    service loggers are configured under ascender, so both selectors map there.
    """
    assert connection_test_logger_name([stored_selector, 'activity_stream']) == SERVICE_LOGGER_PREFIX


def test_the_connection_test_message_defaults_to_the_service_logger():
    assert connection_test_logger_name([]) == SERVICE_LOGGER_PREFIX


def test_the_connection_test_message_follows_an_analytics_selector():
    assert connection_test_logger_name(['job_events', 'ascender']) == f'{ANALYTICS_LOGGER_PREFIX}.job_events'


def _record(name):
    class Record:
        pass

    record = Record()
    record.name = name
    return record
