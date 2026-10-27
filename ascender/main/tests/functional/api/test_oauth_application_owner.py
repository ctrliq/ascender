import base64
import hashlib
import json
import urllib.parse

import pytest

from django.test import Client
from django.utils.encoding import smart_bytes, smart_str

from ascender.api.versioning import drf_reverse, reverse
from ascender.main.models.oauth import OAuth2AccessToken as AccessToken, OAuth2Application as Application
from ascender.main.tests.functional import immediate_on_commit

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
def test_authorization_code_token_belongs_to_requester(get, post, organization, owner, alice, mocker):
    mocker.patch('ascender.main.middleware.is_migrating', return_value=False)
    app = Application.objects.create(
        name='code app',
        organization=organization,
        user=owner,
        client_type='confidential',
        authorization_grant_type='authorization-code',
        redirect_uris=REDIRECT_URI,
        skip_authorization=True,
    )
    browser = Client()
    browser.force_login(alice, backend='ascender.main.backends.AWXModelBackend')
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
