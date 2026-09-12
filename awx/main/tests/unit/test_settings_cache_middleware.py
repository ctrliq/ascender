# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
When the in-memory settings cache is dropped, and when it is left alone.
"""

from unittest import mock

import pytest

from awx.conf.settings import SETTING_CACHE_VERSION_KEY
from awx.main.middleware import SettingsCacheMiddleware


@pytest.fixture
def memoized():
    """Stand in for settings._awx_conf_memoizedcache, which only clear() is called on."""
    return mock.MagicMock()


@pytest.fixture
def middleware(memoized):
    mw = SettingsCacheMiddleware(get_response=lambda request: None)
    with mock.patch('awx.main.middleware.settings') as settings:
        settings._awx_conf_memoizedcache = memoized
        yield mw


def read_returns(*values):
    """A cache whose get() answers each value in turn."""
    cache = mock.MagicMock()
    cache.get.side_effect = list(values)
    return cache


def test_the_first_request_drops_the_cache(middleware, memoized):
    with mock.patch('awx.main.middleware.cache', read_returns(7)):
        middleware.process_request(mock.Mock())

    assert memoized.clear.call_count == 1


def test_an_unchanged_version_leaves_the_cache_alone(middleware, memoized):
    with mock.patch('awx.main.middleware.cache', read_returns(7, 7, 7)):
        for _ in range(3):
            middleware.process_request(mock.Mock())

    # only the first request, which had never seen a version before
    assert memoized.clear.call_count == 1


def test_a_moved_version_drops_the_cache_once(middleware, memoized):
    with mock.patch('awx.main.middleware.cache', read_returns(7, 8, 8)):
        for _ in range(3):
            middleware.process_request(mock.Mock())

    assert memoized.clear.call_count == 2


def test_it_reads_one_key(middleware):
    cache = read_returns(1)
    with mock.patch('awx.main.middleware.cache', cache):
        middleware.process_request(mock.Mock())

    cache.get.assert_called_once_with(SETTING_CACHE_VERSION_KEY)


def test_a_cache_that_cannot_be_read_drops_the_cache(middleware, memoized):
    cache = mock.MagicMock()
    cache.get.side_effect = RuntimeError('valkey is not there')
    with mock.patch('awx.main.middleware.cache', cache):
        middleware.process_request(mock.Mock())
        middleware.process_request(mock.Mock())

    # every request, because nothing can be trusted about what is in memory
    assert memoized.clear.call_count == 2


def test_a_missing_version_is_still_a_version(middleware, memoized):
    """An empty cache reads as None, which is a value like any other."""
    with mock.patch('awx.main.middleware.cache', read_returns(None, None)):
        middleware.process_request(mock.Mock())
        middleware.process_request(mock.Mock())

    assert memoized.clear.call_count == 1
