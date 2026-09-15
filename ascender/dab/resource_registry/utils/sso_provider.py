import logging

logger = logging.getLogger('awx.dab.resource_registry.utils.sso_provider')

try:
    from social_django.utils import load_strategy
except ImportError:
    load_strategy = None


def get_sso_provider_server(backend_name: str, uid: str):
    """
    Returns the hostname for the SSO server that authenticated this user.
    """

    # If this function fails for any reason it will cause the resources API
    # to break. There are too many potential permutations of SSO configurations
    # to handle all of failure modes here. This function will try its best to get
    # the server url, but if anything fails, we should just return None rather than
    # break. There are a few backends that we do care about, and these will be
    # tested to make sure that they work, but it doesn't matter if some just
    # return None.
    try:
        if load_strategy is None:
            logger.debug("Cannot get SSO backend. 'social_django' (social-auth-app-django) is not installed.")
            return (None, uid)

        social_strat = load_strategy()

        try:
            backend = social_strat.get_backend(backend_name)
        except TypeError:
            return (None, uid)

        if hasattr(backend, "get_idp"):
            idp, real_uid = uid.split(":", maxsplit=1)
            return (backend.get_idp(idp).entity_id, real_uid)

        elif hasattr(backend, "authorization_url"):
            return (backend.authorization_url(), uid)
        else:
            return (None, uid)
    except Exception as e:  # noqa E722
        logger.warning(f"Failed to parse server url from {backend_name}, {e}")
        return (None, uid)
