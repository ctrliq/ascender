"""
A whole Entra ID login through the real URLs, views and pipeline, with
Microsoft played by a fake HTTP layer: the browser is sent to the authorize
endpoint, comes back with a code, the code is traded for a signed ID token, the
groups are read from Graph, and the user ends up logged in with their roles.
Generic OIDC and the legacy Azure AD login go through the same way, to catch
the shared steps breaking for them.
"""

import json
import time
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
import requests
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import Client

from ascender.main.middleware import MigrationRanCheckMiddleware, SettingsCacheMiddleware, URLModificationMiddleware
from ascender.main.models import Organization, Team, User

TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47'
CLIENT_ID = '11111111-2222-3333-4444-555555555555'
AUTHORITY = 'https://login.microsoftonline.com/{}'.format(TENANT)
ISSUER = AUTHORITY + '/v2.0'
OIDC_ISSUER = 'https://idp.example.com'
LEGACY_AUTHORITY = 'https://login.microsoftonline.com/common'
LEGACY_CLIENT_ID = 'legacy-client'

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
JWK = dict(json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(PRIVATE_KEY.public_key())), kid='key-1', use='sig', alg='RS256')

ADMINS = {'groups': {'has_or': ['ascender-admins']}}

GRAPH_FIRST_PAGE = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$count=true&$select=id&$top=999'


def signed(claims, issuer, audience):
    now = int(time.time())
    body = {'iss': issuer, 'aud': audience, 'iat': now, 'nbf': now, 'exp': now + 600}
    body.update(claims)
    return jwt.encode(body, PRIVATE_KEY, algorithm='RS256', headers={'kid': 'key-1'})


class FakeMicrosoft:
    """Answers the requests social auth makes, and remembers them."""

    def __init__(self, id_token_claims, graph_pages=None, oidc_claims=None, legacy_claims=None):
        self.id_token_claims = id_token_claims
        self.legacy_claims = legacy_claims or {}
        self.graph_pages = graph_pages or {}
        self.oidc_claims = oidc_claims or {}
        self.requests = []
        self.nonce = None

    def respond(self, status, body):
        response = requests.models.Response()
        response.status_code = status
        response._content = json.dumps(body).encode()
        response.headers['Content-Type'] = 'application/json'
        response.url = 'https://fake'
        return response

    def __call__(self, method, url, headers=None, data=None, params=None, **kwargs):
        self.requests.append((method, url, dict(headers or {}), dict(data or {})))
        path = urlsplit(url)._replace(query='').geturl()
        if path == ISSUER + '/.well-known/openid-configuration':
            return self.respond(
                200,
                {
                    'issuer': ISSUER,
                    'jwks_uri': AUTHORITY + '/discovery/v2.0/keys',
                    'end_session_endpoint': AUTHORITY + '/oauth2/v2.0/logout',
                },
            )
        if path == AUTHORITY + '/discovery/v2.0/keys':
            return self.respond(200, {'keys': [JWK]})
        if path == AUTHORITY + '/oauth2/v2.0/token':
            assert data['code'] == 'the-code'
            assert data['client_id'] == CLIENT_ID
            return self.respond(
                200,
                {
                    'token_type': 'Bearer',
                    'scope': 'openid profile email',
                    'expires_in': 3600,
                    'ext_expires_in': 3600,
                    'access_token': 'graph-access-token',
                    'id_token': signed(dict({'tid': TENANT}, **self.id_token_claims), ISSUER, CLIENT_ID),
                },
            )
        if url in self.graph_pages:
            assert headers['Authorization'] == 'Bearer graph-access-token'
            assert headers['ConsistencyLevel'] == 'eventual'
            return self.respond(200, self.graph_pages[url])
        # The legacy Azure AD logins, on the v1 endpoints of every tenant or of ours.
        for legacy in (LEGACY_AUTHORITY, AUTHORITY):
            if path == legacy + '/.well-known/openid-configuration':
                issuer = 'https://sts.windows.net/{}/'.format('{tenantid}' if legacy == LEGACY_AUTHORITY else TENANT)
                return self.respond(200, {'issuer': issuer, 'jwks_uri': legacy + '/discovery/keys'})
            if path == legacy + '/discovery/keys':
                return self.respond(200, {'keys': [JWK]})
        if path in (LEGACY_AUTHORITY + '/oauth2/token', AUTHORITY + '/oauth2/token'):
            assert data['client_id'] == LEGACY_CLIENT_ID
            claims = dict({'tid': TENANT, 'sub': 'pairwise-subject'}, **self.legacy_claims)
            id_token = signed(claims, 'https://sts.windows.net/{}/'.format(claims['tid']), LEGACY_CLIENT_ID)
            return self.respond(200, {'token_type': 'Bearer', 'access_token': 'legacy-access-token', 'id_token': id_token})
        # Generic OIDC.
        if path == OIDC_ISSUER + '/.well-known/openid-configuration':
            return self.respond(
                200,
                {
                    'issuer': OIDC_ISSUER,
                    'authorization_endpoint': OIDC_ISSUER + '/authorize',
                    'token_endpoint': OIDC_ISSUER + '/token',
                    'userinfo_endpoint': OIDC_ISSUER + '/userinfo',
                    'jwks_uri': OIDC_ISSUER + '/jwks',
                    'end_session_endpoint': OIDC_ISSUER + '/logout',
                },
            )
        if path == OIDC_ISSUER + '/jwks':
            return self.respond(200, {'keys': [JWK]})
        if path == OIDC_ISSUER + '/token':
            claims = dict({'sub': 'oidc-sub', 'nonce': self.nonce, 'at_hash': None}, **self.oidc_claims)
            claims.pop('at_hash')
            return self.respond(200, {'token_type': 'Bearer', 'access_token': 'oidc-access-token', 'id_token': signed(claims, OIDC_ISSUER, 'ascender-client')})
        if path == OIDC_ISSUER + '/userinfo':
            return self.respond(200, dict({'sub': 'oidc-sub'}, **self.oidc_claims))
        raise AssertionError('unexpected request {} {}'.format(method, url))


