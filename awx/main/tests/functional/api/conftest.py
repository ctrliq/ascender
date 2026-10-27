import pytest

from django.test import Client

from awx.conf import settings_registry


@pytest.fixture
def browser():
    """A django.test.Client that sends requests through the full middleware chain.

    URLModificationMiddleware registers the NAMED_URL_* settings when it is
    constructed and refuses a second registration, and every Client builds its
    own chain. Unregistering them afterwards lets the next Client build again.
    """
    yield Client()
    for setting in ('NAMED_URL_FORMATS', 'NAMED_URL_GRAPH_NODES'):
        settings_registry.unregister(setting)
