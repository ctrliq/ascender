import base64
import hashlib
import importlib
import json
import urllib.parse

from datetime import timedelta

import pytest

from django.apps import apps
from django.utils.timezone import now
from django.utils.encoding import smart_bytes, smart_str
from oauth2_provider.models import RefreshToken

from awx.api.versioning import drf_reverse, reverse
from awx.main.models.oauth import OAuth2AccessToken as AccessToken, OAuth2Application as Application
from awx.main.tests.functional import immediate_on_commit

ME = drf_reverse('api:user_me_list', kwargs={'version': 'v2'})
OAUTH_ROOT = drf_reverse('api:oauth_authorization_root_view')
TOKEN_URL = OAUTH_ROOT + 'token/'
REDIRECT_URI = 'https://client.example.com/callback'

# The API can't set an application's owner (`user`), but the shell or an old database can.
# A token obtained through such an application must still belong to whoever obtained it.


@pytest.fixture
def member(alice, organization):
    organization.member_role.members.add(alice)
    return alice


@pytest.fixture(params=['owned_by_admin', 'no_owner'])
def owner(request, admin):
    return admin if request.param == 'owned_by_admin' else None


@pytest.fixture
def app(organization, owner):
    return Application.objects.create(name='app', organization=organization, user=owner, client_type='confidential', authorization_grant_type='password')


def _client_auth(app):
    return 'Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([app.client_id, app.client_secret]))))


def _as(get, token, url=ME):
    # OAuth2AccessToken.is_valid() records last_used in an on_commit hook, which saves the token.
    with immediate_on_commit():
        return get(url, HTTP_AUTHORIZATION='Bearer ' + token)


def _whoami(get, token):
    resp = _as(get, token)
    assert resp.status_code == 200, resp.status_code
    return resp.data['results'][0]['username']


def _assert_acts_as_alice(get, token):
    # Twice: the second request runs after the first one's last_used save.
    assert [_whoami(get, token), _whoami(get, token)] == ['alice', 'alice']
    assert AccessToken.objects.get(token=token).user.username == 'alice'
    settings_url = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'system'})
    assert _as(get, token, settings_url).status_code == 403


def _grant(post, app, body):
    return post(TOKEN_URL, data=body, content_type='application/x-www-form-urlencoded', HTTP_AUTHORIZATION=_client_auth(app))


@pytest.mark.django_db
def test_password_grant_token_belongs_to_requester(get, post, app, alice):
    resp = _grant(post, app, 'grant_type=password&username=alice&password=alice&scope=write')
    assert resp.status_code == 200, resp.content
    _assert_acts_as_alice(get, json.loads(resp.content)['access_token'])


@pytest.mark.django_db
def test_refresh_grant_token_belongs_to_requester(get, post, app, alice):
    resp = _grant(post, app, 'grant_type=password&username=alice&password=alice&scope=write')
    refresh = json.loads(resp.content)['refresh_token']
    resp = _grant(post, app, 'grant_type=refresh_token&refresh_token=' + refresh)
    assert resp.status_code == 200, resp.content
    _assert_acts_as_alice(get, json.loads(resp.content)['access_token'])


@pytest.mark.django_db
@pytest.mark.parametrize('endpoint', ['user_authorized_token_list', 'o_auth2_token_list', 'o_auth2_application_token_list', 'tokens_root'])
def test_api_token_belongs_to_requester(get, post, app, member, endpoint):
    if endpoint == 'tokens_root':
        url, data = reverse('api:o_auth2_token_list'), {'application': app.pk, 'scope': 'write'}
    elif endpoint == 'o_auth2_application_token_list':
        url, data = reverse('api:o_auth2_application_token_list', kwargs={'pk': app.pk}), {'scope': 'write'}
    else:
        url, data = reverse('api:' + endpoint, kwargs={'pk': member.pk}), {'application': app.pk, 'scope': 'write'}
    resp = post(url, data, member, expect=201)
    assert resp.data['user'] == member.pk
    _assert_acts_as_alice(get, resp.data['token'])


@pytest.mark.django_db
def test_authorization_code_token_belongs_to_requester(get, post, organization, owner, alice, mocker, browser):
    mocker.patch('awx.main.middleware.is_migrating', return_value=False)
    app = Application.objects.create(
        name='code app',
        organization=organization,
        user=owner,
        client_type='confidential',
        authorization_grant_type='authorization-code',
        redirect_uris=REDIRECT_URI,
        skip_authorization=True,
    )
    browser.force_login(alice, backend='awx.main.backends.AWXModelBackend')
    verifier = 'v' * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    query = urllib.parse.urlencode(
        {
            'response_type': 'code',
            'client_id': app.client_id,
            'redirect_uri': REDIRECT_URI,
            'scope': 'write',
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
        }
    )
    resp = browser.get(OAUTH_ROOT + 'authorize/?' + query)
    assert resp.status_code == 302 and resp['Location'].startswith(REDIRECT_URI), (resp.status_code, resp.get('Location'))
    code = urllib.parse.parse_qs(urllib.parse.urlparse(resp['Location']).query)['code'][0]

    resp = _grant(
        post, app, urllib.parse.urlencode({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT_URI, 'code_verifier': verifier})
    )
    assert resp.status_code == 200, resp.content
    _assert_acts_as_alice(get, json.loads(resp.content)['access_token'])