@pytest.fixture(scope='module', autouse=True)
def named_url_settings(django_db_setup, django_db_blocker):
    # The test client builds the middleware chain, which registers the named url
    # settings and fills them in. Inside the settings fixture those values are
    # dropped when the test ends while the registration stays, and any later
    # test that reads them finds nothing. Building it once out here first keeps
    # them.
    with django_db_blocker.unblock():
        URLModificationMiddleware(lambda request: None)


@pytest.fixture
def entra(settings, monkeypatch):
    # The settings fixture swaps in a holder without the conf layer's memoized
    # cache, which this middleware clears on every request.
    monkeypatch.setattr(SettingsCacheMiddleware, 'process_request', lambda self, request: None)
    # And the test database is not migrated the way this check looks for.
    monkeypatch.setattr(MigrationRanCheckMiddleware, 'process_request', lambda self, request: None)
    settings.AUTHENTICATION_BACKENDS = [
        'ascender.sso.entra.EntraIDOAuth2',
        'social_core.backends.open_id_connect.OpenIdConnectAuth',
        'social_core.backends.azuread.AzureADOAuth2',
        'ascender.main.backends.AWXModelBackend',
    ]
    settings.SOCIAL_AUTH_ENTRA_ID_KEY = CLIENT_ID
    settings.SOCIAL_AUTH_ENTRA_ID_SECRET = 'client-secret'
    settings.SOCIAL_AUTH_ENTRA_ID_TENANT_ID = TENANT
    settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = 'login.microsoftonline.com'
    settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY = 'preferred_username'
    settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN = True
    settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM = 'groups'
    settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = False
    settings.SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST = ''
    settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_or': ['ascender-users', 'ascender-admins']}}
    settings.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = {
        'Default': {'triggers_admins': ADMINS, 'triggers_users': {'groups': {'has_or': ['ascender-users', 'ascender-admins']}}}
    }
    settings.SOCIAL_AUTH_ENTRA_ID_TEAM_MAP = {'Operators': {'organization': 'Default', 'triggers': {'groups': {'has_or': ['ascender-operators']}}}}
    settings.SOCIAL_AUTH_ENTRA_ID_USER_FLAGS = {'triggers_system_auditor': {'groups': {'has_or': ['ascender-auditors']}}}
    settings.SOCIAL_AUTH_RAISE_EXCEPTIONS = True
    return settings


