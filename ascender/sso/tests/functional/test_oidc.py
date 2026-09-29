import json
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware
from social_core.backends.open_id_connect import OpenIdConnectAuth
from social_core.exceptions import AuthForbidden
from social_django.models import UserSocialAuth
from social_django.utils import load_strategy

from ascender.api.generics import LoggedLogoutView
from ascender.main.models import Organization, Team, User
from ascender.sso.oidc import check_login_allowed, idp_logout_url, strip_username_domain, update_user_flags
from ascender.sso.social_pipeline import update_user_org_team_mappings


def oidc_backend(**claims):
    """The generic OIDC backend as the pipeline sees it, with a validated ID token."""
    backend = OpenIdConnectAuth(load_strategy())
    backend.id_token = dict({'sub': '1234'}, **claims)
    return backend


GROUP_RULE = {'groups': {'has_or': ['ascender-admins']}}


@pytest.fixture
def user():
    return User.objects.create(username='alice', email='alice@example.com')


@pytest.mark.django_db
class TestLoginRule:
    def test_no_rule_lets_everyone_in(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = None
        assert check_login_allowed(oidc_backend(), {'username': 'alice'}, response={}) is None

    def test_a_matching_user_is_let_in(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        assert check_login_allowed(oidc_backend(groups=['ascender-admins']), {'username': 'alice'}, response={}) is None

    def test_groups_can_come_from_userinfo(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        assert check_login_allowed(oidc_backend(), {'username': 'alice'}, response={'groups': ['ascender-admins']}) is None

    def test_anyone_else_is_refused(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        with pytest.raises(AuthForbidden):
            check_login_allowed(oidc_backend(groups=['somebody-else']), {'username': 'alice'}, response={})

    def test_the_groups_claim_is_configurable(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        settings.SOCIAL_AUTH_OIDC_GROUPS_CLAIM = 'realm_access.roles'
        backend = oidc_backend(groups=['somebody-else'], realm_access={'roles': ['ascender-admins']})
        assert check_login_allowed(backend, {'username': 'alice'}, response={}) is None

    def test_attributes_can_be_matched(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = {'attributes': {'email': {'ends_with': '@example.com'}}}
        assert check_login_allowed(oidc_backend(email='alice@example.com'), {'username': 'alice'}, response={}) is None
        with pytest.raises(AuthForbidden):
            check_login_allowed(oidc_backend(email='mallory@evil.test'), {'username': 'mallory'}, response={})

    def test_a_rule_that_cannot_be_evaluated_refuses_everyone(self, settings):
        # Written to a settings file, so it never went through the serializer.
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = {'groups': {'has_or': []}}
        with pytest.raises(AuthForbidden):
            check_login_allowed(oidc_backend(groups=['ascender-admins']), {'username': 'alice'}, response={})

    @pytest.mark.parametrize(
        'claims',
        [
            {},
            # Entra ID group overage.
            {'_claim_names': {'groups': 'src1'}, '_claim_sources': {'src1': {'endpoint': 'https://graph.example.com'}}},
        ],
    )
    def test_unknown_groups_are_refused_even_by_has_not(self, settings, claims):
        # has_not over an empty set would let exactly the excluded users in.
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = {'groups': {'has_not': ['contractors']}}
        with pytest.raises(AuthForbidden):
            check_login_allowed(oidc_backend(**claims), {'username': 'alice'}, response={})

    def test_other_backends_are_not_asked(self, settings):
        settings.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS = GROUP_RULE
        backend = mock.Mock()
        backend.name = 'github'
        assert check_login_allowed(backend, {'username': 'alice'}, response={}) is None


@pytest.mark.django_db
class TestStripUsernameDomain:
    def pick(self, backend, details):
        """What the username of a new user comes out as, through the real pipeline steps."""
        from social_core.pipeline.user import get_username

        out = strip_username_domain(backend, details) or {}
        details = out.get('details', details)
        return get_username(backend.strategy, details, backend)['username']

    def test_off_by_default(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = False
        assert self.pick(oidc_backend(), {'username': 'fernando.roca@example.com'}) == 'fernando.roca@example.com'

    def test_on(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        assert self.pick(oidc_backend(), {'username': 'fernando.roca@example.com', 'email': 'fernando.roca@example.com'}) == 'fernando.roca'

    def test_the_email_is_left_alone(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        details = {'username': 'fernando.roca@example.com', 'email': 'fernando.roca@example.com'}
        assert strip_username_domain(oidc_backend(), details)['details']['email'] == 'fernando.roca@example.com'
        # and the dict the pipeline handed in is not changed under it
        assert details['username'] == 'fernando.roca@example.com'

    @pytest.mark.parametrize('username', ['fernando.roca', '@example.com', None, ''])
    def test_nothing_to_strip(self, settings, username):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        assert strip_username_domain(oidc_backend(), {'username': username}) is None

    def test_a_taken_name_gets_a_suffix(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        User.objects.create(username='fernando.roca')
        picked = self.pick(oidc_backend(), {'username': 'fernando.roca@other.example.com'})
        assert picked != 'fernando.roca'
        assert picked.startswith('fernando.roca')

    def test_other_backends_are_not_touched(self, settings):
        settings.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN = True
        backend = mock.Mock()
        backend.name = 'github'
        assert strip_username_domain(backend, {'username': 'someone@example.com'}) is None

    def test_it_runs_before_the_username_is_picked(self, settings):
        pipeline = list(settings.SOCIAL_AUTH_PIPELINE)
        assert pipeline.index('ascender.sso.oidc.strip_username_domain') < pipeline.index('social_core.pipeline.user.get_username')


@pytest.mark.django_db
class TestUserFlags:
    def test_a_matching_user_becomes_superuser(self, settings, user):
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': GROUP_RULE}
        update_user_flags(oidc_backend(groups=['ascender-admins']), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is True

    def test_a_user_who_stops_matching_loses_it(self, settings, user):
        user.is_superuser = True
        user.save()
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': GROUP_RULE}
        update_user_flags(oidc_backend(groups=[]), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is False

    def test_remove_false_keeps_it(self, settings, user):
        user.is_superuser = True
        user.save()
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': GROUP_RULE, 'remove_superusers': False}
        update_user_flags(oidc_backend(groups=[]), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is True

    def test_system_auditor(self, settings, user):
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_system_auditor': {'groups': {'has_or': ['auditors']}}}
        update_user_flags(oidc_backend(groups=['auditors']), {}, user=user, response={})
        assert User.objects.get(pk=user.pk).is_system_auditor is True

        update_user_flags(oidc_backend(groups=[]), {}, user=user, response={})
        assert User.objects.get(pk=user.pk).is_system_auditor is False

    def test_a_flag_without_a_rule_is_left_alone(self, settings, user):
        user.is_superuser = True
        user.save()
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_system_auditor': {'groups': {'has_or': ['auditors']}}}
        update_user_flags(oidc_backend(groups=[]), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is True

    def test_a_rule_that_cannot_be_evaluated_changes_nothing(self, settings, user):
        user.is_superuser = True
        user.save()
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': {'groups': {'has_or': []}}}
        update_user_flags(oidc_backend(groups=[]), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is True

    def test_unknown_groups_do_not_revoke(self, settings, user):
        user.is_superuser = True
        user.save()
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': GROUP_RULE}
        update_user_flags(oidc_backend(), {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is True

    def test_other_backends_are_not_asked(self, settings, user):
        settings.SOCIAL_AUTH_OIDC_USER_FLAGS = {'triggers_superuser': {'always': {}}}
        backend = mock.Mock()
        backend.name = 'github'
        update_user_flags(backend, {}, user=user, response={})
        user.refresh_from_db()
        assert user.is_superuser is False


@pytest.mark.django_db
class TestMaps:
    @pytest.fixture
    def org(self):
        return Organization.objects.create(name='Default')

    def test_org_roles_from_groups(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {
            'Default': {
                'triggers_admins': GROUP_RULE,
                'triggers_users': {'groups': {'has_or': ['ascender-users']}},
            }
        }
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = {}
        update_user_org_team_mappings(oidc_backend(groups=['ascender-users']), {}, user=user, response={})
        assert user in org.member_role
        assert user not in org.admin_role

        update_user_org_team_mappings(oidc_backend(groups=['ascender-admins']), {}, user=user, response={})
        assert user in org.admin_role
        # Not in ascender-users any more, and remove defaults to on.  The admin
        # role takes in the member role, so only the direct grant can tell.
        assert not org.member_role.members.filter(pk=user.pk).exists()

    def test_team_from_groups(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {}
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = {'Operators': {'organization': 'Default', 'triggers': {'groups': {'has_or': ['ops']}}}}
        update_user_org_team_mappings(oidc_backend(groups=['ops']), {}, user=user, response={})
        team = Team.objects.get(name='Operators', organization=org)
        assert user in team.member_role

        update_user_org_team_mappings(oidc_backend(groups=[]), {}, user=user, response={})
        assert user not in team.member_role

    def test_the_older_expressions_still_decide_for_users_the_rule_skips(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {'Default': {'triggers_users': GROUP_RULE, 'users': ['alice']}}
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = {}
        update_user_org_team_mappings(oidc_backend(groups=[]), {}, user=user, response={})
        assert user in org.member_role

    def test_unknown_groups_leave_memberships_alone(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {'Default': {'triggers_users': GROUP_RULE}}
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = {}
        update_user_org_team_mappings(oidc_backend(groups=['ascender-admins']), {}, user=user, response={})
        assert user in org.member_role
        # The next token comes without the groups claim, say the mapper was
        # dropped at the provider.  That is no reason to revoke.
        update_user_org_team_mappings(oidc_backend(), {}, user=user, response={})
        assert user in org.member_role

    def test_unset_oidc_maps_fall_back_to_the_shared_ones(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = None
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = None
        settings.SOCIAL_AUTH_ORGANIZATION_MAP = {'Default': {'users': True}}
        settings.SOCIAL_AUTH_TEAM_MAP = {}
        update_user_org_team_mappings(oidc_backend(), {}, user=user, response={})
        assert user in org.member_role

    def test_set_oidc_maps_win_over_the_shared_ones(self, settings, user, org):
        settings.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP = {}
        settings.SOCIAL_AUTH_OIDC_TEAM_MAP = {}
        settings.SOCIAL_AUTH_ORGANIZATION_MAP = {'Default': {'users': True}}
        settings.SOCIAL_AUTH_TEAM_MAP = {}
        update_user_org_team_mappings(oidc_backend(), {}, user=user, response={})
        assert user not in org.member_role


OIDC_CONFIG = {'end_session_endpoint': 'https://idp.example.com/logout'}


@pytest.mark.django_db
class TestLogoutFromProvider:
    """
    The view is called directly, with a real session, because the full request
    stack is not loaded from this test tree.
    """

    @pytest.fixture(autouse=True)
    def oidc_settings(self, settings):
        settings.SOCIAL_AUTH_OIDC_KEY = 'ascender-client'
        settings.SOCIAL_AUTH_OIDC_OIDC_ENDPOINT = 'https://idp.example.com'
        settings.SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP = True
        settings.ASCENDER_URL_BASE = 'https://ascender.example.com'

    @pytest.fixture
    def social(self, user):
        return UserSocialAuth.objects.create(user=user, provider='oidc', uid='1234', extra_data={'id_token': 'the.id.token'})

    def logout(self, rf, user, accept, backend='oidc', oidc_config=None, **patch_kwargs):
        request = rf.post('/api/logout/', headers={'accept': accept})
        request._dont_enforce_csrf_checks = True
        SessionMiddleware(lambda request: None).process_request(request)
        request.session['social_auth_last_login_backend'] = backend
        request.session.save()
        request.user = user
        if not patch_kwargs:
            patch_kwargs = {'return_value': OIDC_CONFIG if oidc_config is None else oidc_config}
        with mock.patch.object(OpenIdConnectAuth, 'oidc_config', **patch_kwargs):
            response = LoggedLogoutView.as_view(next_page='/api/')(request)
        return request, response

    def test_off_by_default(self, rf, user, social, settings):
        settings.SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP = False
        _, response = self.logout(rf, user, 'application/json')
        assert response.status_code == 302
        assert response['Location'] == '/api/'

    def test_the_ui_is_handed_the_url(self, rf, user, social):
        request, response = self.logout(rf, user, 'application/json, text/plain, */*')
        assert response.status_code == 200
        url = urlsplit(json.loads(response.content)['logout_url'])
        assert '{}://{}{}'.format(url.scheme, url.netloc, url.path) == 'https://idp.example.com/logout'
        assert parse_qs(url.query) == {
            'client_id': ['ascender-client'],
            'id_token_hint': ['the.id.token'],
            'post_logout_redirect_uri': ['https://ascender.example.com/'],
        }
        # The local session is gone whatever the provider does next.
        assert not request.user.is_authenticated
        assert response.cookies['userLoggedIn'].value == 'false'

    def test_a_browser_form_is_redirected(self, rf, user, social, settings):
        settings.SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL = 'https://ascender.example.com/#/login'
        _, response = self.logout(rf, user, 'text/html,application/xhtml+xml')
        assert response.status_code == 302
        assert response['Location'].startswith('https://idp.example.com/logout?')
        assert parse_qs(urlsplit(response['Location']).query)['post_logout_redirect_uri'] == ['https://ascender.example.com/#/login']

    def test_a_session_from_another_backend_is_only_logged_out_here(self, rf, user, social):
        request, response = self.logout(rf, user, 'application/json', backend='github')
        assert response.status_code == 302
        assert response['Location'] == '/api/'
        assert not request.user.is_authenticated

    def test_a_provider_without_end_session_is_only_logged_out_here(self, rf, user, social):
        request, response = self.logout(rf, user, 'application/json', oidc_config={})
        assert response.status_code == 302
        assert not request.user.is_authenticated

    def test_an_end_session_endpoint_that_is_not_a_web_address_is_ignored(self, rf, user, social):
        _, response = self.logout(rf, user, 'application/json', oidc_config={'end_session_endpoint': 'javascript:alert(1)'})
        assert response.status_code == 302
        assert response['Location'] == '/api/'

    # A discovery document is the provider's to get wrong, and the user still
    # has to come out of it logged out here rather than with a 500.
    @pytest.mark.parametrize('endpoint', [['https://idp.example.com/logout'], {'url': 'x'}, 42, True, 'https:///logout', 'https://[::1/logout'])
    def test_a_malformed_end_session_endpoint_is_only_logged_out_here(self, rf, user, social, endpoint):
        request, response = self.logout(rf, user, 'application/json', oidc_config={'end_session_endpoint': endpoint})
        assert response.status_code == 302
        assert response['Location'] == '/api/'
        assert not request.user.is_authenticated

    def test_an_unreachable_provider_is_only_logged_out_here(self, rf, user, social):
        request, response = self.logout(rf, user, 'application/json', side_effect=ConnectionError)
        assert response.status_code == 302
        assert not request.user.is_authenticated

    def test_the_id_token_hint_is_optional(self, rf, user, social):
        social.extra_data = {}
        social.save()
        _, response = self.logout(rf, user, 'application/json')
        assert 'id_token_hint' not in parse_qs(urlsplit(json.loads(response.content)['logout_url']).query)

    def test_an_unset_base_url_comes_back_to_this_host(self, rf, user, social, settings):
        settings.ASCENDER_URL_BASE = 'https://ascenderhost'
        _, response = self.logout(rf, user, 'application/json')
        query = parse_qs(urlsplit(json.loads(response.content)['logout_url']).query)
        assert query['post_logout_redirect_uri'] == ['http://testserver/']

    def test_anonymous(self, rf):
        request = rf.post('/api/logout/')
        request.user = AnonymousUser()
        request.session = {'social_auth_last_login_backend': 'oidc'}
        assert idp_logout_url(request) is None
