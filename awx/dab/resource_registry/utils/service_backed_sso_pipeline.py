from django.conf import settings
from django.shortcuts import redirect

from awx.dab.resource_registry.resource_server import get_resource_server_config
from awx.dab.resource_registry.utils.auth_code import get_user_auth_code
from awx.dab.resource_registry.utils.settings import resource_server_defined


def redirect_to_resource_server(*args, social=None, user=None, **kwargs):
    """
    This MUST come at the end of the SOCIAL_AUTH_PIPELINE configuration.
    """

    # Allow for disabling this pipeline without removing it from the settings.
    # If resource server is defined, also silently quit
    # for ease of connected vs disconnected configs
    if (not getattr(settings, 'ENABLE_SERVICE_BACKED_SSO', False)) or (not resource_server_defined()):
        return None

    oidc_alt_key = None

    # Galaxy and AWX use different social auth backends for keycloak. AWX uses the
    # generic "oidc" provider, whereas Galaxy uses the "keycloak" provider. The way
    # these two backends handle the social auth UID is slightly different. The generic
    # backend uses the "sub" keyword in the ID token keycloak one uses the "preferred_username".
    # To be able to automatically link up accounts from these two services, we have
    # a field called "oidc_alt_key" in our auth code which is used to provide an
    # alternative lookup mechanism for the SSO user. If "sub" is used for the UID,
    # we'll pass "preferred_username" to oidc_alt_key, otherwise this gets set to "sub".
    if response := kwargs.get("response"):
        sub = response.get("sub", None)
        username = response.get("preferred_username", None)

        if sub == social.uid:
            oidc_alt_key = username
        else:
            oidc_alt_key = sub

    if not user:
        return None

    redirect_path = getattr(
        settings,
        'SERVICE_BACKED_SSO_AUTH_CODE_REDIRECT_PATH',
        "/api/gateway/v1/legacy_auth/authenticate_sso/",
    ).strip("/")

    redirect_url = getattr(
        settings,
        'SERVICE_BACKED_SSO_AUTH_CODE_REDIRECT_URL',
        get_resource_server_config()["URL"],
    )

    auth_code = get_user_auth_code(user, social_user=social, oidc_alt_key=oidc_alt_key)
    url = f"{redirect_url}/{redirect_path}/?auth_code={auth_code}"

    return redirect(url, permanent=False)
