import logging

from channels.auth import AuthMiddleware
from channels.auth import get_user as get_session_user
from channels.db import database_sync_to_async
from channels.security.websocket import WebsocketDenier
from channels.sessions import CookieMiddleware, SessionMiddleware
from django.contrib.auth import get_user_model
from django.http import HttpRequest
from rest_framework.request import Request
from rest_framework.settings import api_settings

logger = logging.getLogger('awx.dab.lib.channels.middleware')


@database_sync_to_async
def _get_authenticated_user(scope: dict):
    request = HttpRequest()
    request.META = {_http_key(k.decode()): v.decode() for (k, v) in scope["headers"]}
    auth_classes = [auth() for auth in api_settings.DEFAULT_AUTHENTICATION_CLASSES]
    try:
        return Request(request, authenticators=auth_classes).user
    except Exception:
        return None


class DrfAuthMiddleware(AuthMiddleware):
    async def __call__(self, scope, receive, send):
        session_user = await get_session_user(scope)
        if session_user and session_user.is_authenticated:
            user = session_user
        else:
            user = await _get_authenticated_user(scope)

        if not user or not isinstance(user, get_user_model()):
            logger.error("Websocket connection does not provide valid authentication")
            denier = WebsocketDenier()
            return await denier(scope, receive, send)

        scope["user"] = user

        return await self.inner(scope, receive, send)


# Handy shortcut for applying all three layers at once
def DrfAuthMiddlewareStack(inner):  # noqa: N802
    return CookieMiddleware(SessionMiddleware(DrfAuthMiddleware(inner)))


def _http_key(key: str) -> str:
    return f"HTTP_{key.replace('-', '_').upper()}"
