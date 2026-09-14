# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""The names on the analytics feed, which another product reads.

These are not diagnostics. `ascender.analytics.job_events` and
`ascender.analytics.activity_stream` are the feed Ledger parses, switching on
the logger name to decide what a record is, and a name it does not recognise is
skipped rather than reported. Anything a deployment has pointed at its own log
aggregator filters on them the same way.

So the names are a contract with something outside this repository, and these
tests state them rather than leaving them spread across eight modules.
"""

import logging

import pytest

from ascender.main.constants import ANALYTICS_LOGGER_PREFIX


@pytest.mark.parametrize(
    'module, attribute, suffix',
    [
        ('ascender.main.models.events', 'analytics_logger', 'job_events'),
        ('ascender.main.signals', 'analytics_logger', 'activity_stream'),
        ('ascender.main.models.unified_jobs', 'logger_job_lifecycle', 'job_lifecycle'),
        ('ascender.main.tasks.facts', 'system_tracking_logger', 'system_tracking'),
        ('ascender.main.analytics.broadcast_websocket', 'logger', 'broadcast_websocket'),
        ('ascender.main.middleware', 'perf_logger', 'performance'),
        ('ascender.api.generics', 'analytics_logger', 'performance'),
    ],
)
def test_each_analytics_logger_carries_the_ascender_name(module, attribute, suffix):
    """Ledger accepts both prefixes as of ctrliq/ascender-ledger#50, so this is
    safe to state; it would not have been before that.
    """
    import importlib

    logger = getattr(importlib.import_module(module), attribute)

    assert logger.name == f'{ANALYTICS_LOGGER_PREFIX}.{suffix}'


def test_the_prefix_is_the_ascender_one():
    assert ANALYTICS_LOGGER_PREFIX == 'ascender.analytics'


def test_every_analytics_logger_is_configured():
    """A logger with no entry in LOGGING propagates to the root instead of
    reaching the external log handler, which loses the feed silently.
    """
    from django.conf import settings

    configured = {name for name in settings.LOGGING['loggers'] if name.startswith(ANALYTICS_LOGGER_PREFIX)}

    assert ANALYTICS_LOGGER_PREFIX in configured


def test_the_suffix_is_what_the_aggregator_setting_matches_on():
    """LOG_AGGREGATOR_LOGGERS holds bare suffixes, and the filter splits them
    back off the record name. A prefix that changed without this splitting
    logic changing would silently disable every configured logger.
    """
    from ascender.main.utils.filters import ExternalLoggerEnabled

    filter = ExternalLoggerEnabled(enabled_flag=True, enabled_loggers=['job_events'])
    record = logging.LogRecord(f'{ANALYTICS_LOGGER_PREFIX}.job_events', logging.INFO, 'path', 1, 'message', None, None)

    assert filter.filter(record) is True