@pytest.mark.django_db
def test_existing_token_keeps_its_user_when_application_gains_owner(get, post, organization, admin, alice):
    app = Application.objects.create(name='app', organization=organization, client_type='confidential', authorization_grant_type='password')
    resp = _grant(post, app, 'grant_type=password&username=alice&password=alice&scope=write')
    token = json.loads(resp.content)['access_token']
    assert _whoami(get, token) == 'alice'

    Application.objects.filter(pk=app.pk).update(user=admin)
    _assert_acts_as_alice(get, token)


@pytest.mark.django_db
def test_client_credentials_grant_refused(post, app):
    resp = _grant(post, app, 'grant_type=client_credentials&scope=write')
    assert resp.status_code == 400 and json.loads(resp.content)['error'] == 'unauthorized_client', resp.content
    assert not AccessToken.objects.filter(application=app).exists()


def _historical_apps(settings):
    # The models as `migrate` hands them to the migration, not the live ones. The test
    # database is built with --nomigrations, which hides the migration graph from the loader.
    from django.db.migrations.loader import MigrationLoader

    settings.MIGRATION_MODULES = {}
    return MigrationLoader(None).project_state(('main', '0213_v25_6_backfill_finished_on_terminal_jobs')).apps


def _run_upgrade(registry, settings):
    migration = importlib.import_module('awx.main.migrations.0214_v25_6_revoke_owner_rewritten_oauth2_tokens')
    migration.revoke_owner_rewritten_tokens(_historical_apps(settings) if registry == 'historical' else apps, None)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('registry', ['historical', 'live'])
def test_upgrade_revokes_tokens_already_given_to_the_owner(get, post, organization, admin, alice, registry, settings):
    # The state the removed receiver left behind: alice obtained the token, it was rewritten to the owner,
    # and its refresh token still names alice.
    owned = Application.objects.create(name='owned', organization=organization, user=admin, client_type='confidential', authorization_grant_type='password')
    swapped = AccessToken.objects.create(user=admin, application=owned, token='swapped', expires=now() + timedelta(days=1), scope='write')
    RefreshToken.objects.create(user=alice, application=owned, token='alice-refresh', access_token=swapped)
    assert _whoami(get, 'swapped') == 'admin'
    # Untouched: a token from an application without an owner, and a personal token.
    unowned = Application.objects.create(name='unowned', organization=organization, client_type='confidential', authorization_grant_type='password')
    resp = _grant(post, unowned, 'grant_type=password&username=alice&password=alice&scope=write')
    unowned_token = json.loads(resp.content)['access_token']
    personal = AccessToken.objects.create(user=admin, token='personal', expires=now() + timedelta(days=1), scope='write')

    _run_upgrade(registry, settings)

    assert _as(get, 'swapped').status_code == 401
    assert not AccessToken.objects.filter(application=owned).exists()
    assert RefreshToken.objects.get(token='alice-refresh').revoked is not None
    resp = _grant(post, owned, 'grant_type=refresh_token&refresh_token=alice-refresh')
    assert resp.status_code == 400 and 'access_token' not in json.loads(resp.content)
    assert _whoami(get, unowned_token) == 'alice'
    assert _whoami(get, personal.token) == 'admin'
    assert RefreshToken.objects.get(application=unowned).revoked is None


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('registry', ['historical', 'live'])
def test_upgrade_revokes_rewritten_tokens_of_a_formerly_owned_application(get, post, organization, admin, alice, registry, settings):
    # The owner was cleared after the receiver had rewritten alice's token, as the
    # update(user=None) workaround does, so only the refresh token still names alice.
    formerly_owned = Application.objects.create(
        name='formerly owned', organization=organization, user=admin, client_type='confidential', authorization_grant_type='password'
    )
    swapped = AccessToken.objects.create(user=admin, application=formerly_owned, token='swapped', expires=now() + timedelta(days=1), scope='write')
    RefreshToken.objects.create(user=alice, application=formerly_owned, token='alice-refresh', access_token=swapped)
    Application.objects.filter(pk=formerly_owned.pk).update(user=None)
    assert _whoami(get, 'swapped') == 'admin'
    # alice's token issued after the owner was cleared is hers on both sides and stays.
    resp = _grant(post, formerly_owned, 'grant_type=password&username=alice&password=alice&scope=write')
    kept = json.loads(resp.content)['access_token']

    _run_upgrade(registry, settings)

    assert _as(get, 'swapped').status_code == 401
    assert RefreshToken.objects.get(token='alice-refresh').revoked is not None
    assert _whoami(get, kept) == 'alice'
    assert AccessToken.objects.get(token=kept).refresh_token.revoked is None
