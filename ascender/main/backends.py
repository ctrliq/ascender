import logging

from ascender.settings.typed import settings
from django.contrib.auth.backends import ModelBackend

logger = logging.getLogger('awx.main.backends')


class AWXModelBackend(ModelBackend):
    """The local authentication backend.

    Keeps the AWX name deliberately. AUTHENTICATION_BACKENDS names this class by
    its dotted path rather than importing it, the path is offered as a choice in
    the authentication settings, and a deployment that has set that setting has
    the old string stored. Renaming the class would leave that string pointing
    at nothing, and the symptom is a login that stops working rather than
    anything that names the cause.
    """

    def authenticate(self, request, **kwargs):
        if settings.DISABLE_LOCAL_AUTH:
            logger.warning(f"User '{kwargs['username']}' attempted login through the disabled local authentication system.")
            return
        return super().authenticate(request, **kwargs)
