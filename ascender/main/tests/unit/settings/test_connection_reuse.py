# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Which processes keep a database connection between requests, and which do not.
"""

import pytest

from ascender.settings.connection_reuse import DEFAULT_WEB_POOL, set_conn_max_age, set_connection_pool


@pytest.fixture
def databases():
    return {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': 'awx'}}


@pytest.fixture(autouse=True)
def no_web_marker(monkeypatch):
    """Start every test from a process that does not claim to serve HTTP."""
    monkeypatch.delenv('AWX_WEB_PROCESS', raising=False)


class TestWebProcess:
    def test_a_web_process_keeps_no_connection(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_conn_max_age(databases)

        assert 'CONN_MAX_AGE' not in databases['default']

    def test_the_setting_wins_over_the_default(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_conn_max_age(databases, 300)

        assert databases['default']['CONN_MAX_AGE'] == 300

    def test_the_setting_can_turn_reuse_off(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_conn_max_age(databases, 0)

        assert databases['default']['CONN_MAX_AGE'] == 0


class TestEverythingElse:
    def test_a_task_process_is_left_alone(self, databases):
        set_conn_max_age(databases)

        assert 'CONN_MAX_AGE' not in databases['default']

    def test_a_task_process_still_honours_the_setting(self, databases):
        set_conn_max_age(databases, 120)

        assert databases['default']['CONN_MAX_AGE'] == 120


class TestMissingDatabases:
    def test_no_databases_at_all(self):
        databases = {}

        set_conn_max_age(databases, 60)

        assert databases == {}

    def test_no_default_database(self):
        databases = {'other': {}}

        set_conn_max_age(databases, 60)

        assert databases == {'other': {}}


class TestPool:
    def test_a_web_process_gets_the_pool(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_connection_pool(databases)

        assert databases['default']['OPTIONS']['pool'] == DEFAULT_WEB_POOL

    def test_the_setting_replaces_the_sizes(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_connection_pool(databases, {'min_size': 1, 'max_size': 10})

        assert databases['default']['OPTIONS']['pool'] == {'min_size': 1, 'max_size': 10}

    def test_the_setting_can_turn_it_off(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')

        set_connection_pool(databases, False)

        assert 'OPTIONS' not in databases['default']

    def test_a_conn_max_age_leaves_it_off(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        set_conn_max_age(databases, 60)

        set_connection_pool(databases)

        assert 'OPTIONS' not in databases['default']

    def test_a_conn_max_age_of_0_keeps_it(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        set_conn_max_age(databases, 0)

        set_connection_pool(databases)

        assert databases['default']['OPTIONS']['pool'] == DEFAULT_WEB_POOL

    def test_other_options_are_kept(self, databases, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        databases['default']['OPTIONS'] = {'application_name': 'awx-web'}

        set_connection_pool(databases)

        assert databases['default']['OPTIONS'] == {'application_name': 'awx-web', 'pool': DEFAULT_WEB_POOL}

    def test_a_task_process_gets_none(self, databases):
        set_connection_pool(databases, {'max_size': 10})

        assert 'OPTIONS' not in databases['default']

    def test_no_default_database(self, monkeypatch):
        monkeypatch.setenv('AWX_WEB_PROCESS', '1')
        databases = {'other': {}}

        set_connection_pool(databases)

        assert databases == {'other': {}}
