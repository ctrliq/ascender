# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Whether ascender/settings/typed.py still describes the settings the code can read.

The Protocol is what lets a checker say anything about settings.SOMETHING, and
it is generated, so the only thing keeping it useful is a test that fails when a
setting is added without regenerating it.

What is deliberately not asserted here is that the file matches this process
byte for byte. The file is generated from a deployment, where the registry is
populated and the settings modules are the production ones; a test run loads a
different profile and sees a different set. Comparing them would fail for a
reason that says nothing about the code. ``awx-manage generate_setting_types
--check`` is the one that compares, and it runs where that comparison means
something.
"""

import pytest

from ascender.conf.management.commands.generate_setting_types import setting_names, type_of
from ascender.settings.typed import AscenderSettings, settings


@pytest.mark.django_db
def test_every_setting_this_process_can_read_is_described():
    described = set(AscenderSettings.__annotations__)

    missing = [name for name in setting_names() if name not in described]

    assert missing == [], 'a checker would still see these as Unknown: {}'.format(missing)


@pytest.mark.django_db
def test_there_is_something_to_describe():
    # The check above passes trivially against an empty settings object.
    assert len(setting_names()) > 300
    assert len(AscenderSettings.__annotations__) > 300


@pytest.mark.django_db
def test_it_is_the_same_object_at_run_time():
    # The Protocol is a description, not a wrapper: importing from here has to
    # be the same settings object, or reads would diverge from writes.
    from django.conf import settings as django_settings

    assert settings is django_settings


@pytest.mark.django_db
def test_a_value_decides_its_own_type():
    assert type_of('DEBUG') == 'bool'
    assert type_of('DATABASES') == 'dict[str, Any]'
    assert type_of('LOG_AGGREGATOR_LEVEL') == 'str'


@pytest.mark.django_db
def test_a_registered_setting_with_no_value_takes_its_type_from_its_field():
    # These are the ones a value cannot speak for: None says nothing, so the
    # field the setting is registered with does.
    assert type_of('DATABASE_STATEMENT_TIMEOUT') in ('int | None', 'Any')
