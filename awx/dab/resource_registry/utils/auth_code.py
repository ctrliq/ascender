from datetime import datetime, timedelta

import jwt

from awx.dab.resource_registry.models import Resource, service_id
from awx.dab.resource_registry.resource_server import get_resource_server_config
from awx.dab.resource_registry.utils.sso_provider import get_sso_provider_server


def get_user_auth_code(user, social_user=None, oidc_alt_key=None):
    """
    Generate an authentication code using the service's configured secret key.

    user: Django User instance
    social_user: SocialUser or AuthenticatorUser instance for the backend used to authenticate the user.
    oidc_alt_key: for some OIDC backends, the sub claim on the JWT gets used as the UID rather than the username.
        This param lets us pass the sub id to the auth_code, which can be used as a secondary method for
        account lookups.
    """
    config = get_resource_server_config()
    payload = {
        "iss": str(service_id()),
        "type": "auth_code",
        "username": user.username,
        "sub": str(Resource.get_resource_for_object(user).ansible_id),
        "exp": datetime.now() + timedelta(seconds=15),
        "sso_uid": None,
        "sso_backend": None,
        "sso_server": None,
        "oidc_alt_key": oidc_alt_key,
        "auth_backend": getattr(user, "backend", None),
    }

    if social_user is not None:
        if isinstance(social_user.provider, str):
            provider = social_user.provider
        else:
            provider = social_user.provider.slug

        server, uid = get_sso_provider_server(provider, social_user.uid)

        payload["sso_uid"] = uid
        payload["sso_backend"] = provider
        payload["sso_server"] = server

    return jwt.encode(payload, config["SECRET_KEY"], config["JWT_ALGORITHM"])