def legacy_azure_ad_account(username, upn, provider='azuread-oauth2', **id_token_claims):
    """An account of the legacy Azure AD login, with the ID token it keeps from its last login."""
    user = User.objects.create(username=username, email=upn)
    extra_data = {}
    if id_token_claims:
        # Long expired, as a kept token always is by the time anyone moves over.
        claims = dict({'upn': upn, 'exp': int(time.time()) - 86400 * 365}, **id_token_claims)
        extra_data['id_token'] = jwt.encode(claims, 'legacy-key-that-nobody-checks-at-all', algorithm='HS256')
    user.social_auth.create(provider=provider, uid=upn, extra_data=extra_data)
    return user


def log_in(backend, fake, nonce_from_authorize=False):
    """Run the browser's side of a login and hand back the client and where the callback sent it."""
    client = Client()
    response = client.post('/sso/login/{}/'.format(backend))
    assert response.status_code == 302, response
    authorize = urlsplit(response['Location'])
    query = parse_qs(authorize.query)
    if nonce_from_authorize:
        fake.nonce = query['nonce'][0]
    with mock.patch('social_core.backends.base.requests.request', side_effect=fake):
        callback = client.get('/sso/complete/{}/'.format(backend), {'code': 'the-code', 'state': query['state'][0]})
    return client, authorize, query, callback


def logged_in_user(client):
    user_id = client.session.get('_auth_user_id')
    return User.objects.get(pk=user_id) if user_id else None


