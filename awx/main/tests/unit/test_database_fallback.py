# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""What the database settings fall back to when nothing supplies them.

The block in awx/settings/defaults.py is the fallback for a process started
with no settings files at all. Every real path supplies its own: the operator
writes credentials.py, the development environment writes database.py, and the
test settings build their own from AWX_TEST_DATABASE_*.

That is the whole reason the fallback could take the Ascender name without a
migration, and the reason the deployed name could not. These tests keep both
halves of that honest.
"""

import pathlib

from awx.settings.defaults import DATABASES


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

    assert 'AWX_TEST_DATABASE_NAME' in source.read_text()


def test_the_development_environment_writes_its_own():
    """The compose environment templates database.py, so a developer's existing
    postgres volume, whose database is named awx, is untouched by this.
    """
    template = pathlib.Path(__file__).resolve().parents[4] / 'tools' / 'docker-compose' / 'ansible' / 'roles' / 'sources' / 'templates' / 'database.py.j2'

    assert template.exists()
    assert 'DATABASES' in template.read_text()
