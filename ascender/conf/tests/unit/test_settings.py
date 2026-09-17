# -*- coding: utf-8 -*-

# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from contextlib import contextmanager
import codecs
from uuid import uuid4
import time

from unittest import mock

from django.conf import LazySettings
from django.core.cache.backends.locmem import LocMemCache
from django.core.exceptions import ImproperlyConfigured, SynchronousOnlyOperation
from django.db.utils import Error as DBError, OperationalError
from django.utils.translation import gettext_lazy as _
import psycopg
import pytest

from ascender.conf import models, fields
from ascender.conf.settings import SettingsWrapper, EncryptedCacheProxy, SETTING_CACHE_NOTSET
from ascender.conf.registry import SettingsRegistry

from ascender.main.utils import encrypt_field, decrypt_field


@contextmanager
def apply_patches(_patches):
    [p.start() for p in _patches]
    yield
    [p.stop() for p in _patches]


@pytest.fixture()
def settings(request):
    """
    This fixture initializes a Django settings object that wraps our
    `ascender.conf.settings.SettingsWrapper` and passes it as an argument into the
    test function.

    This mimics the work done by `ascender.conf.settings.SettingsWrapper.initialize`
    on `django.conf.settings`.
    """
    cache = LocMemCache(str(uuid4()), {})  # make a new random cache each time
    settings = LazySettings()
    registry = SettingsRegistry(settings)
    defaults = {}

    # @pytest.mark.defined_in_file can be used to mark specific setting values
    # as "defined in a settings file".  This is analogous to manually
    # specifying a setting on the filesystem (e.g., in a local_settings.py in
    # development, or in /etc/ascender/conf.d/<something>.py)
    for marker in request.node.own_markers:
        if marker.name == 'defined_in_file':
            defaults = marker.kwargs

    defaults['DEFAULTS_SNAPSHOT'] = {}
    settings.configure(**defaults)
    settings._wrapped = SettingsWrapper(settings._wrapped, cache, registry)
    return settings


@pytest.mark.defined_in_file(DEBUG=True)
def test_unregistered_setting(settings):
    "native Django settings are not stored in DB, and aren't cached"
    assert settings.DEBUG is True
    assert settings.cache.get('DEBUG') is None


def test_read_only_setting(settings):
    settings.registry.register('AWX_READ_ONLY', field_class=fields.CharField, category=_('System'), category_slug='system', default='NO-EDITS', read_only=True)
    assert settings.AWX_READ_ONLY == 'NO-EDITS'
    assert len(settings.registry.get_registered_settings(read_only=False)) == 0
    settings = settings.registry.get_registered_settings(read_only=True)
    assert settings == ['AWX_READ_ONLY']


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
@pytest.mark.parametrize('read_only', [True, False])
def test_setting_defined_in_file(settings, read_only):
    kwargs = {'read_only': True} if read_only else {}
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', **kwargs)
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert len(settings.registry.get_registered_settings(read_only=False)) == 0
    settings = settings.registry.get_registered_settings(read_only=True)
    assert settings == ['ASCENDER_SOME_SETTING']


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_setting_defined_in_file_with_empty_default(settings):
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', default='')
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert len(settings.registry.get_registered_settings(read_only=False)) == 0
    settings = settings.registry.get_registered_settings(read_only=True)
    assert settings == ['ASCENDER_SOME_SETTING']


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_setting_defined_in_file_with_specific_default(settings):
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', default=123)
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert len(settings.registry.get_registered_settings(read_only=False)) == 0
    settings = settings.registry.get_registered_settings(read_only=True)
    assert settings == ['ASCENDER_SOME_SETTING']


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_read_only_defaults_are_cached(settings):
    "read-only settings are stored in the cache"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert settings.cache.get('ASCENDER_SOME_SETTING') == 'DEFAULT'


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_cache_respects_timeout(settings):
    "only preload the cache every SETTING_CACHE_TIMEOUT settings"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')

    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    cache_expiration = settings.cache.get('_ascender_conf_preload_expires')
    assert cache_expiration > time.time()

    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert settings.cache.get('_ascender_conf_preload_expires') == cache_expiration


