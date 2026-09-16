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

from ascender.main.constants import LEGACY_SERVICE_LOGGER_PREFIX, SERVICE_LOGGER_PREFIX
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
        'ascender.conf.settings',
        'ascender.api.permissions',
    ],
)
@pytest.mark.parametrize('stored_selector', ['ascender', 'awx'])
def test_a_service_record_is_forwarded_under_either_selector(record_name, stored_selector):
    """The whole point: an install that still says awx keeps forwarding."""
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=[stored_selector])

    assert enabled.filter(record=_record(record_name)) is True


def test_a_logger_nobody_selected_is_not_forwarded():
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['ascender'])

    assert enabled.filter(record=_record('django.request')) is False


def test_the_legacy_selector_does_not_forward_everything():
    """Accepting awx must not turn into accepting anything at all."""
    enabled = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['awx'])

    assert enabled.filter(record=_record('django.request')) is False


def _record(name):
    class Record:
        pass

    record = Record()
    record.name = name
    return record
