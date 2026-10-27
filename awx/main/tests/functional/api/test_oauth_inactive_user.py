import base64
import hashlib
import json
import urllib.parse

import pytest
from asgiref.sync import async_to_sync

from django.conf import settings
from django.utils.encoding import smart_bytes, smart_str

from awx.api.versioning import drf_reverse, reverse
from awx.dab.lib.channels import middleware as channels_middleware
from awx.main.models.oauth import OAuth2AccessToken as AccessToken, OAuth2Application as Application
from awx.main.tests.functional import immediate_on_commit

ME = drf_reverse('api:user_me_list', kwargs={'version': 'v2'})
OAUTH_ROOT = drf_reverse('api:oauth_authorization_root_view')
TOKEN_URL = OAUTH_ROOT + 'token/'
REDIRECT_URI = 'https://client.example.com/callback'


@pytest.fixture
def org_app(organization):
    # Created the way the API creates one: no owning user, so tokens stay with whoever obtained them.
    return Application.objects.create(name='org app', organization=organization, client_type='confidential', authorization_grant_type='password')


def _client_auth(app, secret=None):
    return 'Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([app.client_id, secret or app.client_secret]))))


def _deactivate(user):
    user.is_active = False
    user.save()


def _reactivate(user):
    user.is_active = True
    user.save()


def _me(get, **headers):
    # OAuth2AccessToken.is_valid() records last_used in an on_commit hook.
    with immediate_on_commit():
        return get(ME, **headers)


def _token_request(post, app, data, secret=None):
    return post(TOKEN_URL, data=urllib.parse.urlencode(data), content_type='application/x-www-form-urlencoded', HTTP_AUTHORIZATION=_client_auth(app, secret))


def _issue_code(organization, user, mocker, browser):
    # Returns the application and the token-request fields for a code issued to `user`.
    mocker.patch('awx.main.middleware.is_migrating', return_value=False)
    app = Application.objects.create(
        name='code app',
        organization=organization,
        client_type='confidential',
        authorization_grant_type='authorization-code',
        redirect_uris=REDIRECT_URI,
        skip_authorization=True,
    )
    browser.force_login(user, backend='awx.main.backends.AWXModelBackend')
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
    return app, {'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT_URI, 'code_verifier': verifier}


def _password_grant(post, app, username):
    return post(
        TOKEN_URL,
        data='grant_type=password&username={0}&password={0}&scope=write'.format(username),
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION=_client_auth(app),
    )


def _refresh_grant(post, app, refresh_token):
    return post(
        TOKEN_URL,
        data='grant_type=refresh_token&refresh_token=' + refresh_token,
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION=_client_auth(app),
    )


@pytest.mark.django_db
def test_personal_token_refused_after_owner_deactivated(get, post, alice):
    resp = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'write'}, alice, expect=201)
    bearer = 'Bearer ' + resp.data['token']
    resp = _me(get, HTTP_AUTHORIZATION=bearer)
    assert resp.status_code == 200 and resp.data['results'][0]['username'] == 'alice'

    _deactivate(alice)
    resp = _me(get, HTTP_AUTHORIZATION=bearer)
    assert resp.status_code == 401, (resp.status_code, resp.data['results'][0]['username'] if resp.status_code == 200 else resp.data)


@pytest.mark.django_db
def test_application_token_refused_after_owner_deactivated(get, post, org_app, alice):
    resp = _password_grant(post, org_app, 'alice')
    assert resp.status_code == 200
    bearer = 'Bearer ' + json.loads(resp.content)['access_token']
    assert AccessToken.objects.get(application=org_app).user == alice
    assert _me(get, HTTP_AUTHORIZATION=bearer).status_code == 200

    _deactivate(alice)
    resp = _me(get, HTTP_AUTHORIZATION=bearer)
    assert resp.status_code == 401, (resp.status_code, resp.data['results'][0]['username'] if resp.status_code == 200 else resp.data)


def _assert_invalid_grant(resp):
    # The same response DOT gives a revoked token, so clients can parse it and learn nothing about the account.
    assert resp['Content-Type'] == 'application/json' and resp['Cache-Control'] == 'no-store'
    assert json.loads(resp.content) == {'error': 'invalid_grant'}


@pytest.mark.django_db
def test_refresh_grant_refused_after_owner_deactivated(get, post, org_app, alice):
    resp = _password_grant(post, org_app, 'alice')
    refresh_token = json.loads(resp.content)['refresh_token']

    _deactivate(alice)
    resp = _refresh_grant(post, org_app, refresh_token)
    minted = json.loads(resp.content).get('access_token') if resp.status_code == 200 else None
    minted_me = _me(get, HTTP_AUTHORIZATION='Bearer ' + minted) if minted else None
    assert resp.status_code == 400 and minted is None, (
        resp.status_code,
        'new access token -> /me/',
        minted_me and (minted_me.status_code, minted_me.data['results'][0]['username']),
    )
    _assert_invalid_grant(resp)


# For contrast: the other ways in already refuse an inactive user.


