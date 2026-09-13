# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Every registered setting declares a field and carries a default, and until this
nothing asked whether the two agreed. A default its own field refuses is not a
startup failure: it surfaces when somebody reads that setting through the API.
"""

import pytest

from django.core.management import call_command
from django.core.management.base import CommandError

from rest_framework import fields as drf_fields

from awx.conf import fields, register, settings_registry
from awx.conf.validation import invalid_setting_defaults


@pytest.mark.django_db
def test_every_registered_setting_accepts_its_own_default():
    assert invalid_setting_defaults() == []


@pytest.mark.django_db
def test_there_are_settings_to_check():
    # The check above passes trivially if the registry is empty, which it is
    # not: the whole point is that it walks every one of them.
    assert len(settings_registry.get_registered_settings()) > 100


@pytest.mark.django_db
def test_a_field_that_depends_on_another_setting_is_left_alone():
    # LDAPGroupTypeParamsField checks its keys against the arguments of whatever
    # class AUTH_LDAP_GROUP_TYPE names, so its default is only right or wrong
    # next to that setting. Judging it alone reports whatever the process last
    # left in AUTH_LDAP_GROUP_TYPE.
    depends = [s for s in settings_registry.get_registered_settings() if getattr(settings_registry.get_setting_field(s), 'depends_on', None)]

    assert 'AUTH_LDAP_GROUP_TYPE_PARAMS' in depends
    assert not set(depends) & {p.split(':')[0] for p in invalid_setting_defaults()}


@pytest.mark.django_db
def test_a_default_its_field_refuses_is_reported():
    register(
        'AWX_TEST_BROKEN_DEFAULT',
        field_class=drf_fields.IntegerField,
        default='not a number',
        label='Broken on purpose',
        category='System',
        category_slug='system',
    )
    try:
        problems = invalid_setting_defaults()
    finally:
        settings_registry.unregister('AWX_TEST_BROKEN_DEFAULT')

    assert len(problems) == 1
    assert 'AWX_TEST_BROKEN_DEFAULT' in problems[0]


@pytest.mark.django_db
def test_the_command_passes_today():
    call_command('check_settings')


@pytest.mark.django_db
def test_the_command_fails_on_a_bad_default():
    register(
        'AWX_TEST_BROKEN_LIST',
        field_class=fields.StringListField,
        default='a string, not a list',
        label='Broken on purpose',
        category='System',
        category_slug='system',
    )
    try:
        with pytest.raises(CommandError) as exc:
            call_command('check_settings')
    finally:
        settings_registry.unregister('AWX_TEST_BROKEN_LIST')

    assert 'AWX_TEST_BROKEN_LIST' in str(exc.value)
