import logging

from ascender.settings.typed import settings
from django.contrib.auth.backends import ModelBackend

logger = logging.getLogger('ascender.main.backends')


class AscenderModelBackend(ModelBackend):
    """The local authentication backend."""

    def authenticate(self, request, **kwargs):
        if settings.DISABLE_LOCAL_AUTH:
            logger.warning(f"User '{kwargs['username']}' attempted login through the disabled local authentication system.")
            return
        return super().authenticate(request, **kwargs)


class AWXModelBackend(AscenderModelBackend):
    """The name the local backend carried before, kept so old sessions still load.

    Nothing here is referenced by import. Every logged in session records the
    dotted path of the backend that authenticated it as _auth_user_backend, and
    django only loads a session whose recorded backend is listed in
    AUTHENTICATION_BACKENDS. Sessions opened before the rename recorded this
    path, so dropping it would log out everyone holding one at their next
    request, with a symptom that names none of that. Both paths are therefore
    listed.

    Sessions are the only thing that needs this. AUTHENTICATION_BACKENDS is a
    read only setting computed from the defaults, never stored in the database,
    so no stored configuration names the old path. Sessions expire after
    SESSION_COOKIE_AGE, so once a release has been out longer than that, no
    live session can carry the old path and this alias, its entry in
    AUTHENTICATION_BACKENDS and the one in AuthenticationBackendsField can be
    removed in a later release.

    Being listed also means django offers it every login, and as a plain alias it
    checked the password a second time, so each failed local login was attempted
    twice. Only get_user is needed to restore a session, so this subclass
    inherits that and declines to authenticate.
    """

    def authenticate(self, request, **kwargs):
        return None