def test_default_setting(settings, mocker):
    "settings that specify a default are inserted into the cache"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', default='DEFAULT')

    settings_to_cache = mocker.Mock(**{'order_by.return_value': []})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=settings_to_cache)
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert settings.cache.get('ASCENDER_SOME_SETTING') == 'DEFAULT'


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_setting_is_from_setting_file(settings, mocker):
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert settings.registry.get_setting_field('ASCENDER_SOME_SETTING').defined_in_file is True


def test_setting_is_not_from_setting_file(settings, mocker):
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', default='DEFAULT')

    settings_to_cache = mocker.Mock(**{'order_by.return_value': []})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=settings_to_cache)
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    assert settings.registry.get_setting_field('ASCENDER_SOME_SETTING').defined_in_file is False


def test_empty_setting(settings, mocker):
    "settings with no default and no defined value are not valid"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')

    mocks = mocker.Mock(**{'order_by.return_value': mocker.Mock(**{'__iter__': lambda self: iter([]), 'first.return_value': None})})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=mocks)
    with pytest.raises(AttributeError):
        settings.ASCENDER_SOME_SETTING
    assert settings.cache.get('ASCENDER_SOME_SETTING') == SETTING_CACHE_NOTSET


def test_setting_from_db(settings, mocker):
    "settings can be loaded from the database"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', default='DEFAULT')

    setting_from_db = mocker.Mock(key='ASCENDER_SOME_SETTING', value='FROM_DB')
    mocks = mocker.Mock(**{'order_by.return_value': mocker.Mock(**{'__iter__': lambda self: iter([setting_from_db]), 'first.return_value': setting_from_db})})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=mocks)
    assert settings.ASCENDER_SOME_SETTING == 'FROM_DB'
    assert settings.cache.get('ASCENDER_SOME_SETTING') == 'FROM_DB'


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_read_only_setting_assignment(settings):
    "read-only settings cannot be overwritten"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    with pytest.raises(ImproperlyConfigured):
        settings.ASCENDER_SOME_SETTING = 'CHANGED'
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'


def test_db_setting_create(settings, mocker):
    "settings are stored in the database when set for the first time"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')

    setting_list = mocker.Mock(**{'order_by.return_value.first.return_value': None})
    with apply_patches(
        [
            mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=setting_list),
            mocker.patch('ascender.conf.models.Setting.objects.create', mocker.Mock()),
        ]
    ):
        settings.ASCENDER_SOME_SETTING = 'NEW-VALUE'

    models.Setting.objects.create.assert_called_with(key='ASCENDER_SOME_SETTING', user=None, value='NEW-VALUE')


def test_db_setting_update(settings, mocker):
    "settings are updated in the database when their value changes"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')

    existing_setting = mocker.Mock(key='ASCENDER_SOME_SETTING', value='FROM_DB')
    setting_list = mocker.Mock(**{'order_by.return_value.first.return_value': existing_setting})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=setting_list)
    settings.ASCENDER_SOME_SETTING = 'NEW-VALUE'

    assert existing_setting.value == 'NEW-VALUE'
    existing_setting.save.assert_called_with(update_fields=['value'])


def test_db_setting_deletion(settings, mocker):
    "settings are auto-deleted from the database"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')

    existing_setting = mocker.Mock(key='ASCENDER_SOME_SETTING', value='FROM_DB')
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=[existing_setting])
    del settings.ASCENDER_SOME_SETTING

    assert existing_setting.delete.call_count == 1


