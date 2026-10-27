import asyncio

from unittest import mock

import pytest

from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.test import RequestFactory
from rest_framework.exceptions import AuthenticationFailed

from ascender.api.authentication import LoggedOAuth2Authentication
from ascender.api.serializers.oauth2 import OAuth2TokenSerializer
from ascender.api.urls import oauth2_root
from ascender.dab.lib.channels import middleware
from ascender.main.models import OAuth2AccessToken

PARENT_TOKEN_RESPONSE = 'oauth2_provider.views.TokenView.create_token_response'


def _user(username='alice', is_active=True):
    return User(username=username, is_active=is_active)


class TestLoggedOAuth2Authentication:
    def _authenticate(self, user):
        token = mock.Mock(pk=1, scope='read write')
        with mock.patch('oauth2_provider.contrib.rest_framework.OAuth2Authentication.authenticate', return_value=(user, token)):
            return LoggedOAuth2Authentication().authenticate(mock.Mock(method='GET', path='/api/v2/me/')), token

    def test_active_user_is_authenticated_with_token_scopes(self):
        alice = _user()
        ret, token = self._authenticate(alice)
        assert ret == (alice, token)
        assert alice.oauth_scopes == ['read', 'write']

    def test_inactive_user_is_refused(self):
        # DOT's validate_bearer_token sets request.user without checking is_active.
        with pytest.raises(AuthenticationFailed, match='User inactive or deleted.'):
            self._authenticate(_user(is_active=False))

    def test_no_bearer_token_falls_through(self):
        with mock.patch('oauth2_provider.contrib.rest_framework.OAuth2Authentication.authenticate', return_value=None):
            assert LoggedOAuth2Authentication().authenticate(mock.Mock()) is None


class TestTokenViewInactiveUser:
    def _respond(self, data, refresh_token=None, grant=None):
        request = RequestFactory().post('/api/o/token/', data)
        with (
            mock.patch.object(oauth2_root.OAuth2RefreshToken.objects, 'filter') as rt_filter,
            mock.patch.object(oauth2_root, 'get_grant_model', create=True) as grant_model,
            mock.patch(PARENT_TOKEN_RESPONSE, return_value='issued') as parent,
        ):
            rt_filter.return_value.first.return_value = refresh_token
            grant_model.return_value.objects.filter.return_value.first.return_value = grant
            return oauth2_root.TokenView().create_token_response(request), parent

    def _refresh_token(self, user):
        from django.utils.timezone import now

        return mock.Mock(user=user, created=now())

    @pytest.mark.parametrize('is_active', [True, False])
    def test_refresh_grant(self, is_active):
        ret, parent = self._respond({'grant_type': 'refresh_token', 'refresh_token': 'r'}, refresh_token=self._refresh_token(_user(is_active=is_active)))
        if is_active:
            assert ret == 'issued'
        else:
            assert ret[2:] == ('User inactive or deleted.', '403')
            parent.assert_not_called()

    @pytest.mark.parametrize('is_active', [True, False])
    def test_authorization_code_grant(self, is_active):
        # A code issued just before deactivation stays redeemable for AUTHORIZATION_CODE_EXPIRE_SECONDS.
        ret, parent = self._respond({'grant_type': 'authorization_code', 'code': 'c'}, grant=mock.Mock(user=_user(is_active=is_active)))
        if is_active:
            assert ret == 'issued'
        else:
            assert ret[2:] == ('User inactive or deleted.', '403')
            parent.assert_not_called()

    def test_expired_refresh_token_still_reported_as_expired(self):
        from datetime import timedelta
        from django.utils.timezone import now

        expired = mock.Mock(user=_user(is_active=False), created=now() - timedelta(days=3650))
        ret, parent = self._respond({'grant_type': 'refresh_token', 'refresh_token': 'r'}, refresh_token=expired)
        assert ret[2:] == ('The refresh token has expired.', '403')
        parent.assert_not_called()

    @pytest.mark.parametrize(
        'data',
        [
            {'grant_type': 'refresh_token', 'refresh_token': 'unknown'},
            {'grant_type': 'authorization_code', 'code': 'unknown'},
            {'grant_type': 'password', 'username': 'alice', 'password': 'x'},
        ],
    )
    def test_unknown_or_other_grants_are_left_to_dot(self, data):
        # DOT rejects unknown tokens and codes itself, and checks is_active for the password grant.
        ret, parent = self._respond(data)
        assert ret == 'issued'
        parent.assert_called_once()


class TestDrfAuthMiddlewareInactiveSessionUser:
    def _connect(self, session_user, token_user=None):
        inner = mock.AsyncMock()
        with (
            mock.patch.object(middleware, 'get_session_user', mock.AsyncMock(return_value=session_user)),
            mock.patch.object(middleware, '_get_authenticated_user', mock.AsyncMock(return_value=token_user)) as token_auth,
            mock.patch.object(middleware, 'WebsocketDenier', return_value=mock.AsyncMock()) as denier,
        ):
            scope = {'type': 'websocket'}
            asyncio.run(middleware.DrfAuthMiddleware(inner)(scope, None, None))
        return inner, denier.return_value, token_auth, scope

    def test_active_session_user_connects(self):
        alice = _user()
        inner, denier, token_auth, scope = self._connect(alice)
        assert inner.await_count == 1 and scope['user'] is alice
        token_auth.assert_not_called()
        denier.assert_not_awaited()

    def test_inactive_session_user_is_denied(self):
        # The LDAP, TACACS+ and social backends return inactive users from get_user().
        inner, denier, token_auth, _ = self._connect(_user(is_active=False))
        token_auth.assert_awaited_once()
        inner.assert_not_awaited()
        denier.assert_awaited_once()

    def test_inactive_session_does_not_block_valid_token(self):
        bob = _user('bob')
        inner, denier, _, scope = self._connect(_user(is_active=False), token_user=bob)
        assert inner.await_count == 1 and scope['user'] is bob
        denier.assert_not_awaited()


class TestTokenBelongsToRequester:
    def test_serializer_does_not_substitute_application_owner(self):
        alice, admin = _user(), _user('admin')
        application = mock.Mock(user=admin)
        serializer = OAuth2TokenSerializer(context={'request': mock.Mock(user=alice)})

        def model_create(self, validated_data):
            return mock.Mock(**validated_data)

        with (
            mock.patch('rest_framework.serializers.ModelSerializer.create', model_create),
            mock.patch('ascender.api.serializers.oauth2.OAuth2RefreshToken.objects.create') as create_refresh,
        ):
            obj = serializer.create({'application': application, 'scope': 'write'})

        assert obj.user is alice
        assert create_refresh.call_args.kwargs['user'] is alice

    def test_no_post_save_receiver_rewrites_token_user(self):
        import ascender.main.signals  # noqa: F401  registers the receivers

        sync_receivers, async_receivers = post_save._live_receivers(OAuth2AccessToken)
        names = {getattr(r, '__name__', '') for r in sync_receivers + async_receivers}
        assert 'create_access_token_user_if_missing' not in names
