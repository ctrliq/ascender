import asyncio

from unittest import mock

import pytest

from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.test import RequestFactory
from oauth2_provider.oauth2_validators import OAuth2Validator
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


class TestActiveUserOAuth2Validator:
    # oauthlib calls these after authenticating the client; False becomes invalid_grant.
    @pytest.fixture(params=['validate_refresh_token', 'validate_code'])
    def method(self, request):
        return request.param

    def _validate(self, method, user, dot_result=True):
        def dot_validate(self, *args, **kwargs):
            args[-1].user = user
            return dot_result

        request = mock.Mock(user=None)
        args = ('refresh', mock.Mock(), request) if method == 'validate_refresh_token' else ('client-id', 'code', mock.Mock(), request)
        with mock.patch.object(OAuth2Validator, method, dot_validate):
            return getattr(oauth2_root.ActiveUserOAuth2Validator(), method)(*args)

    def test_active_user_passes(self, method):
        assert self._validate(method, _user()) is True

    def test_inactive_user_is_refused(self, method):
        # DOT's validate_refresh_token and validate_code set request.user without checking is_active.
        assert self._validate(method, _user(is_active=False)) is False

    def test_dot_refusal_is_kept(self, method):
        assert self._validate(method, _user(), dot_result=False) is False

    def test_token_view_uses_it(self):
        # get_oauthlib_core() caches per class, so check the server it actually builds.
        assert isinstance(oauth2_root.TokenView.get_server().request_validator, oauth2_root.ActiveUserOAuth2Validator)


class TestTokenViewRefreshExpiry:
    def test_expired_refresh_token_still_reported_as_expired(self):
        from datetime import timedelta
        from django.utils.timezone import now

        request = RequestFactory().post('/api/o/token/', {'grant_type': 'refresh_token', 'refresh_token': 'r'})
        expired = mock.Mock(created=now() - timedelta(days=3650))
        with (
            mock.patch.object(oauth2_root.OAuth2RefreshToken.objects, 'filter') as rt_filter,
            mock.patch(PARENT_TOKEN_RESPONSE) as parent,
        ):
            rt_filter.return_value.first.return_value = expired
            ret = oauth2_root.TokenView().create_token_response(request)
        assert ret[2:] == ('The refresh token has expired.', '403')
        parent.assert_not_called()


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
        # The LDAP and social backends return inactive users from get_user().
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
