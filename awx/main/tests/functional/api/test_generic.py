import threading

import pytest

from django.conf import settings
from django.db import connection, transaction

from awx.api.versioning import reverse
from awx.conf import settings_registry
from awx.conf.models import Setting
from awx.conf.settings import _get_setting_from_db


def assert_setting_applied(response, key, value):
    """Walk the settings machinery link by link, so that when this test flakes
    in CI the failing assert names the broken link instead of the downstream
    symptom (this test has a history of hard-to-diagnose CI-only failures)."""
    # the runtime registry can mark a setting read-only, which makes the API
    # PATCH skip it silently while still returning 200
    assert not settings_registry.is_setting_read_only(key), settings_registry._registry.get(key)
    # the serializer echoes back the values it actually processed
    assert response.data.get(key) == value, response.data.get(key)
    # the row the PATCH saved must be visible to this connection
    setting = Setting.objects.filter(key=key, user__isnull=True).order_by('pk').first()
    assert setting is not None and setting.value == value, getattr(setting, 'value', '<no row in database>')
    # and the live read must serve it through the cache layers
    first_read = getattr(settings, key)
    if first_read != value:
        # capture everything that discriminates between a poisoned memoized
        # entry, a stale/evicted django cache, a second DB connection that
        # cannot see this uncommitted row, and a stray background thread
        diagnostics = {
            'first_read': first_read,
            'memoizedcache': {str(k): v for k, v in settings._awx_conf_memoizedcache.items() if key in str(k)},
            'django_cache': settings.cache.get(Setting.get_cache_key(key), default='<missing>'),
            'get_setting_from_db': getattr(_get_setting_from_db(settings_registry, key), 'value', '<no row>'),
            'in_atomic_block': connection.in_atomic_block,
            'needs_rollback': transaction.get_rollback() if connection.in_atomic_block else None,
            'threads': sorted(t.name for t in threading.enumerate()),
        }
        settings._awx_conf_memoizedcache.clear()
        diagnostics['retry_after_memoized_clear'] = getattr(settings, key)
    assert first_read == value, diagnostics


@pytest.mark.django_db
def test_proxy_ip_allowed(get, patch, admin):
    url = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system'})
    headers = ['HTTP_X_FROM_THE_LOAD_BALANCER', 'REMOTE_ADDR', 'REMOTE_HOST']
    r = patch(url, user=admin, data={'REMOTE_HOST_HEADERS': headers}, expect=200)
    assert_setting_applied(r, 'REMOTE_HOST_HEADERS', headers)

    class HeaderTrackingMiddleware(object):
        environ = {}

        def process_request(self, request):
            pass

        def process_response(self, request, response):
            self.environ = request.environ

    # By default, `PROXY_IP_ALLOWED_LIST` is disabled, so custom `REMOTE_HOST_HEADERS`
    # should just pass through
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert middleware.environ['HTTP_X_FROM_THE_LOAD_BALANCER'] == 'some-actual-ip'

    # If `PROXY_IP_ALLOWED_LIST` is restricted to 10.0.1.100 and we make a request
    # from 8.9.10.11, the custom `HTTP_X_FROM_THE_LOAD_BALANCER` header should
    # be stripped
    r = patch(url, user=admin, data={'PROXY_IP_ALLOWED_LIST': ['10.0.1.100']}, expect=200)
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['10.0.1.100'])
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, REMOTE_ADDR='8.9.10.11', HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert 'HTTP_X_FROM_THE_LOAD_BALANCER' not in middleware.environ

    # If 8.9.10.11 is added to `PROXY_IP_ALLOWED_LIST` the
    # `HTTP_X_FROM_THE_LOAD_BALANCER` header should be passed through again
    r = patch(url, user=admin, data={'PROXY_IP_ALLOWED_LIST': ['10.0.1.100', '8.9.10.11']}, expect=200)
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['10.0.1.100', '8.9.10.11'])
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, REMOTE_ADDR='8.9.10.11', HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert middleware.environ['HTTP_X_FROM_THE_LOAD_BALANCER'] == 'some-actual-ip'

    # Allow allowed list of proxy hostnames in addition to IP addresses
    r = patch(url, user=admin, data={'PROXY_IP_ALLOWED_LIST': ['my.proxy.example.org']}, expect=200)
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['my.proxy.example.org'])
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, REMOTE_ADDR='8.9.10.11', REMOTE_HOST='my.proxy.example.org', HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert middleware.environ['HTTP_X_FROM_THE_LOAD_BALANCER'] == 'some-actual-ip'


@pytest.mark.django_db
class TestDeleteViews:
    def test_sublist_delete_permission_check(self, inventory_source, host, rando, delete):
        inventory_source.hosts.add(host)
        inventory_source.inventory.read_role.members.add(rando)
        delete(reverse('api:inventory_source_hosts_list', kwargs={'pk': inventory_source.pk}), user=rando, expect=403)

    def test_sublist_delete_functionality(self, inventory_source, host, rando, delete):
        inventory_source.hosts.add(host)
        inventory_source.inventory.admin_role.members.add(rando)
        delete(reverse('api:inventory_source_hosts_list', kwargs={'pk': inventory_source.pk}), user=rando, expect=204)
        assert inventory_source.hosts.count() == 0

    def test_destroy_permission_check(self, job_factory, system_auditor, delete):
        job = job_factory()
        resp = delete(job.get_absolute_url(), user=system_auditor)
        assert resp.status_code == 403


@pytest.mark.django_db
def test_filterable_fields(options, instance, admin_user):
    r = options(url=instance.get_absolute_url(), user=admin_user)

    filterable_info = r.data['actions']['GET']['created']
    non_filterable_info = r.data['actions']['GET']['percent_capacity_remaining']

    assert 'filterable' in filterable_info
    assert filterable_info['filterable'] is True

    assert not non_filterable_info['filterable']


@pytest.mark.django_db
def test_handle_content_type(post, admin):
    '''Tower should return 415 when wrong content type is in HTTP requests'''
    post(reverse('api:project_list'), {'name': 't', 'organization': None}, admin, content_type='text/html', expect=415)


@pytest.mark.django_db
def test_basic_not_found(get, admin_user):
    root_url = reverse('api:api_v2_root_view')
    r = get(root_url + 'fooooooo', user=admin_user, expect=404)
    assert r.data.get('detail') == 'The requested resource could not be found.'
