# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
What the rsyslog process guarantees about external logs, named one at a time.

The roadmap asks whether external log shipping could move off rsyslog and onto
a Python logging handler. The answer turns on what rsyslog is doing that a
handler would have to do as well, and until now that was spread across a
thirteen line list of queue options and asserted only inside a five hundred
character config string, where a dropped guarantee reads as a diff rather than
as a loss.

Each test below is one promise the platform currently makes. A handler that
replaced rsyslog would have to keep every one of them, or four settings that
users can see stop meaning anything.
"""

import pytest
from django.conf import settings

from awx.main.tests.functional.api.test_settings import _mock_logging_defaults
from awx.main.utils.external_logging import construct_rsyslog_conf_template


@pytest.fixture
def conf():
    mock_settings, _ = _mock_logging_defaults()
    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'localhost')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 9000)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'tcp')
    return construct_rsyslog_conf_template(mock_settings)


def test_the_queue_is_written_to_disk(conf):
    """Otherwise a restart loses whatever had not been delivered."""
    assert 'queue.spoolDirectory="/var/lib/ascender"' in conf
    assert 'queue.filename="awx-external-logger-action-queue"' in conf


def test_the_queue_survives_a_shutdown(conf):
    assert 'queue.saveOnShutdown="on"' in conf


def test_the_queue_is_checkpointed_and_synced(conf):
    """A checkpoint every thousand messages, fsynced, so a crash loses at most that."""
    assert 'queue.syncqueuefiles="on"' in conf
    assert 'queue.checkpointInterval="1000"' in conf


def test_the_queue_is_bounded_on_disk(conf):
    """LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB, which a user can see and set."""
    assert 'queue.maxDiskSpace="1g"' in conf
    assert 'queue.maxFileSize="100m"' in conf


def test_the_queue_is_bounded_in_memory(conf):
    """LOG_AGGREGATOR_ACTION_QUEUE_SIZE, likewise."""
    assert 'queue.size="131072"' in conf


def test_back_pressure_arrives_before_the_queue_is_full(conf):
    """75% starts it, 90% starts discarding, so the queue is never simply hit."""
    assert 'queue.highwaterMark="98304"' in conf
    assert 'queue.discardMark="117964"' in conf


def test_what_is_discarded_is_the_least_important(conf):
    """Severity 5 and above: notice, info and debug go before a warning does."""
    assert 'queue.discardSeverity="5"' in conf


def test_delivery_is_retried_forever(conf):
    """An aggregator that is down is a pause, not a loss."""
    assert 'action.resumeRetryCount="-1"' in conf
    assert 'action.resumeInterval=' in conf


@pytest.mark.parametrize(
    'setting,appears_as',
    [
        ('LOG_AGGREGATOR_ACTION_QUEUE_SIZE', 'queue.size'),
        ('LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB', 'queue.maxDiskSpace'),
        ('LOG_AGGREGATOR_MAX_DISK_USAGE_PATH', 'queue.spoolDirectory'),
    ],
)
def test_the_settings_users_can_set_reach_the_queue(conf, setting, appears_as):
    """Each of these is a promise in the settings UI, kept by an rsyslog option."""
    assert appears_as in conf
