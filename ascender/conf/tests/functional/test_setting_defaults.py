# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Every registered setting declares a field and carries a default, and until this
nothing asked whether the two agreed. A default its own field refuses is not a
startup failure: it surfaces when somebody reads that setting through the API.
"""

import os

import pytest

from django.conf import settings
from django.core.management import call_command
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import CommandError

from rest_framework import fields as drf_fields

import ascender
from ascender.conf import fields, register, settings_registry
from ascender.conf.validation import invalid_setting_defaults, unresolvable_settings
from ascender.main.middleware import URLModificationMiddleware


@pytest.fixture(scope='module')
def named_url_middleware(django_db_setup, django_db_blocker):
    """
    Build the middleware chain once, which is what creates the named url
    settings. Its __init__ registers two settings and register() refuses a
    second registration, so this cannot be done per test.
    """
    with django_db_blocker.unblock():
        try:
            URLModificationMiddleware(lambda request: None)
        except ImproperlyConfigured:
            pass  # another test in this process built it first
    return True


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


@pytest.mark.django_db
def test_every_setting_the_code_reads_resolves(named_url_middleware):
    # A settings.SOME_NAME that nothing defines raises AttributeError the first
    # time that line runs. Three of these exist only because
    # URLModificationMiddleware builds them in __init__, so the chain has to
    # have been built once before they answer, which is the wart this records.
    package = os.path.dirname(os.path.abspath(ascender.__file__))

    missing = unresolvable_settings(package)

    assert missing == {}, 'read but never defined:\n' + '\n'.join('{}: {}'.format(k, ', '.join(v)) for k, v in sorted(missing.items()))


@pytest.mark.django_db
def test_named_url_mappings_exists_only_once_the_middleware_is_built(named_url_middleware):
    # The wart, pinned so it is a decision rather than a surprise. Three named
    # url settings appear when URLModificationMiddleware is constructed rather
    # than in any settings file. Two of them it registers, so the registry
    # answers for them. NAMED_URL_MAPPINGS it only assigns, so nothing but a
    # built middleware chain makes settings.NAMED_URL_MAPPINGS resolve at all.
    package = os.path.dirname(os.path.abspath(ascender.__file__))
    for name in ('NAMED_URL_FORMATS', 'NAMED_URL_GRAPH_NODES', 'NAMED_URL_MAPPINGS'):
        if hasattr(settings, name):
            delattr(settings, name)

    missing = unresolvable_settings(package)

    assert set(missing) == {'NAMED_URL_MAPPINGS'}
    assert 'NAMED_URL_FORMATS' in settings_registry.get_registered_settings()
    assert 'NAMED_URL_GRAPH_NODES' in settings_registry.get_registered_settings()
