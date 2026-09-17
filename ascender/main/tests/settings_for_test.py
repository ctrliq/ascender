# Python
import os
import uuid

# Load development settings for base variables.
from ascender.settings.development import *  # NOQA

# Some things make decisions based on settings.SETTINGS_MODULE, so this is done for that
SETTINGS_MODULE = 'ascender.settings.development'

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-{}'.format(str(uuid.uuid4())),
        # The ascender.conf settings machinery alone keeps ~300 keys cached; the
        # default MAX_ENTRIES of 300 makes LocMemCache cull arbitrary keys
        # (settings included) mid-test.
        'OPTIONS': {'MAX_ENTRIES': 10000},
    }
}
# The suite runs on PostgreSQL, which is what Ascender is deployed against. It
# used to run on SQLite so that no service was needed, but that hid whole code
# paths: the partitioned event tables, the COPY that assembles job stdout, and
# every assertNumQueries, none of which behave the same way on SQLite.
#
# Inside the development container the connection comes from the settings that
# ascender.settings.development already loaded out of /etc/ascender/conf.d. Anywhere
# without those files, such as a throwaway CI container, each part can be
# supplied through the environment instead.
_dev_database = DATABASES.get('default', {})  # noqa: F405
if 'postgresql' not in _dev_database.get('ENGINE', '') and 'pg' not in _dev_database.get('ENGINE', ''):
    _dev_database = {}


def _test_database_setting(name, default):
    """ASCENDER_TEST_DATABASE_<name>, falling back to the AWX_ name.

    The old names are read second rather than dropped because they are exported
    in developers' shells and by anything outside this repository that runs the
    suite. Dropping them would not fail loudly: the lookup would miss and fall
    through to the default, running the suite against a different database than
    the one the environment asked for.
    """
    return os.getenv(f'ASCENDER_TEST_DATABASE_{name}', os.getenv(f'AWX_TEST_DATABASE_{name}', default))


DATABASES = {
    'default': {
        'ENGINE': 'ascender.main.db.profiled_pg',
        'NAME': _test_database_setting('NAME', _dev_database.get('NAME', 'ascender')),
        'USER': _test_database_setting('USER', _dev_database.get('USER', 'ascender')),
        'PASSWORD': _test_database_setting('PASSWORD', _dev_database.get('PASSWORD', 'ascenderpass')),
        'HOST': _test_database_setting('HOST', _dev_database.get('HOST', '127.0.0.1')),
        'PORT': _test_database_setting('PORT', str(_dev_database.get('PORT', '5432'))),
        'ATOMIC_REQUESTS': True,
        # The test database is disposable, so durability buys nothing and costs
        # a real amount of wall clock: every commit would otherwise wait on an
        # fsync. Scoped to this connection, so it cannot affect a real database.
        'OPTIONS': {'options': '-c synchronous_commit=off'},
        # Created and dropped by the test runner, so the rename strands nothing:
        # a leftover test_awx_pg from an earlier checkout is simply ignored.
        'TEST': {'NAME': _test_database_setting('TEST_NAME', 'test_ascender_pg')},
    }
}

# The production hasher is deliberately expensive: PBKDF2 at Django's default
# iteration count costs a measurable fraction of a second per call, and the
# fixtures create a user for nearly every functional test. Hashing is not what
# any of them are testing, so use the cheap hasher and get the time back. The
# count rises with most Django releases, so it is not quoted here.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Use in-memory channel layer for tests to avoid Redis/Valkey connection issues
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

# Ensure BROADCAST_WEBSOCKET_SECRET is set for websocket tests
BROADCAST_WEBSOCKET_SECRET = 'test-secret-for-websockets'
