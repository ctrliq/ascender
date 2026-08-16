# HACK: the dab_resource_registry app requires ServiceID to be created in a
# data migration, which is skipped under pytest's --nomigrations.  Mirror the
# hack in awx/main/tests/functional/conftest.py so these SSO functional tests
# can be run in isolation (without that conftest tree on the collection path).
import importlib

from django.apps import apps
from django.db.models.signals import post_migrate

from awx.main.utils import is_testing

dab_rr_initial = importlib.import_module('ansible_base.resource_registry.migrations.0001_initial')

if is_testing():
    post_migrate.connect(lambda **kwargs: dab_rr_initial.create_service_id(apps, None))
