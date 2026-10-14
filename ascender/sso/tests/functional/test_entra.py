import json
import time
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.sessions.middleware import SessionMiddleware
from django.test.utils import override_settings
from social_core.exceptions import AuthForbidden, AuthMissingParameter, AuthTokenError
from social_django.models import UserSocialAuth
from social_django.utils import load_strategy

from ascender.api.generics import LoggedLogoutView
from ascender.main.models import Organization, Team, User
from ascender.sso.entra import EntraIDOAuth2
from ascender.sso.fields import AuthenticationBackendsField
from ascender.sso.oidc import check_login_allowed, strip_username_domain, update_user_flags
from ascender.sso.social_pipeline import update_user_org_team_mappings

TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47'
OTHER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'
CLIENT_ID = '11111111-2222-3333-4444-555555555555'
ENTRA_BACKEND = 'ascender.sso.entra.EntraIDOAuth2'

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
JWK = dict(json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(PRIVATE_KEY.public_key())), kid='key-1', use='sig')

GROUP_RULE = {'groups': {'has_or': ['ascender-admins']}}


def openid_configuration(host='login.microsoftonline.com'):
    # What Entra publishes for a single tenant: the issuer names the tenant.
    return {
        'issuer': 'https://{}/{}/v2.0'.format(host, TENANT),
        'jwks_uri': 'https://{}/{}/discovery/v2.0/keys'.format(host, TENANT),
        'end_session_endpoint': 'https://{}/{}/oauth2/v2.0/logout'.format(host, TENANT),
    }


def id_token(**claims):
    now = int(time.time())
    body = {
        'aud': CLIENT_ID,
        'iss': 'https://login.microsoftonline.com/{}/v2.0'.format(TENANT),
        'tid': TENANT,
        'iat': now,
        'nbf': now,
        'exp': now + 3600,
        'oid': 'aaaaaaaa-0000-0000-0000-000000000001',
        'sub': 'pairwise-subject',
        'preferred_username': 'fernando.roca@contoso.com',
        'name': 'Fernando Roca',
    }
    body.update(claims)
    return jwt.encode(body, PRIVATE_KEY, algorithm='RS256', headers={'kid': 'key-1'})


def entra_backend():
    return EntraIDOAuth2(load_strategy())


def entra_response(graph=None, **claims):
    """
    The response the pipeline is handed: the token reply with the ID token's claims over it.

    graph, if given, answers the requests to Microsoft Graph: a dict of pages by URL.
    """
    backend = entra_backend()
    token = id_token(**claims)

    def get_json(url, **kwargs):
        if graph is None or url not in graph:
            raise AssertionError('unexpected request to {}'.format(url))
        page = graph[url]
        if isinstance(page, Exception):
            raise page
        return page

    with (
        mock.patch.object(EntraIDOAuth2, 'get_openid_configuration', return_value=openid_configuration()),
        mock.patch.object(EntraIDOAuth2, 'get_jwks_keys_for_uri', return_value=[JWK]),
        mock.patch.object(EntraIDOAuth2, 'get_json', side_effect=get_json),
    ):
        response = {'access_token': 'at', 'id_token': token, 'token_type': 'Bearer', 'expires_in': 3600, 'ext_expires_in': 3600, 'scope': 'openid'}
        response.update(backend.user_data('at', response=response))
    return backend, response


@pytest.fixture(autouse=True)
def entra_settings(settings):
    settings.SOCIAL_AUTH_ENTRA_ID_KEY = CLIENT_ID
    settings.SOCIAL_AUTH_ENTRA_ID_SECRET = 'secret'
    settings.SOCIAL_AUTH_ENTRA_ID_TENANT_ID = TENANT
    settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = 'login.microsoftonline.com'
    settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM = 'groups'
    settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY = 'preferred_username'


@pytest.fixture
def user():
    return User.objects.create(username='fernando.roca', email='fernando.roca@contoso.com')