@pytest.mark.django_db
class TestEntraLogin:
    def test_the_browser_goes_to_the_tenant_v2_authorize_endpoint(self, entra):
        client = Client()
        response = client.post('/sso/login/entra-id/')
        url = urlsplit(response['Location'])
        query = parse_qs(url.query)
        assert '{}://{}{}'.format(url.scheme, url.netloc, url.path) == AUTHORITY + '/oauth2/v2.0/authorize'
        assert query['client_id'] == [CLIENT_ID]
        assert query['scope'] == ['openid profile email']
        assert query['redirect_uri'][0].endswith('/sso/complete/entra-id/')
        assert query['state']

    def test_a_whole_login(self, entra):
        fake = FakeMicrosoft(
            {
                'oid': 'aaaaaaaa-0000-0000-0000-000000000001',
                'preferred_username': 'fernando.roca@contoso.com',
                'name': 'Fernando Roca',
                'given_name': 'Fernando',
                'family_name': 'Roca',
                'groups': ['ascender-users', 'ascender-operators', 'ascender-auditors'],
            }
        )
        client, _, _, callback = log_in('entra-id', fake)
        assert callback.status_code == 302
        assert callback['Location'] == '/sso/complete/'

        user = logged_in_user(client)
        assert user.username == 'fernando.roca'
        assert user.email == 'fernando.roca@contoso.com'
        assert (user.first_name, user.last_name) == ('Fernando', 'Roca')
        assert user.social_auth.get().uid == 'aaaaaaaa-0000-0000-0000-000000000001'
        org = Organization.objects.get(name='Default')
        assert user in org.member_role
        assert user not in org.admin_role
        assert user in Team.objects.get(name='Operators').member_role
        assert user.is_system_auditor
        assert not user.is_superuser
        assert client.session['social_auth_last_login_backend'] == 'entra-id'

        # The secret went to the token endpoint, and nothing went to Graph.
        token_request = next(r for r in fake.requests if r[1].endswith('/oauth2/v2.0/token'))
        assert token_request[3]['client_secret'] == 'client-secret'
        assert not any('graph.microsoft.com' in r[1] for r in fake.requests)

    def test_a_renamed_user_keeps_their_account(self, entra):
        claims = {'oid': 'oid-1', 'preferred_username': 'fernando.roca@contoso.com', 'groups': ['ascender-users']}
        first, _, _, _ = log_in('entra-id', FakeMicrosoft(claims))
        renamed, _, _, _ = log_in('entra-id', FakeMicrosoft(dict(claims, preferred_username='f.roca@contoso.com')))
        assert logged_in_user(first) == logged_in_user(renamed)

    def test_a_reused_upn_does_not_open_the_old_account(self, entra):
        claims = {'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}
        old, _, _, _ = log_in('entra-id', FakeMicrosoft(dict(claims, oid='oid-old')))
        new, _, _, _ = log_in('entra-id', FakeMicrosoft(dict(claims, oid='oid-new')))
        assert logged_in_user(old) != logged_in_user(new)
        assert logged_in_user(old).social_auth.get().uid == 'oid-old'

    def test_a_reused_address_does_not_open_the_old_account(self, entra):
        # The same email claim too, which is what linking by email goes by.
        claims = {'preferred_username': 'jane@contoso.com', 'email': 'jane@contoso.com', 'groups': ['ascender-users', 'ascender-admins']}
        old, _, _, _ = log_in('entra-id', FakeMicrosoft(dict(claims, oid='oid-old')))
        new, _, _, _ = log_in('entra-id', FakeMicrosoft(dict(claims, oid='oid-new', groups=['ascender-users'])))
        old_user, new_user = logged_in_user(old), logged_in_user(new)
        assert old_user != new_user
        assert new_user.social_auth.get().uid == 'oid-new'
        assert new_user not in Organization.objects.get(name='Default').admin_role

    def test_a_legacy_azure_ad_account_of_the_same_person_is_taken_over(self, entra):
        existing = legacy_azure_ad_account('jane', 'jane@contoso.com', oid='oid-jane', tid=TENANT)
        client, _, _, _ = log_in('entra-id', FakeMicrosoft({'oid': 'oid-jane', 'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}))
        assert logged_in_user(client) == existing
        assert existing.social_auth.get(provider='entra-id').uid == 'oid-jane'

    @pytest.mark.parametrize('same_person', [True, False])
    @pytest.mark.parametrize('legacy_backend, legacy_uid', [('azuread-oauth2', 'jane@contoso.com'), ('azuread-tenant-oauth2', 'pairwise-subject')])
    def test_moving_over_from_a_real_legacy_login(self, entra, legacy_backend, legacy_uid, same_person):
        # What the legacy login keeps of its ID token is what tells who it was.
        prefix = 'SOCIAL_AUTH_{}_'.format(legacy_backend.upper().replace('-', '_'))
        setattr(entra, prefix + 'KEY', LEGACY_CLIENT_ID)
        setattr(entra, prefix + 'SECRET', 'legacy-secret')
        setattr(entra, prefix + 'TENANT_ID', TENANT)
        entra.AUTHENTICATION_BACKENDS = entra.AUTHENTICATION_BACKENDS + ['social_core.backends.azuread_tenant.AzureADTenantOAuth2']
        legacy_claims = {'oid': 'oid-jane', 'upn': 'jane@contoso.com', 'name': 'Jane Doe'}
        legacy, _, _, callback = log_in(legacy_backend, FakeMicrosoft({}, legacy_claims=legacy_claims))
        assert callback['Location'] == '/sso/complete/'
        old_account = logged_in_user(legacy)
        assert old_account.social_auth.get().uid == legacy_uid

        oid = 'oid-jane' if same_person else 'oid-new-jane'
        client, _, _, _ = log_in('entra-id', FakeMicrosoft({'oid': oid, 'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}))
        assert (logged_in_user(client) == old_account) is same_person

    def test_both_legacy_logins_of_the_same_person(self, entra):
        existing = legacy_azure_ad_account('jane', 'jane@contoso.com', oid='oid-jane', tid=TENANT)
        existing.social_auth.create(provider='azuread-tenant-oauth2', uid='pairwise-subject', extra_data=existing.social_auth.get().extra_data)
        client, _, _, _ = log_in('entra-id', FakeMicrosoft({'oid': 'oid-jane', 'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}))
        assert logged_in_user(client) == existing

    @pytest.mark.parametrize(
        'kept',
        [
            # The UPN went to someone else after its owner used the legacy login.
            {'oid': 'oid-old', 'tid': TENANT},
            # The same object ID in another directory is not the same person.
            {'oid': 'oid-new', 'tid': '9188040d-6c67-4c5b-b112-36a304b66dad'},
            # Nothing to tell who it was.
            {'oid': 'oid-new'},
            {},
        ],
    )
    def test_a_legacy_azure_ad_account_of_someone_else_is_not_opened(self, entra, kept):
        existing = legacy_azure_ad_account('jane', 'jane@contoso.com', **kept)
        Organization.objects.get_or_create(name='Default')[0].admin_role.members.add(existing)
        claims = {'oid': 'oid-new', 'preferred_username': 'jane@contoso.com', 'email': 'jane@contoso.com', 'groups': ['ascender-users']}
        client, _, _, _ = log_in('entra-id', FakeMicrosoft(claims))
        newcomer = logged_in_user(client)
        assert newcomer != existing
        assert newcomer.social_auth.get().uid == 'oid-new'
        assert newcomer not in Organization.objects.get(name='Default').admin_role
        assert not existing.social_auth.filter(provider='entra-id').exists()

    def test_a_legacy_account_that_already_has_an_entra_id_user_is_not_taken_twice(self, entra):
        existing = legacy_azure_ad_account('jane', 'jane@contoso.com', oid='oid-jane', tid=TENANT)
        existing.social_auth.create(provider='entra-id', uid='oid-other')
        client, _, _, _ = log_in('entra-id', FakeMicrosoft({'oid': 'oid-jane', 'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}))
        assert logged_in_user(client) != existing

    def test_an_address_does_not_open_a_local_account(self, entra):
        # Entra does not verify the email claim, so whoever can set a user's
        # mail attribute could otherwise walk into any local account.
        boss = User.objects.create(username='localboss', email='boss@contoso.com', is_superuser=True)
        claims = {'oid': 'oid-intruder', 'preferred_username': 'intruder@contoso.com', 'email': 'boss@contoso.com', 'groups': ['ascender-users']}
        client, _, _, _ = log_in('entra-id', FakeMicrosoft(claims))
        intruder = logged_in_user(client)
        assert intruder != boss
        assert not intruder.is_superuser
        assert not boss.social_auth.exists()

    def test_nor_does_a_upn(self, entra):
        local = User.objects.create(username='jane', email='jane@contoso.com')
        client, _, _, _ = log_in('entra-id', FakeMicrosoft({'oid': 'oid-jane', 'preferred_username': 'jane@contoso.com', 'groups': ['ascender-users']}))
        assert logged_in_user(client) != local

    def test_other_logins_still_link_by_email(self, entra):
        existing = User.objects.create(username='someone', email='someone@example.com')
        fake = FakeMicrosoft({}, oidc_claims={'email': 'someone@example.com', 'preferred_username': 'someone-else'})
        entra.SOCIAL_AUTH_OIDC_KEY = 'ascender-client'
        entra.SOCIAL_AUTH_OIDC_SECRET = 'oidc-secret'
        entra.SOCIAL_AUTH_OIDC_OIDC_ENDPOINT = OIDC_ISSUER
        with mock.patch('social_core.backends.base.requests.request', side_effect=fake):
            client, _, _, _ = log_in('oidc', fake, nonce_from_authorize=True)
        assert logged_in_user(client) == existing

    def test_the_login_rule_turns_away_before_an_account_exists(self, entra):
        fake = FakeMicrosoft({'oid': 'oid-x', 'preferred_username': 'mallory@contoso.com', 'groups': ['contractors']})
        client = Client()
        response = client.post('/sso/login/entra-id/')
        state = parse_qs(urlsplit(response['Location']).query)['state'][0]
        with mock.patch('social_core.backends.base.requests.request', side_effect=fake):
            from social_core.exceptions import AuthForbidden

            with pytest.raises(AuthForbidden):
                client.get('/sso/complete/entra-id/', {'code': 'the-code', 'state': state})
        assert not User.objects.filter(username__startswith='mallory').exists()

    def test_groups_from_graph(self, entra):
        entra.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = True
        entra.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_or': ['admins-id']}}
        entra.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = {'Default': {'triggers_admins': {'groups': {'has_or': ['admins-id']}}}}
        first = GRAPH_FIRST_PAGE
        second = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$skiptoken=X'
        many = [{'id': 'g{}'.format(i), 'displayName': 'other-{}'.format(i)} for i in range(250)]
        fake = FakeMicrosoft(
            # A token whose groups did not fit.
            {'oid': 'oid-g', 'preferred_username': 'admin@contoso.com', '_claim_names': {'groups': 'src1'}, '_claim_sources': {'src1': {'endpoint': 'x'}}},
            graph_pages={
                first: {'value': many, '@odata.nextLink': second},
                second: {'value': [{'id': 'admins-id', 'displayName': 'ascender-admins'}]},
            },
        )
        client, _, query, callback = log_in('entra-id', fake)
        assert query['scope'] == ['openid profile email https://graph.microsoft.com/GroupMember.Read.All']
        assert callback['Location'] == '/sso/complete/'
        user = logged_in_user(client)
        assert user in Organization.objects.get(name='Default').admin_role

    def test_a_graph_group_named_like_the_admins_grants_nothing(self, entra):
        # One a user created and joined themselves, which tenants allow by default.
        entra.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = True
        entra.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {}
        entra.SOCIAL_AUTH_ENTRA_ID_USER_FLAGS = {'triggers_superuser': ADMINS}
        fake = FakeMicrosoft(
            {'oid': 'oid-eve', 'preferred_username': 'eve@contoso.com'},
            graph_pages={GRAPH_FIRST_PAGE: {'value': [{'id': '00000000-dead-beef-0000-000000000000', 'displayName': 'ascender-admins'}]}},
        )
        client, _, _, callback = log_in('entra-id', fake)
        assert callback['Location'] == '/sso/complete/'
        eve = logged_in_user(client)
        assert not eve.is_superuser
        assert not Organization.objects.filter(name='Default', admin_role__members=eve).exists()

    def test_logout_ends_the_microsoft_session(self, entra):
        entra.SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP = True
        entra.ASCENDER_URL_BASE = 'https://ascender.example.com'
        fake = FakeMicrosoft({'oid': 'oid-l', 'preferred_username': 'bye@contoso.com', 'groups': ['ascender-users']})
        client, _, _, _ = log_in('entra-id', fake)
        with mock.patch('social_core.backends.base.requests.request', side_effect=fake):
            response = client.post('/api/logout/', HTTP_ACCEPT='application/json')
        url = urlsplit(response.json()['logout_url'])
        assert '{}://{}{}'.format(url.scheme, url.netloc, url.path) == AUTHORITY + '/oauth2/v2.0/logout'
        assert parse_qs(url.query)['post_logout_redirect_uri'] == ['https://ascender.example.com/']
        assert client.session.get('_auth_user_id') is None


@pytest.mark.django_db
class TestOtherLoginsStillWork:
    def test_generic_oidc(self, entra):
        entra.SOCIAL_AUTH_OIDC_KEY = 'ascender-client'
        entra.SOCIAL_AUTH_OIDC_SECRET = 'oidc-secret'
        entra.SOCIAL_AUTH_OIDC_OIDC_ENDPOINT = OIDC_ISSUER
        entra.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = ADMINS
        entra.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {'Default': {'triggers_admins': ADMINS}}
        fake = FakeMicrosoft({}, oidc_claims={'preferred_username': 'kc-admin', 'email': 'kc@example.com', 'groups': ['ascender-admins']})
        with mock.patch('social_core.backends.base.requests.request', side_effect=fake):
            client, _, _, callback = log_in('oidc', fake, nonce_from_authorize=True)
        assert callback['Location'] == '/sso/complete/'
        user = logged_in_user(client)
        assert user.username == 'kc-admin'
        assert user in Organization.objects.get(name='Default').admin_role

    def test_legacy_azure_ad_still_uses_its_own_v1_endpoints(self, entra):
        entra.SOCIAL_AUTH_AZUREAD_OAUTH2_KEY = 'legacy-client'
        entra.SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET = 'legacy-secret'
        response = Client().post('/sso/login/azuread-oauth2/')
        url = urlsplit(response['Location'])
        assert '{}://{}{}'.format(url.scheme, url.netloc, url.path) == 'https://login.microsoftonline.com/common/oauth2/authorize'
        assert parse_qs(url.query)['client_id'] == ['legacy-client']
        assert parse_qs(url.query)['redirect_uri'][0].endswith('/sso/complete/azuread-oauth2/')

    def test_the_auth_endpoint_lists_entra_id(self, entra):
        response = Client().get('/api/v2/auth/')
        assert response.status_code == 200
        assert response.json()['entra-id']['login_url'] == '/sso/login/entra-id/'
