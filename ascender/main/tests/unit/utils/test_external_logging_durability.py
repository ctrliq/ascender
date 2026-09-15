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

from ascender.main.tests.functional.api.test_settings import _mock_logging_defaults
from ascender.main.utils.external_logging import DEFAULT_SPOOL_DIRECTORY, construct_rsyslog_conf_template


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
    assert f'queue.spoolDirectory="{DEFAULT_SPOOL_DIRECTORY}"' in conf
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


def _conf_with_spool(path):
    mock_settings, _ = _mock_logging_defaults()
    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'localhost')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 9000)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'tcp')
    setattr(mock_settings, 'LOG_AGGREGATOR_MAX_DISK_USAGE_PATH', path)
    return construct_rsyslog_conf_template(mock_settings)


def test_a_writable_spool_directory_is_used(tmp_path):
    """The setting is honoured when rsyslog can actually write there."""
    conf = _conf_with_spool(str(tmp_path))

    assert f'queue.spoolDirectory="{tmp_path}"' in conf


def test_an_unwritable_spool_directory_falls_back(tmp_path):
    """LOG_AGGREGATOR_MAX_DISK_USAGE_PATH is an API setting, so anyone can point it
    at a directory rsyslog cannot write. The config used to name that directory
    anyway, leaving rsyslog with nowhere to spool and the disk queue quietly not
    surviving a restart, which is the one thing these options exist for.
    """
    missing = tmp_path / 'not-created'
    conf = _conf_with_spool(str(missing))

    assert f'queue.spoolDirectory="{missing}"' not in conf
    assert f'queue.spoolDirectory="{DEFAULT_SPOOL_DIRECTORY}"' in conf


def test_the_fallback_says_so(tmp_path, caplog):
    """Silently writing somewhere other than the configured path is how this went
    unnoticed. An administrator who set the path gets told it was not used.
    """
    missing = tmp_path / 'not-created'

    with caplog.at_level('WARNING'):
        _conf_with_spool(str(missing))

    assert str(missing) in caplog.text


def test_a_spool_path_that_is_a_file_falls_back(tmp_path):
    """os.access says a plain file is writable, so W_OK alone would have let a
    file through as the spool directory and rsyslog would have had nowhere to
    put its queue files.
    """
    a_file = tmp_path / 'not-a-directory'
    a_file.write_text('')

    conf = _conf_with_spool(str(a_file))

    assert f'queue.spoolDirectory="{a_file}"' not in conf
    assert f'queue.spoolDirectory="{DEFAULT_SPOOL_DIRECTORY}"' in conf


def test_a_spool_directory_that_cannot_be_entered_falls_back(tmp_path):
    """Writable but not searchable: the write bit alone does not let anything
    create a file inside, so rsyslog could not spool there either.
    """
    unsearchable = tmp_path / 'no-search'
    unsearchable.mkdir(mode=0o200)
    try:
        conf = _conf_with_spool(str(unsearchable))
    finally:
        unsearchable.chmod(0o700)

    assert f'queue.spoolDirectory="{unsearchable}"' not in conf
    assert f'queue.spoolDirectory="{DEFAULT_SPOOL_DIRECTORY}"' in conf