@pytest.mark.defined_in_file(ASCENDER_SOME_SETTING='DEFAULT')
def test_read_only_setting_deletion(settings):
    "read-only settings cannot be deleted"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system')
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'
    with pytest.raises(ImproperlyConfigured):
        del settings.ASCENDER_SOME_SETTING
    assert settings.ASCENDER_SOME_SETTING == 'DEFAULT'


def test_charfield_properly_sets_none(settings, mocker):
    "see: https://github.com/ansible/ansible-tower/issues/5322"
    settings.registry.register('ASCENDER_SOME_SETTING', field_class=fields.CharField, category=_('System'), category_slug='system', allow_null=True)

    setting_list = mocker.Mock(**{'order_by.return_value.first.return_value': None})
    with apply_patches(
        [
            mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=setting_list),
            mocker.patch('ascender.conf.models.Setting.objects.create', mocker.Mock()),
        ]
    ):
        settings.ASCENDER_SOME_SETTING = None

    models.Setting.objects.create.assert_called_with(key='ASCENDER_SOME_SETTING', user=None, value=None)


def test_settings_use_cache(settings, mocker):
    settings.registry.register('ASCENDER_VAR', field_class=fields.CharField, category=_('System'), category_slug='system')
    settings.cache.set('ASCENDER_VAR', 'foobar')
    settings.cache.set('_ascender_conf_preload_expires', 100)
    # Will fail test if database is used
    getattr(settings, 'ASCENDER_VAR')


def test_settings_use_an_encrypted_cache(settings, mocker):
    settings.registry.register('ASCENDER_ENCRYPTED', field_class=fields.CharField, category=_('System'), category_slug='system', encrypted=True)
    assert isinstance(settings.cache, EncryptedCacheProxy)
    assert settings.cache.__dict__['encrypter'] == encrypt_field
    assert settings.cache.__dict__['decrypter'] == decrypt_field
    settings.cache.set('ASCENDER_ENCRYPTED_ID', 402)
    settings.cache.set('ASCENDER_ENCRYPTED', 'foobar')
    settings.cache.set('_ascender_conf_preload_expires', 100)
    # Will fail test if database is used
    getattr(settings, 'ASCENDER_ENCRYPTED')


def test_sensitive_cache_data_is_encrypted(settings, mocker):
    "fields marked as `encrypted` are stored in the cache with encryption"
    settings.registry.register('ASCENDER_ENCRYPTED', field_class=fields.CharField, category=_('System'), category_slug='system', encrypted=True)

    def rot13(obj, attribute):
        assert obj.pk == 123
        return codecs.encode(getattr(obj, attribute), 'rot_13')

    native_cache = LocMemCache(str(uuid4()), {})
    cache = EncryptedCacheProxy(native_cache, settings.registry, encrypter=rot13, decrypter=rot13)
    # Insert the setting value into the database; the encryption process will
    # use its primary key as part of the encryption key
    setting_from_db = mocker.Mock(pk=123, key='ASCENDER_ENCRYPTED', value='SECRET!')
    mocks = mocker.Mock(**{'order_by.return_value': mocker.Mock(**{'__iter__': lambda self: iter([setting_from_db]), 'first.return_value': setting_from_db})})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=mocks)
    cache.set('ASCENDER_ENCRYPTED', 'SECRET!')
    assert cache.get('ASCENDER_ENCRYPTED') == 'SECRET!'
    assert native_cache.get('ASCENDER_ENCRYPTED') == 'FRPERG!'


def test_readonly_sensitive_cache_data_is_encrypted(settings):
    "readonly fields marked as `encrypted` are stored in the cache with encryption"
    settings.registry.register('ASCENDER_ENCRYPTED', field_class=fields.CharField, category=_('System'), category_slug='system', read_only=True, encrypted=True)

    def rot13(obj, attribute):
        assert obj.pk is None
        return codecs.encode(getattr(obj, attribute), 'rot_13')

    native_cache = LocMemCache(str(uuid4()), {})
    cache = EncryptedCacheProxy(native_cache, settings.registry, encrypter=rot13, decrypter=rot13)
    cache.set('ASCENDER_ENCRYPTED', 'SECRET!')
    assert cache.get('ASCENDER_ENCRYPTED') == 'SECRET!'
    assert native_cache.get('ASCENDER_ENCRYPTED') == 'FRPERG!'


