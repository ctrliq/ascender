# Python
import uuid

# Load development settings for base variables.
from awx.settings.development import *  # NOQA

# Some things make decisions based on settings.SETTINGS_MODULE, so this is done for that
SETTINGS_MODULE = 'awx.settings.development'

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-{}'.format(str(uuid.uuid4())),
        # The awx.conf settings machinery alone keeps ~300 keys cached; the
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
# awx.settings.development already loaded out of /etc/tower/conf.d. Anywhere
# without those files, such as a throwaway CI container, each part can be
# supplied through the environment instead.
_dev_database = DATABASES.get('default', {})  # noqa: F405
if 'postgresql' not in _dev_database.get('ENGINE', '') and 'pg' not in _dev_database.get('ENGINE', ''):
    _dev_database = {}

DATABASES = {
    'default': {
        'ENGINE': 'awx.main.db.profiled_pg',
        'NAME': os.getenv('AWX_TEST_DATABASE_NAME', _dev_database.get('NAME', 'awx')),  # noqa
        'USER': os.getenv('AWX_TEST_DATABASE_USER', _dev_database.get('USER', 'awx')),  # noqa
        'PASSWORD': os.getenv('AWX_TEST_DATABASE_PASSWORD', _dev_database.get('PASSWORD', 'awxpass')),  # noqa
        'HOST': os.getenv('AWX_TEST_DATABASE_HOST', _dev_database.get('HOST', '127.0.0.1')),  # noqa
        'PORT': os.getenv('AWX_TEST_DATABASE_PORT', str(_dev_database.get('PORT', '5432'))),  # noqa
        'ATOMIC_REQUESTS': True,
        # The test database is disposable, so durability buys nothing and costs
        # a real amount of wall clock: every commit would otherwise wait on an
        # fsync. Scoped to this connection, so it cannot affect a real database.
        'OPTIONS': {'options': '-c synchronous_commit=off'},
        'TEST': {'NAME': os.getenv('AWX_TEST_DATABASE_TEST_NAME', 'test_awx_pg')},  # noqa
    }
}

# The production hasher is deliberately expensive: a single PBKDF2 hash costs
# roughly 0.7s at Django 6.1's 1,500,000 iterations, and the fixtures create a
# user for nearly every functional test. Hashing is not what any of them are
# testing, so use the cheap hasher and get the time back.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Use in-memory channel layer for tests to avoid Redis/Valkey connection issues
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

# Ensure BROADCAST_WEBSOCKET_SECRET is set for websocket tests
BROADCAST_WEBSOCKET_SECRET = 'test-secret-for-websockets'
