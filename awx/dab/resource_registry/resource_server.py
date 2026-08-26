from datetime import timedelta
from typing import TypedDict

import jwt
from django.conf import settings
from django.utils.timezone import now

from awx.dab.resource_registry.models import service_id


class ResourceServerConfig(TypedDict):
    URL: str
    SECRET_KEY: str
    VALIDATE_HTTPS: bool
    JWT_ALGORITHM: str


def get_resource_server_config() -> ResourceServerConfig:
    defaults = {"JWT_ALGORITHM": "HS256", "VALIDATE_HTTPS": True}
    defaults.update(settings.RESOURCE_SERVER)
    return defaults


def get_service_token(user_id=None, expiration=60, **kwargs):
    config = get_resource_server_config()
    payload = {
        "iss": str(service_id()),
        **kwargs,
    }

    if user_id is not None:
        payload["sub"] = user_id

    if expiration is not None:
        payload["exp"] = now() + timedelta(seconds=expiration)

    return jwt.encode(payload, config["SECRET_KEY"], config["JWT_ALGORITHM"])
