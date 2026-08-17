# Python
import copy
import os

# Load the standard test settings, then put the database back on PostgreSQL.
from awx.main.tests.settings_for_test import *  # NOQA
from awx.settings.development import DATABASES as DEVELOPMENT_DATABASES

# settings_for_test swaps the database for SQLite so the suite runs with no
# services attached. That leaves the PostgreSQL-only SQL in AWX unreachable from
# a test: cleanup_jobs alone reaches ANY(%s), pg_tables and pg_catalog.pg_inherits.
# Point at the development database instead and let Django build its own test_
# database next to it, so those statements execute for real.
#
# Opt in with DJANGO_SETTINGS_MODULE=awx.main.tests.settings_for_test_pg, or use
# `make test-postgres`. Tests that need this guard themselves with a skipif on
# connection.vendor, so they stay inert under the default SQLite settings.
DATABASES = copy.deepcopy(DEVELOPMENT_DATABASES)
DATABASES['default']['TEST'] = {'NAME': os.getenv('AWX_TEST_DATABASE_NAME', 'test_awx_pg')}
