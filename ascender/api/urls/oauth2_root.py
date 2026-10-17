# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.
from datetime import timedelta

from django.utils.timezone import now
from ascender.settings.typed import settings
from django.urls import path, re_path

from oauthlib import oauth2
from oauth2_provider import views
from oauth2_provider.oauth2_validators import OAuth2Validator

from ascender.main.models import OAuth2RefreshToken
from ascender.api.views.root import ApiOAuthAuthorizationRootView
from ascender.api.views import workload_identity


class ActiveUserOAuth2Validator(OAuth2Validator):
    """Refuse refresh and authorization-code grants for inactive users.

    DOT checks is_active for the password grant only, so a refresh token or
    code issued before deactivation would still mint tokens. oauthlib calls
    these after it has authenticated the client, and DOT's own lookup finds the
    token, so the refusal is the invalid_grant a revoked token gets and says
    nothing about the account to a caller without the client's credentials.
    """

    def validate_code(self, client_id, code, client, request, *args, **kwargs):
        return super().validate_code(client_id, code, client, request, *args, **kwargs) and request.user.is_active

    def validate_refresh_token(self, refresh_token, client, request, *args, **kwargs):
        return super().validate_refresh_token(refresh_token, client, request, *args, **kwargs) and request.user.is_active


class TokenView(views.TokenView):
    validator_class = ActiveUserOAuth2Validator

    def create_token_response(self, request):
        # Django OAuth2 Toolkit has a bug whereby refresh tokens are *never*
        # properly expired (ugh):
        #
        # https://github.com/jazzband/django-oauth-toolkit/issues/746
        #
        # This code detects and auto-expires them on refresh grant
        # requests.
        if request.POST.get('grant_type') == 'refresh_token' and 'refresh_token' in request.POST:
            refresh_token = OAuth2RefreshToken.objects.filter(token=request.POST['refresh_token']).first()
            if refresh_token:
                expire_seconds = settings.OAUTH2_PROVIDER.get('REFRESH_TOKEN_EXPIRE_SECONDS', 0)
                if refresh_token.created + timedelta(seconds=expire_seconds) < now():
                    return request.build_absolute_uri(), {}, 'The refresh token has expired.', '403'
        try:
            return super(TokenView, self).create_token_response(request)
        except oauth2.AccessDeniedError as e:
            return request.build_absolute_uri(), {}, str(e), '403'


urls = [
    path('', ApiOAuthAuthorizationRootView.as_view(), name='oauth_authorization_root_view'),
    path("authorize/", views.AuthorizationView.as_view(), name="authorize"),
    path("token/", TokenView.as_view(), name="token"),
    path("revoke_token/", views.RevokeTokenView.as_view(), name="revoke-token"),
    # Workload identity: an OIDC client builds these from the issuer without
    # a trailing slash, so they answer with or without one
    re_path(r"^\.well-known/openid-configuration/?$", workload_identity.openid_configuration, name="workload_identity_openid_configuration"),
    re_path(r"^\.well-known/jwks\.json/?$", workload_identity.jwks, name="workload_identity_jwks"),
]


__all__ = ['urls']
