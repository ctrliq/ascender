# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""What the database settings fall back to when nothing supplies them.

The block in ascender/settings/defaults.py is the fallback for a process started
with no settings files at all. Every real path supplies its own: the operator
writes credentials.py, the development environment writes database.py, and the
test settings build their own from ASCENDER_TEST_DATABASE_*.

That is the whole reason the fallback could take the Ascender name without a
migration, and the reason the deployed name could not. These tests keep both
halves of that honest.
"""

import pathlib

from ascender.main.tests.settings_for_test import _test_database_setting
from ascender.settings.defaults import DATABASES


def test_the_fallback_carries_the_ascender_name():
    assert DATABASES['default']['NAME'] == 'ascender'
    assert DATABASES['default']['USER'] == 'ascender'


def test_the_fallback_is_postgresql():
    """SQLite is not a fallback any more: the Rocky 9 base image ships 3.34
    where Django 6.1 wants 3.37, so it could not open a connection even to fail
    usefully.
    """
    assert DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'


def test_the_suite_builds_its_own_connection_rather_than_taking_the_fallback():
    """If it took the fallback, this rename would have moved the database the
    suite runs against and every test needing one would fail to connect.
    """
    source = pathlib.Path(__file__).resolve().parents[2] / 'tests' / 'settings_for_test.py'

    assert 'ASCENDER_TEST_DATABASE_' in source.read_text()


def test_the_development_environment_writes_its_own():
    """The compose environment templates database.py, so a developer's existing
    postgres volume, whose database is named awx, is untouched by this.
    """
    template = pathlib.Path(__file__).resolve().parents[4] / 'tools' / 'docker-compose' / 'ansible' / 'roles' / 'sources' / 'templates' / 'database.py.j2'

    assert template.exists()
    assert 'DATABASES' in template.read_text()


def test_the_ascender_names_win_over_the_awx_ones(monkeypatch):
    """Both set is what a developer who exported the old names years ago and
    then copied the new ones out of ci.yml ends up with.
    """
    monkeypatch.setenv('ASCENDER_TEST_DATABASE_NAME', 'from-ascender')
    monkeypatch.setenv('AWX_TEST_DATABASE_NAME', 'from-awx')

    assert _test_database_setting('NAME', 'fallback') == 'from-ascender'


def test_the_awx_names_are_still_honoured(monkeypatch):
    """They are exported in developers' shells and by anything outside this
    repository that runs the suite. Dropping them would not fail loudly: the
    lookup would miss and the suite would connect to the default instead.
    """
    monkeypatch.delenv('ASCENDER_TEST_DATABASE_NAME', raising=False)
    monkeypatch.setenv('AWX_TEST_DATABASE_NAME', 'from-awx')

    assert _test_database_setting('NAME', 'fallback') == 'from-awx'


def test_the_default_is_taken_when_neither_name_is_set(monkeypatch):
    monkeypatch.delenv('ASCENDER_TEST_DATABASE_NAME', raising=False)
    monkeypatch.delenv('AWX_TEST_DATABASE_NAME', raising=False)

    assert _test_database_setting('NAME', 'fallback') == 'fallback'