@pytest.mark.defined_in_file(ASCENDER_VAR='DEFAULT')
def test_in_memory_cache_only_for_registered_settings(settings):
    "Test that we only make use of the in-memory TTL cache for registered settings"
    settings._ascender_conf_memoizedcache.clear()
    settings.MIDDLEWARE
    assert len(settings._ascender_conf_memoizedcache) == 0  # does not cache MIDDLEWARE
    settings.registry.register('ASCENDER_VAR', field_class=fields.CharField, category=_('System'), category_slug='system')
    settings._wrapped.__dict__['all_supported_settings'] = ['ASCENDER_VAR']  # because it is cached_property
    settings._ascender_conf_memoizedcache.clear()
    assert settings.ASCENDER_VAR == 'DEFAULT'
    assert len(settings._ascender_conf_memoizedcache) == 1  # caches registered settings


@pytest.mark.defined_in_file(ASCENDER_VAR='DEFAULT')
def test_in_memory_cache_works(settings):
    settings._ascender_conf_memoizedcache.clear()
    settings.registry.register('ASCENDER_VAR', field_class=fields.CharField, category=_('System'), category_slug='system')
    settings._wrapped.__dict__['all_supported_settings'] = ['ASCENDER_VAR']

    settings._ascender_conf_memoizedcache.clear()

    with mock.patch('ascender.conf.settings.SettingsWrapper._get_local', return_value='DEFAULT') as mock_get:
        assert settings.ASCENDER_VAR == 'DEFAULT'
        mock_get.assert_called_once_with('ASCENDER_VAR')

    with mock.patch.object(settings, '_get_local') as mock_get:
        assert settings.ASCENDER_VAR == 'DEFAULT'
        mock_get.assert_not_called()


@pytest.mark.defined_in_file(ASCENDER_VAR=[])
def test_getattr_with_database_error(settings):
    """
    If a setting is defined via the registry and has a null-ish default which is not None
    then referencing that setting during a database outage should give that default
    this is regression testing for a bug where it would return None
    """
    settings.registry.register('ASCENDER_VAR', field_class=fields.StringListField, default=[], category=_('System'), category_slug='system')
    settings._ascender_conf_memoizedcache.clear()

    with mock.patch('django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection') as mock_ensure:
        mock_ensure.side_effect = DBError('for test')
        assert settings.ASCENDER_VAR == []


def test_database_error_is_not_memoized(settings, mocker):
    """
    A transient database error during a read must degrade only that single
    read: the next read re-queries the database and returns its value.
    This is regression testing for a bug where the error fallback was stored
    in the memoized TTL cache, serving defaults for up to SETTING_MEMORY_TTL
    seconds after a single transient failure.

    Unlike test_getattr_with_database_error above, the setting here is not
    marked defined_in_file, so reads genuinely reach the database.
    """
    settings.registry.register('ASCENDER_VAR', field_class=fields.StringListField, default=[], category=_('System'), category_slug='system')
    settings._ascender_conf_memoizedcache.clear()

    with mock.patch('django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection') as mock_ensure:
        mock_ensure.side_effect = OperationalError('database is locked')
        assert getattr(settings, 'ASCENDER_VAR', 'unavailable') == 'unavailable'
        assert mock_ensure.called  # the read really hit the database layer

    # The database is back; the failed lookup must not have been memoized.
    setting_from_db = mocker.Mock(key='ASCENDER_VAR', value=['from-db'])
    mocks = mocker.Mock(**{'order_by.return_value': mocker.Mock(**{'__iter__': lambda self: iter([setting_from_db]), 'first.return_value': setting_from_db})})
    mocker.patch('ascender.conf.models.Setting.objects.filter', return_value=mocks)
    assert settings.ASCENDER_VAR == ['from-db']