@pytest.mark.django_db
def test_password_grant_refused_for_inactive_user(post, org_app, alice):
    _deactivate(alice)
    resp = _password_grant(post, org_app, 'alice')
    assert resp.status_code == 400
    assert json.loads(resp.content)['error'] == 'invalid_grant'


@pytest.mark.django_db
def test_basic_auth_refused_for_inactive_user(get, alice):
    basic = 'Basic ' + smart_str(base64.b64encode(b'alice:alice'))
    assert _me(get, HTTP_AUTHORIZATION=basic).status_code == 200

    _deactivate(alice)
    assert _me(get, HTTP_AUTHORIZATION=basic).status_code == 401


@pytest.mark.django_db
def test_session_refused_for_inactive_user(alice, mocker, browser):
    # The test database is built without migrations, which this middleware reads as "still migrating".
    mocker.patch('awx.main.middleware.is_migrating', return_value=False)
    client = browser
    client.force_login(alice, backend='awx.main.backends.AWXModelBackend')
    assert 'awx.main.backends.AWXModelBackend' in settings.AUTHENTICATION_BACKENDS
    assert client.get(ME).status_code == 200

    _deactivate(alice)
    assert client.get(ME).status_code == 401


@pytest.mark.django_db
def test_authorization_code_refused_after_owner_deactivated(post, organization, alice, mocker, browser):
    # A code issued just before deactivation must not be exchangeable for its remaining lifetime.
    app, data = _issue_code(organization, alice, mocker, browser)
    _deactivate(alice)
    resp = _token_request(post, app, data)
    assert resp.status_code == 400, (resp.status_code, resp.content)
    _assert_invalid_grant(resp)
    assert not AccessToken.objects.filter(application=app).exists()


@pytest.mark.django_db
@pytest.mark.parametrize('is_active', [True, False])
@pytest.mark.parametrize('grant', ['refresh_token', 'authorization_code'])
def test_wrong_client_secret_does_not_reveal_whether_user_is_active(post, org_app, organization, alice, mocker, browser, is_active, grant):
    # Client authentication comes first, so without the client secret an inactive user's
    # refresh token or code gets the same invalid_client as an active user's.
    if grant == 'refresh_token':
        app = org_app
        data = {'grant_type': 'refresh_token', 'refresh_token': json.loads(_password_grant(post, app, 'alice').content)['refresh_token']}
    else:
        app, data = _issue_code(organization, alice, mocker, browser)
    alice.is_active = is_active
    alice.save()
    resp = _token_request(post, app, data, secret='wrong-secret')
    assert resp.status_code == 401, (resp.status_code, resp.content)
    assert json.loads(resp.content)['error'] == 'invalid_client'


@pytest.mark.django_db
def test_reactivation_restores_token_access(get, post, org_app, alice):
    # Deactivation suspends tokens rather than revoking them, the same as sessions.
    resp = _password_grant(post, org_app, 'alice')
    body = json.loads(resp.content)
    bearer = 'Bearer ' + body['access_token']

    _deactivate(alice)
    assert _me(get, HTTP_AUTHORIZATION=bearer).status_code == 401

    _reactivate(alice)
    resp = _me(get, HTTP_AUTHORIZATION=bearer)
    assert resp.status_code == 200 and resp.data['results'][0]['username'] == 'alice'
    assert _refresh_grant(post, org_app, body['refresh_token']).status_code == 200


def _websocket_scope(authorization=None):
    headers = [(b'authorization', authorization.encode())] if authorization else []
    return {'type': 'websocket', 'headers': headers}


@pytest.mark.django_db
def test_websocket_token_auth_refused_after_owner_deactivated(post, alice):
    # Websockets authenticate a token through DEFAULT_AUTHENTICATION_CLASSES, so the bearer check covers them.
    # Called directly rather than through database_sync_to_async, whose worker thread can't see this test's transaction.
    authenticate = channels_middleware._get_authenticated_user.func
    resp = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'write'}, alice, expect=201)
    scope = _websocket_scope('Bearer ' + resp.data['token'])
    with immediate_on_commit():
        assert authenticate(scope) == alice

        _deactivate(alice)
        assert authenticate(scope) is None


@pytest.mark.django_db
@pytest.mark.parametrize('active', [True, False])
def test_websocket_session_requires_active_user(alice, mocker, active):
    # ModelBackend.get_user refuses inactive users, but the LDAP, TACACS+ and social backends return them,
    # so the middleware itself has to check. Simulated by handing it the user such a backend would return.
    alice.is_active = active

    async def session_user(scope):
        return alice

    async def no_token_user(scope):
        return None

    denied = []

    class Denier:
        async def __call__(self, scope, receive, send):
            denied.append(True)

    mocker.patch.object(channels_middleware, 'get_session_user', session_user)
    mocker.patch.object(channels_middleware, '_get_authenticated_user', no_token_user)
    mocker.patch.object(channels_middleware, 'WebsocketDenier', Denier)
    accepted = []

    async def inner(scope, receive, send):
        accepted.append(scope['user'])

    async_to_sync(channels_middleware.DrfAuthMiddleware(inner))(_websocket_scope(), None, None)
    assert (accepted, denied) == (([alice], []) if active else ([], [True]))
