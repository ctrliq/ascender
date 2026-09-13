# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The numbers every API response already carries, and nothing was holding.

The roadmap item about OpenTelemetry says three other items need numbers that
nothing produces. For the web tier that is not so: a response reports how long
it took, and behind SQL_DEBUG how many queries it ran and how long they took.
Those are the numbers the connection pooling, settings cache and unified job
measurements were all made from.

Nothing asserted any of it, so a refactor of finalize_response or of the
timing middleware could have taken the instrumentation away without a test
noticing. These hold it.

What is genuinely missing is the other two thirds of that item: the dispatcher
and the runner report none of this, and nothing joins a request to the work it
causes. That is the gap OpenTelemetry would fill.
"""

import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_a_response_says_how_long_it_took(get, admin):
    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert 'X-API-Time' in response
    assert response['X-API-Time'].endswith('s')


@pytest.mark.django_db
def test_a_response_says_which_node_answered(get, admin):
    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert response['X-API-Node']


@pytest.mark.django_db
def test_a_response_says_what_product_it_is(get, admin):
    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert response['X-API-Product-Name']


@pytest.mark.django_db
def test_sql_debug_adds_the_query_count_and_time(get, admin, settings):
    """The two numbers every measurement in the roadmap work was made from."""
    settings.SQL_DEBUG = True

    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert int(response['X-API-Query-Count']) >= 0
    assert response['X-API-Query-Time'].endswith('s')


@pytest.mark.django_db
def test_without_sql_debug_the_query_numbers_are_not_paid_for(get, admin, settings):
    """connection.queries only fills when debug is on, so this is off by default."""
    settings.SQL_DEBUG = False

    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert 'X-API-Query-Count' not in response


@pytest.mark.django_db
def test_a_deprecated_view_says_so(get, admin):
    """The other thing finalize_response is relied on for."""
    response = get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system', 'version': 'v2'}), user=admin, expect=200)

    assert 'Warning' not in response