@pytest.mark.parametrize(
    'cause',
    [
        pytest.param(psycopg.OperationalError('connection failed: password authentication failed'), id='no-sqlstate'),
        pytest.param(None, id='no-cause'),
    ],
)
def test_database_error_without_sqlstate_is_logged_not_raised(settings, caplog, cause):
    """
    A refused connection is a psycopg OperationalError whose sqlstate is None,
    and a Django error need not carry a cause at all. Either used to make the
    error reporting itself crash in psycopg.errors.lookup, which replaced the
    useful warning with a traceback about NoneType.
    """
    settings.registry.register('ASCENDER_VAR', field_class=fields.StringListField, default=[], category=_('System'), category_slug='system')
    settings._ascender_conf_memoizedcache.clear()

    error = OperationalError('connection failed')
    error.__cause__ = cause
    with mock.patch('django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection') as mock_ensure:
        mock_ensure.side_effect = error
        with caplog.at_level('WARNING', logger='ascender.conf.settings'):
            assert getattr(settings, 'ASCENDER_VAR', 'unavailable') == 'unavailable'

    assert 'Database settings are not available, using defaults. error: connection failed' in caplog.text
    assert 'SQL Error state' not in caplog.text
    assert 'Traceback' not in caplog.text


def test_database_error_with_sqlstate_names_it(settings, caplog):
    settings.registry.register('ASCENDER_VAR', field_class=fields.StringListField, default=[], category=_('System'), category_slug='system')
    settings._ascender_conf_memoizedcache.clear()

    error = OperationalError('too many clients')
    error.__cause__ = psycopg.errors.TooManyConnections('too many clients')
    with mock.patch('django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection') as mock_ensure:
        mock_ensure.side_effect = error
        with caplog.at_level('WARNING', logger='ascender.conf.settings'):
            assert getattr(settings, 'ASCENDER_VAR', 'unavailable') == 'unavailable'

    assert 'SQL Error state: 53300 - TooManyConnections' in caplog.text


def test_a_settings_query_runs_on_another_thread_when_the_caller_has_a_loop():
    """Django refuses database access from the thread running an event loop, so
    the ASGI middleware that reads settings on the loop would raise rather than
    read. The query has to move to a thread of its own.
    """
    import asyncio
    import threading

    from ascender.conf.settings import _read_from_db

    calling_thread = threading.current_thread().ident
    ran_on = []

    def query():
        ran_on.append(threading.current_thread().ident)
        if len(ran_on) == 1:
            # What Django raises for database access on the loop thread.
            raise SynchronousOnlyOperation('cannot call this from an async context')
        return 'answered'

    async def read_from_the_loop():
        return _read_from_db(query)

    assert asyncio.run(read_from_the_loop()) == 'answered'
    assert ran_on[-1] != calling_thread, 'the retry ran on the calling thread'


def test_a_settings_query_stays_on_the_caller_thread_when_it_can():
    """The thread hop is for the loop only. Every other caller, which is every
    caller today, pays nothing for it.
    """
    import threading

    from ascender.conf.settings import _read_from_db

    here = threading.current_thread().ident
    assert _read_from_db(lambda: threading.current_thread().ident) == here


def test_the_thread_closes_its_connection():
    """A connection belongs to its thread and nothing reuses this one. Left open
    it is collected later, and psycopg warns it was deleted while still open.
    """
    from unittest import mock

    from ascender.conf.settings import _read_from_db

    calls = []

    def query():
        if not calls:
            calls.append('first')
            raise SynchronousOnlyOperation('cannot call this from an async context')
        return 'answered'

    with mock.patch('ascender.conf.settings.connection') as conn:
        assert _read_from_db(query) == 'answered'
    assert conn.close.called, 'the thread left its connection open'