@pytest.mark.django_db
class TestEndpoints:
    def test_v2_endpoints_of_the_tenant(self):
        url = entra_backend().authorization_url()
        assert url == 'https://login.microsoftonline.com/{}/oauth2/v2.0/authorize'.format(TENANT)
        assert entra_backend().access_token_url() == 'https://login.microsoftonline.com/{}/oauth2/v2.0/token'.format(TENANT)

    def test_a_tenant_domain_works_too(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_TENANT_ID = 'contoso.onmicrosoft.com'
        assert entra_backend().authorization_url().startswith('https://login.microsoftonline.com/contoso.onmicrosoft.com/')

    @pytest.mark.parametrize('host', ['login.microsoftonline.us', 'login.partner.microsoftonline.cn', 'contoso.ciamlogin.com'])
    def test_the_authority_host_is_configurable(self, settings, host):
        settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = host
        backend = entra_backend()
        assert backend.authorization_url() == 'https://{}/{}/oauth2/v2.0/authorize'.format(host, TENANT)
        assert backend.openid_configuration_url() == 'https://{}/{}/v2.0/.well-known/openid-configuration?appid={}'.format(host, TENANT, CLIENT_ID)

    def test_a_blank_authority_host_is_the_public_cloud(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = ''
        assert entra_backend().authorization_url().startswith('https://login.microsoftonline.com/')

    @pytest.mark.parametrize('tenant', ['', 'common', 'Organizations', 'consumers'])
    def test_it_will_not_take_users_of_any_tenant(self, settings, tenant):
        settings.SOCIAL_AUTH_ENTRA_ID_TENANT_ID = tenant
        with pytest.raises(AuthMissingParameter):
            entra_backend().authorization_url()

    def test_scopes(self):
        assert entra_backend().get_scope() == ['openid', 'profile', 'email']


@pytest.mark.django_db
class TestIDToken:
    def test_a_token_of_the_tenant_is_accepted(self):
        _, response = entra_response(groups=['ascender-admins'])
        assert response['oid'] == 'aaaaaaaa-0000-0000-0000-000000000001'
        assert response['groups'] == ['ascender-admins']

    def test_a_token_of_another_tenant_is_refused(self):
        with pytest.raises(AuthTokenError):
            entra_response(tid=OTHER_TENANT, iss='https://login.microsoftonline.com/{}/v2.0'.format(OTHER_TENANT))

    def test_a_token_for_another_client_is_refused(self):
        with pytest.raises(AuthTokenError):
            entra_response(aud='someone-else')

    def test_a_token_signed_by_someone_else_is_refused(self):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        token = jwt.encode({'aud': CLIENT_ID, 'tid': TENANT, 'oid': 'x'}, other_key, algorithm='RS256', headers={'kid': 'key-1'})
        backend = entra_backend()
        with (
            mock.patch.object(EntraIDOAuth2, 'get_openid_configuration', return_value=openid_configuration()),
            mock.patch.object(EntraIDOAuth2, 'get_jwks_keys_for_uri', return_value=[JWK]),
        ):
            with pytest.raises(AuthTokenError):
                backend.user_data('at', response={'id_token': token})


@pytest.mark.django_db
class TestUser:
    def test_known_by_object_id(self):
        backend, response = entra_response()
        assert backend.get_user_id({}, response) == 'aaaaaaaa-0000-0000-0000-000000000001'

    def test_no_object_id_no_login(self):
        with pytest.raises(AuthMissingParameter):
            entra_backend().get_user_id({}, {'preferred_username': 'someone@contoso.com'})

    def test_details(self):
        backend, response = entra_response(given_name='Fernando', family_name='Roca')
        assert backend.get_user_details(response) == {
            'username': 'fernando.roca@contoso.com',
            'email': 'fernando.roca@contoso.com',
            'fullname': 'Fernando Roca',
            'first_name': 'Fernando',
            'last_name': 'Roca',
        }

    def test_the_email_claim_wins_over_the_upn(self):
        backend, response = entra_response(email='fernando@contoso.es')
        assert backend.get_user_details(response)['email'] == 'fernando@contoso.es'

    def test_a_upn_that_is_not_an_address_is_no_email(self):
        backend, response = entra_response(preferred_username='froca')
        assert backend.get_user_details(response)['email'] == ''

    def test_the_username_claim_is_configurable(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY = 'samaccountname'
        backend, response = entra_response(samaccountname='froca')
        assert backend.get_user_details(response)['username'] == 'froca'

    def test_a_missing_username_claim_falls_back_to_the_upn(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY = 'samaccountname'
        backend, response = entra_response()
        assert backend.get_user_details(response)['username'] == 'fernando.roca@contoso.com'

    def test_the_domain_can_be_stripped(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN = True
        backend, response = entra_response()
        details = backend.get_user_details(response)
        assert strip_username_domain(backend, details)['details']['username'] == 'fernando.roca'

    def test_the_oidc_strip_setting_is_not_read(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        settings.SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN = False
        backend, response = entra_response()
        assert strip_username_domain(backend, backend.get_user_details(response)) is None


@pytest.mark.django_db
class TestLoginRule:
    def test_no_rule_lets_the_tenant_in(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = None
        backend, response = entra_response()
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None

    def test_groups(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = GROUP_RULE
        backend, response = entra_response(groups=['ascender-admins'])
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None
        backend, response = entra_response(groups=['somebody-else'])
        with pytest.raises(AuthForbidden):
            check_login_allowed(backend, {'username': 'x'}, response=response)

    def test_app_roles(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM = 'roles'
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_or': ['Ascender.User']}}
        backend, response = entra_response(roles=['Ascender.User'], groups=['ignored'])
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None

    def test_roles_can_be_matched_as_an_attribute_next_to_groups(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'attributes': {'roles': {'in': ['Ascender.User']}}}
        backend, response = entra_response(roles=['Ascender.User'])
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None

    def test_group_overage_is_unknown_not_empty(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_not': ['contractors']}}
        backend, response = entra_response(_claim_names={'groups': 'src1'}, _claim_sources={'src1': {'endpoint': 'https://graph.microsoft.com/v1.0/x'}})
        with pytest.raises(AuthForbidden):
            check_login_allowed(backend, {'username': 'x'}, response=response)

    def test_token_reply_fields_are_not_claims(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'attributes': {'ext_expires_in': {'equals': '3600'}}}
        backend, response = entra_response()
        with pytest.raises(AuthForbidden):
            check_login_allowed(backend, {'username': 'x'}, response=response)

    def test_the_oidc_rule_is_not_read(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = None
        backend, response = entra_response(groups=['somebody-else'])
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None


@pytest.mark.django_db
class TestMaps:
    def test_orgs_and_teams_from_groups(self, settings, user):
        settings.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = {
            'Default': {'triggers_admins': GROUP_RULE, 'triggers_users': {'groups': {'has_or': ['ascender-users']}}}
        }
        settings.SOCIAL_AUTH_ENTRA_ID_TEAM_MAP = {'Operators': {'organization': 'Default', 'triggers': {'groups': {'has_or': ['ascender-operators']}}}}
        backend, response = entra_response(groups=['ascender-users', 'ascender-operators'])
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        org = Organization.objects.get(name='Default')
        assert user in org.member_role
        assert user not in org.admin_role
        assert user in Team.objects.get(name='Operators', organization=org).member_role

    def test_losing_the_group_loses_the_role(self, settings, user):
        settings.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = {'Default': {'triggers_admins': GROUP_RULE}}
        backend, response = entra_response(groups=['ascender-admins'])
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        org = Organization.objects.get(name='Default')
        assert user in org.admin_role
        backend, response = entra_response(groups=[])
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        assert user not in org.admin_role

    def test_email_expressions_still_work(self, settings, user):
        settings.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = {'Default': {'users': ['fernando.roca@contoso.com']}}
        backend, response = entra_response()
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        assert user in Organization.objects.get(name='Default').member_role

    def test_the_shared_social_maps_do_not_apply(self, settings, user):
        # Only generic OIDC falls back to them, for configurations written before it had its own.
        settings.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP = None
        settings.SOCIAL_AUTH_ORGANIZATION_MAP = {'Everyone': {'users': True}}
        backend, response = entra_response()
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        assert not Organization.objects.filter(name='Everyone').exists()


@pytest.mark.django_db
class TestUserFlags:
    def test_superuser_and_auditor(self, settings, user):
        settings.SOCIAL_AUTH_ENTRA_ID_USER_FLAGS = {
            'triggers_superuser': GROUP_RULE,
            'triggers_system_auditor': {'groups': {'has_or': ['ascender-auditors']}},
        }
        backend, response = entra_response(groups=['ascender-auditors'])
        update_user_flags(backend, {}, user=user, response=response)
        user.refresh_from_db()
        assert not user.is_superuser
        assert user.is_system_auditor

        backend, response = entra_response(groups=['ascender-admins'])
        update_user_flags(backend, {}, user=user, response=response)
        user.refresh_from_db()
        assert user.is_superuser
        assert not user.is_system_auditor


@pytest.mark.django_db
class TestLogoutFromEntra:
    @pytest.fixture(autouse=True)
    def logout_settings(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP = True
        settings.ASCENDER_URL_BASE = 'https://ascender.example.com'

    @pytest.fixture
    def social(self, user):
        return UserSocialAuth.objects.create(user=user, provider='entra-id', uid='oid', extra_data={'id_token': 'the.id.token'})

    def logout(self, rf, user, backend='entra-id'):
        request = rf.post('/api/logout/', headers={'accept': 'application/json'})
        request._dont_enforce_csrf_checks = True
        SessionMiddleware(lambda request: None).process_request(request)
        request.session['social_auth_last_login_backend'] = backend
        request.session.save()
        request.user = user
        with mock.patch.object(EntraIDOAuth2, 'get_openid_configuration', return_value=openid_configuration()):
            response = LoggedLogoutView.as_view(next_page='/api/')(request)
        return request, response

    def test_the_ui_is_handed_the_entra_logout_url(self, rf, user, social):
        request, response = self.logout(rf, user)
        assert response.status_code == 200
        url = urlsplit(json.loads(response.content)['logout_url'])
        assert '{}://{}{}'.format(url.scheme, url.netloc, url.path) == 'https://login.microsoftonline.com/{}/oauth2/v2.0/logout'.format(TENANT)
        assert parse_qs(url.query) == {
            'client_id': [CLIENT_ID],
            'id_token_hint': ['the.id.token'],
            'post_logout_redirect_uri': ['https://ascender.example.com/'],
        }
        assert not request.user.is_authenticated

    def test_the_post_logout_url_is_configurable(self, rf, user, social, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_POST_LOGOUT_REDIRECT_URL = 'https://ascender.example.com/#/login'
        _, response = self.logout(rf, user)
        query = parse_qs(urlsplit(json.loads(response.content)['logout_url']).query)
        assert query['post_logout_redirect_uri'] == ['https://ascender.example.com/#/login']

    def test_off(self, rf, user, social, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP = False
        _, response = self.logout(rf, user)
        assert response.status_code == 302
        assert response['Location'] == '/api/'

    def test_the_oidc_switch_does_not_turn_it_on(self, rf, user, social, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP = False
        settings.SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP = True
        _, response = self.logout(rf, user)
        assert response.status_code == 302


@pytest.mark.django_db
class TestEnabled:
    def enabled(self):
        return ENTRA_BACKEND in AuthenticationBackendsField()._default_from_required_settings()

    def test_registered(self, settings):
        assert ENTRA_BACKEND in settings.AUTHENTICATION_BACKENDS or ENTRA_BACKEND in AuthenticationBackendsField.REQUIRED_BACKEND_SETTINGS

    def test_with_client_id_secret_and_tenant(self):
        with override_settings(SOCIAL_AUTH_ENTRA_ID_KEY=CLIENT_ID, SOCIAL_AUTH_ENTRA_ID_SECRET='s', SOCIAL_AUTH_ENTRA_ID_TENANT_ID=TENANT):
            assert self.enabled()

    def test_not_without_a_tenant(self):
        with override_settings(SOCIAL_AUTH_ENTRA_ID_KEY=CLIENT_ID, SOCIAL_AUTH_ENTRA_ID_SECRET='s', SOCIAL_AUTH_ENTRA_ID_TENANT_ID=''):
            assert not self.enabled()

    def test_secret_optional_with_workload_identity(self, tmp_path, monkeypatch):
        token_file = tmp_path / 'azure-identity-token'
        token_file.write_text('federated-token')
        monkeypatch.setenv('AZURE_FEDERATED_TOKEN_FILE', str(token_file))
        with override_settings(SOCIAL_AUTH_ENTRA_ID_KEY=CLIENT_ID, SOCIAL_AUTH_ENTRA_ID_SECRET='', SOCIAL_AUTH_ENTRA_ID_TENANT_ID=TENANT):
            assert self.enabled()
            assert entra_backend().client_assertion() == 'federated-token'

    def test_secret_required_without_workload_identity(self, monkeypatch):
        monkeypatch.delenv('AZURE_FEDERATED_TOKEN_FILE', raising=False)
        monkeypatch.delenv('OAUTH2_FEDERATED_TOKEN_FILE', raising=False)
        with override_settings(SOCIAL_AUTH_ENTRA_ID_KEY=CLIENT_ID, SOCIAL_AUTH_ENTRA_ID_SECRET='', SOCIAL_AUTH_ENTRA_ID_TENANT_ID=TENANT):
            assert not self.enabled()


GRAPH_GROUPS = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$count=true&$select=id,displayName&$top=999'
GRAPH_PAGE_2 = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$skiptoken=2'


@pytest.mark.django_db
class TestGroupsFromGraph:
    @pytest.fixture(autouse=True)
    def graph_on(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = True
        settings.SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST = ''

    def test_the_permission_is_asked_for(self):
        assert entra_backend().get_scope() == ['openid', 'profile', 'email', 'https://graph.microsoft.com/GroupMember.Read.All']

    def test_not_asked_for_when_off(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = False
        assert entra_backend().get_scope() == ['openid', 'profile', 'email']

    @pytest.mark.parametrize(
        'authority, graph',
        [
            ('login.microsoftonline.com', 'graph.microsoft.com'),
            ('login.microsoftonline.us', 'graph.microsoft.us'),
            ('login.partner.microsoftonline.cn', 'microsoftgraph.chinacloudapi.cn'),
            ('contoso.ciamlogin.com', 'graph.microsoft.com'),
        ],
    )
    def test_the_graph_of_the_cloud(self, settings, authority, graph):
        settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = authority
        assert entra_backend().graph_host == graph

    def test_the_graph_host_can_be_set(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST = 'login.microsoftonline.us'
        settings.SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST = 'dod-graph.microsoft.us'
        backend = entra_backend()
        assert backend.graph_host == 'dod-graph.microsoft.us'
        assert backend.get_scope()[-1] == 'https://dod-graph.microsoft.us/GroupMember.Read.All'

    def test_groups_by_id_and_name_over_every_page(self):
        _, response = entra_response(
            graph={
                GRAPH_GROUPS: {'value': [{'id': 'g1', 'displayName': 'ascender-admins'}, {'id': 'g2', 'displayName': None}], '@odata.nextLink': GRAPH_PAGE_2},
                GRAPH_PAGE_2: {'value': [{'id': 'g3', 'displayName': 'ascender-users'}, {'id': 'g1', 'displayName': 'ascender-admins'}]},
            },
            groups=['token-group'],
        )
        assert response['groups'] == ['g1', 'ascender-admins', 'g2', 'g3', 'ascender-users']

    def test_a_user_in_too_many_groups_for_the_token(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = GROUP_RULE
        many = [{'id': 'g{}'.format(i), 'displayName': 'group-{}'.format(i)} for i in range(300)]
        backend, response = entra_response(
            graph={GRAPH_GROUPS: {'value': many + [{'id': 'admins', 'displayName': 'ascender-admins'}]}},
            _claim_names={'groups': 'src1'},
            _claim_sources={'src1': {'endpoint': 'https://graph.microsoft.com/v1.0/users/x/getMemberObjects'}},
        )
        assert len(response['groups']) == 602
        assert check_login_allowed(backend, {'username': 'x'}, response=response) is None

    def test_maps_use_the_group_names(self, settings, user):
        settings.SOCIAL_AUTH_ENTRA_ID_TEAM_MAP = {'Operators': {'organization': 'Default', 'triggers': {'groups': {'has_or': ['ascender-operators']}}}}
        backend, response = entra_response(graph={GRAPH_GROUPS: {'value': [{'id': 'g1', 'displayName': 'ascender-operators'}]}})
        update_user_org_team_mappings(backend, {}, user=user, response=response)
        assert user in Team.objects.get(name='Operators').member_role

    @pytest.mark.parametrize(
        'graph',
        [
            {GRAPH_GROUPS: ConnectionError('unreachable')},
            {GRAPH_GROUPS: {'value': [], '@odata.nextLink': 'https://evil.example.com/steal'}},
            {GRAPH_GROUPS: {'value': [], '@odata.nextLink': 'http://graph.microsoft.com/v1.0/x'}},
            # Answers that are not what Graph documents, which must not read as no groups.
            {GRAPH_GROUPS: {}},
            {GRAPH_GROUPS: {'value': None}},
            {GRAPH_GROUPS: {'value': {'id': 'g1'}}},
            {GRAPH_GROUPS: []},
            {GRAPH_GROUPS: {'value': [{'id': 'g1', 'displayName': 'employees'}, {'displayName': 'contractors'}]}},
            {GRAPH_GROUPS: {'value': [{'id': '', 'displayName': 'contractors'}]}},
            {GRAPH_GROUPS: {'value': ['contractors']}},
            {GRAPH_GROUPS: {'value': [{'id': 'g1'}], '@odata.nextLink': GRAPH_PAGE_2}, GRAPH_PAGE_2: {'value': [{'id': None, 'displayName': 'contractors'}]}},
        ],
    )
    def test_when_graph_cannot_say_the_groups_are_unknown(self, settings, graph):
        # Not the token's groups, which may be a partial list, and not no groups,
        # which a has_not rule would let through.
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_not': ['contractors']}}
        backend, response = entra_response(graph=graph, groups=['employees'])
        assert 'groups' not in response
        with pytest.raises(AuthForbidden):
            check_login_allowed(backend, {'username': 'x'}, response=response)

    def test_endless_pages_are_not_followed(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS = {'groups': {'has_not': ['contractors']}}
        backend, response = entra_response(graph={GRAPH_GROUPS: {'value': [{'id': 'g1'}], '@odata.nextLink': GRAPH_GROUPS}})
        assert 'groups' not in response
        with pytest.raises(AuthForbidden):
            check_login_allowed(backend, {'username': 'x'}, response=response)

    def test_the_access_token_is_sent_to_graph(self):
        backend = entra_backend()
        with mock.patch.object(EntraIDOAuth2, 'get_json', return_value={'value': []}) as get_json:
            backend.fetch_graph_groups('the-access-token')
        assert get_json.call_args.kwargs['headers']['Authorization'] == 'Bearer the-access-token'

    def test_every_page_is_an_advanced_query(self):
        # The cast to groups is only served with $count=true and eventual consistency.
        pages = {GRAPH_GROUPS: {'value': [{'id': 'g1'}], '@odata.nextLink': GRAPH_PAGE_2}, GRAPH_PAGE_2: {'value': [{'id': 'g2'}]}}
        with mock.patch.object(EntraIDOAuth2, 'get_json', side_effect=lambda url, **kwargs: pages[url]) as get_json:
            assert entra_backend().fetch_graph_groups('the-access-token') == ['g1', 'g2']
        assert '$count=true' in get_json.call_args_list[0].args[0]
        assert [call.kwargs['headers']['ConsistencyLevel'] for call in get_json.call_args_list] == ['eventual', 'eventual']

    def test_off_leaves_graph_alone(self, settings):
        settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = False
        _, response = entra_response(groups=['token-group'])
        assert response['groups'] == ['token-group']


@pytest.mark.django_db
@pytest.mark.parametrize(
    'next_link', ['https://evil.example.com/v1.0/steal', 'http://graph.microsoft.com/v1.0/next', 'https://graph.microsoft.com.evil.example.com/x']
)
def test_the_access_token_never_leaves_graph(settings, next_link):
    settings.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH = True
    settings.SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST = ''
    pages = {
        GRAPH_GROUPS: {'value': [{'id': 'g1', 'displayName': 'one'}], '@odata.nextLink': next_link},
        # Served if asked, so that only the check can stop it.
        next_link: {'value': [{'id': 'g2', 'displayName': 'ascender-admins'}]},
    }
    with mock.patch.object(EntraIDOAuth2, 'get_json', side_effect=lambda url, **kwargs: pages[url]) as get_json:
        with pytest.raises(ValueError):
            entra_backend().fetch_graph_groups('the-access-token')
    assert [call.args[0] for call in get_json.call_args_list] == [GRAPH_GROUPS]
