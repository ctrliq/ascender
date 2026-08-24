import os
import threading
import time
import weakref
from unittest import mock

import pytest

from django.conf import settings
from django.db import connection, transaction
from django.db.models.signals import post_save

from awx.api.versioning import reverse
from awx.conf import settings_registry
import awx.conf.signals
from awx.conf.models import Setting
from awx.conf.settings import SettingsWrapper, _get_setting_from_db

# Settings whose reads/invalidation get traced by the settings_event_log
# fixture, purely to diagnose a CI-only flake in test_proxy_ip_allowed.
TRACKED_SETTINGS = ('PROXY_IP_ALLOWED_LIST', 'REMOTE_HOST_HEADERS')


def _post_save_dispatch_state():
    """Snapshot django's post_save dispatcher internals for the Setting sender.

    A receiver connected with weak=True (the @receiver default) whose weakref
    has died is dropped from dispatch silently — settings cache invalidation
    would just stop, which is one theory for the test_proxy_ip_allowed flake.
    Read-only: does not call _live_receivers, which would repair/repopulate
    the sender cache and destroy the evidence.
    """
    state = {'sender_id': id(Setting), 'receivers': [], 'sender_cache': '<no entry>'}
    try:
        for lookup, receiver, is_async in post_save.receivers:
            _receiverkey, senderkey = lookup
            target, dead = receiver, False
            if isinstance(target, weakref.ReferenceType):
                target = target()
                dead = target is None
            name = '<DEAD WEAKREF>' if dead else getattr(target, '__qualname__', repr(target))
            if senderkey == id(Setting) or dead or 'setting' in name.lower():
                state['receivers'].append((name, 'sender=Setting' if senderkey == id(Setting) else 'sender_id={}'.format(senderkey)))
        cached = post_save.sender_receivers_cache.get(Setting)
        if cached is not None:
            if isinstance(cached, list):
                resolved = []
                for receiver, _is_async in cached:
                    target, dead = receiver, False
                    if isinstance(target, weakref.ReferenceType):
                        target = target()
                        dead = target is None
                    resolved.append('<DEAD WEAKREF>' if dead else getattr(target, '__qualname__', repr(target)))
            else:
                resolved = repr(cached)  # the NO_RECEIVERS sentinel object
            state['sender_cache'] = resolved
    except Exception as e:  # diagnostics must never mask the real failure
        state['error'] = repr(e)
    return state


@pytest.fixture
def settings_event_log():
    """Record every computed read of the tracked settings and every settings
    cache invalidation, with thread names and timestamps. Forensics for a
    CI-only flake where a stale memoized value survives a PATCH; remove once
    the root cause is fixed."""
    log = []
    orig_get_local = SettingsWrapper._get_local
    orig_handle = awx.conf.signals.handle_setting_change

    def recording_get_local(self, name, validate=True):
        if name not in TRACKED_SETTINGS:
            return orig_get_local(self, name, validate=validate)
        try:
            result = orig_get_local(self, name, validate=validate)
        except BaseException as e:
            log.append((time.monotonic(), threading.current_thread().name, '_get_local {} raised {!r}'.format(name, e)))
            raise
        log.append((time.monotonic(), threading.current_thread().name, '_get_local {} -> {!r}'.format(name, result)))
        return result

    def recording_handle_setting_change(key, for_delete=False):
        log.append((time.monotonic(), threading.current_thread().name, 'handle_setting_change {} for_delete={}'.format(key, for_delete)))
        return orig_handle(key, for_delete)

    # Record dispatch ENTRY, not via a connected receiver: post_save.connect()
    # clears the dispatcher's sender cache, which would repair the very
    # corruption (dead weakref / poisoned cache) this exists to catch.
    orig_send = post_save.send

    def recording_post_save_send(sender, **named):
        if sender is Setting:
            instance = named.get('instance')
            log.append(
                (
                    time.monotonic(),
                    threading.current_thread().name,
                    'post_save.send Setting key={} created={}'.format(getattr(instance, 'key', '?'), named.get('created')),
                )
            )
        return orig_send(sender, **named)

    log.append((time.monotonic(), threading.current_thread().name, 'setup: post_save dispatch state {}'.format(_post_save_dispatch_state())))
    with mock.patch.object(SettingsWrapper, '_get_local', recording_get_local):
        with mock.patch.object(awx.conf.signals, 'handle_setting_change', recording_handle_setting_change):
            with mock.patch.object(post_save, 'send', recording_post_save_send):
                yield log
    if os.environ.get('SETTINGS_FLAKE_DEBUG'):
        now = time.monotonic()
        print('=== settings event log (healthy-run dump) ===')
        for stamp, thread_name, event in log:
            print('T-{:8.3f}s [{}] {}'.format(now - stamp, thread_name, event))


def assert_setting_applied(response, key, value, event_log):
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
            'post_save_dispatch': _post_save_dispatch_state(),
            'setting_rows': list(Setting.objects.values_list('pk', 'key')[:50]),
        }
        settings._awx_conf_memoizedcache.clear()
        diagnostics['retry_after_memoized_clear'] = getattr(settings, key)
        # pytest truncates long assert messages; captured stdout is shown whole
        print('=== settings flake diagnostics ===')
        for item, val in diagnostics.items():
            print('{}: {!r}'.format(item, val))
        now = time.monotonic()
        for stamp, thread_name, event in event_log:
            print('T-{:8.3f}s [{}] {}'.format(now - stamp, thread_name, event))
        assert first_read == value, diagnostics


@pytest.mark.django_db
def test_proxy_ip_allowed(get, patch, admin, settings_event_log):
    url = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system'})
    headers = ['HTTP_X_FROM_THE_LOAD_BALANCER', 'REMOTE_ADDR', 'REMOTE_HOST']
    r = patch(url, user=admin, data={'REMOTE_HOST_HEADERS': headers}, expect=200)
    assert_setting_applied(r, 'REMOTE_HOST_HEADERS', headers, settings_event_log)

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
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['10.0.1.100'], settings_event_log)
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, REMOTE_ADDR='8.9.10.11', HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert 'HTTP_X_FROM_THE_LOAD_BALANCER' not in middleware.environ

    # If 8.9.10.11 is added to `PROXY_IP_ALLOWED_LIST` the
    # `HTTP_X_FROM_THE_LOAD_BALANCER` header should be passed through again
    r = patch(url, user=admin, data={'PROXY_IP_ALLOWED_LIST': ['10.0.1.100', '8.9.10.11']}, expect=200)
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['10.0.1.100', '8.9.10.11'], settings_event_log)
    middleware = HeaderTrackingMiddleware()
    get(url, user=admin, middleware=middleware, REMOTE_ADDR='8.9.10.11', HTTP_X_FROM_THE_LOAD_BALANCER='some-actual-ip')
    assert middleware.environ['HTTP_X_FROM_THE_LOAD_BALANCER'] == 'some-actual-ip'

    # Allow allowed list of proxy hostnames in addition to IP addresses
    r = patch(url, user=admin, data={'PROXY_IP_ALLOWED_LIST': ['my.proxy.example.org']}, expect=200)
    assert_setting_applied(r, 'PROXY_IP_ALLOWED_LIST', ['my.proxy.example.org'], settings_event_log)
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
