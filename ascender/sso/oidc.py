# Copyright (c) 2026 Ascender contributors
# All Rights Reserved.

"""
What an OIDC login knows about a user, and what it does with it.

Both the generic OIDC backend and the Microsoft Entra ID one hand over the
claims of a validated ID token, so the steps here serve both, each reading its
own SOCIAL_AUTH_OIDC_ or SOCIAL_AUTH_ENTRA_ID_ settings.  The social auth
pipeline is shared by every social backend, so each step does nothing for a
login through any other.
"""

import logging
from urllib.parse import urlencode, urlsplit

from django.conf import settings

from social_core.backends.open_id_connect import OpenIdConnectAuth
from social_core.exceptions import AuthForbidden
from social_core.utils import setting_name
from social_django.utils import load_strategy

from ascender.main.constants import ASCENDER_URL_BASE_PLACEHOLDER
from ascender.sso.entra import ENTRA_ID_BACKEND_NAME, EntraIDOAuth2
from ascender.sso.triggers import UNUSABLE_RULE, evaluate_trigger_rule, resolve_membership

logger = logging.getLogger('ascender.sso.oidc')

OIDC_BACKEND_NAME = 'oidc'

#: The backends whose logins the steps here act on, by name.
OIDC_BACKENDS = {
    OIDC_BACKEND_NAME: OpenIdConnectAuth,
    ENTRA_ID_BACKEND_NAME: EntraIDOAuth2,
}

#: What the token endpoint hands back next to the userinfo claims.  None of it
#: is a fact about the user, the tokens are credentials, and the rest would
#: otherwise shadow ID token claims of the same name.
TOKEN_RESPONSE_KEYS = frozenset(
    (
        'access_token',
        'id_token',
        'refresh_token',
        'token_type',
        'expires_in',
        'ext_expires_in',
        'refresh_expires_in',
        'scope',
        'session_state',
        'not-before-policy',
    )
)


def is_oidc(backend):
    """True for a login through generic OIDC or Entra ID."""
    return getattr(backend, 'name', None) in OIDC_BACKENDS


def _setting_name(backend, name):
    # For log lines, which should name the setting an admin has to go and fix.
    return setting_name(backend.name, name)


def oidc_claims(backend, response):
    """
    The claims the provider made about the user.

    The ID token is validated by the backend before the pipeline runs and kept on
    it.  The response is the token endpoint's reply with the userinfo reply laid
    over it, or for Entra ID, which has no userinfo worth asking, the ID token's
    claims.  Providers disagree about which of the two carries groups, so both
    are read, the userinfo answer winning where they overlap.
    """
    claims = {}
    id_token = getattr(backend, 'id_token', None)
    if isinstance(id_token, dict):
        claims.update(id_token)
    if isinstance(response, dict):
        claims.update((key, value) for key, value in response.items() if key not in TOKEN_RESPONSE_KEYS)
    return claims


def _claim_path(claims, name):
    """
    Look a claim up by name, or failing that by a dotted path into nested claims.

    The exact name is tried first because some providers use claim names that
    contain dots themselves, Entra ID's schema URLs being the common case.
    """
    if name in claims:
        return claims[name]
    if '.' not in name:
        return None
    value = claims
    for part in name.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def oidc_groups(claims, groups_claim):
    """
    The group names found under groups_claim, or None if the token does not say.

    A claim that is missing altogether is not an empty list of groups.  It is
    what a provider sends when the scope or mapper for groups is gone, or, for
    Entra ID, when the user is in too many groups to fit in the token and it
    names a _claim_sources endpoint instead.  Treating that as no groups would
    have has_not rules let everyone through and remove take roles from everyone.
    """
    if not groups_claim or groups_claim in (claims.get('_claim_names') or {}):
        return None
    value = _claim_path(claims, groups_claim)
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return None


def _attribute_value(value):
    # JSON booleans would otherwise be compared as Python prints them, so a
    # rule asking for email_verified equal to "true" would never match.
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return value


def oidc_attributes(claims, prefix=''):
    """
    The claims as the attributes a trigger rule matches against.

    Nested claims are also offered under their dotted path, so Keycloak's
    realm_access.roles can be matched like any other attribute.
    """
    attributes = {}
    # Nested claims first, so that a claim whose own name has a dot in it wins
    # over the same path through nested ones, as it does for the groups claim.
    for key, value in claims.items():
        if isinstance(value, dict):
            attributes.update(oidc_attributes(value, '{}{}.'.format(prefix, key)))
    for key, value in claims.items():
        name = '{}{}'.format(prefix, key)
        if isinstance(value, dict):
            continue
        elif isinstance(value, list):
            attributes[name] = [_attribute_value(item) for item in value if item is not None and not isinstance(item, (dict, list))]
        elif value is not None:
            attributes[name] = _attribute_value(value)
    return attributes


class OIDCIdentity:
    """The groups and attributes an OIDC login offers to trigger rules."""

    def __init__(self, backend, response):
        self.label = 'Entra ID' if backend.name == ENTRA_ID_BACKEND_NAME else 'OIDC'
        self.claims = oidc_claims(backend, response)
        self.groups_claim = backend.setting('GROUPS_CLAIM', 'groups')
        self._attributes = None

    def groups(self):
        return oidc_groups(self.claims, self.groups_claim)

    def attributes(self):
        if self._attributes is None:
            self._attributes = oidc_attributes(self.claims)
        return self._attributes

    def evaluate(self, triggers, map_id):
        return evaluate_trigger_rule(triggers, self.groups, self.attributes, map_id)

    def resolve(self, triggers, map_id, fallback, remove):
        return resolve_membership(triggers, self.groups, self.attributes, map_id, fallback, remove)


def check_login_allowed(backend, details, response=None, *args, **kwargs):
    """
    Refuse an OIDC login that the backend's LOGIN_TRIGGERS rule does not match.

    This runs before the user is looked up or created, so someone the rule turns
    away does not get an account out of trying.  A rule that cannot be evaluated
    turns everyone away: letting everyone in because of a typo is the worse of
    the two ways to fail.
    """
    if not is_oidc(backend):
        return
    triggers = backend.setting('LOGIN_TRIGGERS')
    if not triggers:
        return

    username = details.get('username') or details.get('email') or kwargs.get('uid')
    identity = OIDCIdentity(backend, response)
    state = identity.evaluate(triggers, '{} login'.format(identity.label))
    if state is UNUSABLE_RULE:
        logger.error("Refusing the %s login of %s because %s cannot be evaluated", identity.label, username, _setting_name(backend, 'LOGIN_TRIGGERS'))
        raise AuthForbidden(backend)
    if state is not True:
        logger.info("Refusing the %s login of %s, who does not match %s", identity.label, username, _setting_name(backend, 'LOGIN_TRIGGERS'))
        raise AuthForbidden(backend)


def strip_username_domain(backend, details, *args, **kwargs):
    """
    Keep only the part before the @ of a new OIDC user's username.

    With the backend's USERNAME_STRIP_DOMAIN on, fernando.roca@example.com
    becomes fernando.roca.  That is for providers such as Entra ID, whose
    tokens carry the user principal name or the email but not the short name
    people use.  It runs before the username is picked, so it only shapes
    accounts being created: an existing account is found by the provider's
    subject and keeps its name.  Two users whose addresses differ only in the
    domain come out with the same name, and the second one gets the random
    suffix social auth adds to any name already taken.
    """
    if not is_oidc(backend) or not backend.setting('USERNAME_STRIP_DOMAIN', False):
        return
    username = details.get('username')
    if not isinstance(username, str):
        return
    local_part = username.split('@', 1)[0]
    if not local_part or local_part == username:
        return
    return {'details': dict(details, username=local_part)}


#: The user flags the USER_FLAGS setting manages, by the name its keys use.
USER_FLAGS = (
    ('superuser', 'is_superuser'),
    ('system_auditor', 'is_system_auditor'),
)


def update_user_flags(backend, details, user=None, response=None, *args, **kwargs):
    """
    Grant or revoke superuser and system auditor from the backend's USER_FLAGS.

    A flag without a rule is left alone, so turning this on for auditors does
    not touch who is a superuser.  With a rule, a user who matches gets the flag,
    and one who does not loses it unless remove_<flag>s is false.
    """
    if not user or not is_oidc(backend):
        return
    user_flags = backend.setting('USER_FLAGS')
    if not user_flags or not isinstance(user_flags, dict):
        return

    identity = OIDCIdentity(backend, response)
    save = False
    for flag, attribute in USER_FLAGS:
        triggers = user_flags.get('triggers_{}'.format(flag))
        if not triggers:
            continue
        remove = bool(user_flags.get('remove_{}s'.format(flag), True))
        state = identity.resolve(triggers, '{} user flag {}'.format(identity.label, flag), lambda: None, remove)
        if state is None or state == bool(getattr(user, attribute)):
            continue
        logger.info("%s %s %s from the %s user flags", 'Granting' if state else 'Revoking', flag, user.username, identity.label)
        setattr(user, attribute, state)
        # is_system_auditor is a role, which its setter writes on its own.
        save = save or attribute == 'is_superuser'
    if save:
        user.save(update_fields=['is_superuser'])


def _post_logout_redirect_url(backend, request):
    # Read straight from the settings: social auth's strategy takes any setting
    # whose name ends in _URL for a view to reverse, and an empty one breaks it.
    url = getattr(settings, _setting_name(backend, 'POST_LOGOUT_REDIRECT_URL'), '')
    if url:
        return url
    base = getattr(settings, 'ASCENDER_URL_BASE', '')
    if not base or base.rstrip('/') == ASCENDER_URL_BASE_PLACEHOLDER:
        # No provider would accept the placeholder, and the user would be left
        # on its error page, so come back to where the logout was asked from.
        return request.build_absolute_uri('/')
    return base.rstrip('/') + '/'


def _provider_configuration(backend):
    # The two backends keep their copy of the discovery document under
    # different names.
    if isinstance(backend, EntraIDOAuth2):
        return backend.openid_configuration()
    return backend.oidc_config()


def idp_logout_url(request):
    """
    Where to send the browser to end the user's session at the OIDC provider too.

    None unless this session was opened through generic OIDC or Entra ID and
    that backend's LOGOUT_FROM_IDP is on.  Must be called before the local
    session is flushed, since both what backend logged the user in and who the
    user is live there.
    """
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None
    backend_name = request.session.get('social_auth_last_login_backend')
    if backend_name not in OIDC_BACKENDS:
        return None
    backend = OIDC_BACKENDS[backend_name](load_strategy(request))
    if not backend.setting('LOGOUT_FROM_IDP', False):
        return None

    try:
        end_session_endpoint = _provider_configuration(backend).get('end_session_endpoint')
    except Exception:
        logger.exception("Could not read the %s provider configuration, %s is only logged out of Ascender", backend_name, user.username)
        return None
    if not end_session_endpoint:
        logger.warning("The %s provider does not advertise an end_session_endpoint, %s is only logged out of Ascender", backend_name, user.username)
        return None
    # The browser is sent wherever this points, so it has to be a web address.
    # A discovery document is the provider's to get wrong, and whatever it says
    # must not stop the local logout from happening.
    try:
        endpoint = urlsplit(end_session_endpoint) if isinstance(end_session_endpoint, str) else None
    except ValueError:
        endpoint = None
    if endpoint is None or endpoint.scheme not in ('https', 'http') or not endpoint.netloc:
        logger.warning("The %s provider's end_session_endpoint is not an http(s) URL, %s is only logged out of Ascender", backend_name, user.username)
        return None

    params = {
        'client_id': backend.get_key_and_secret()[0],
        'post_logout_redirect_uri': _post_logout_redirect_url(backend, request),
    }
    social = user.social_auth.filter(provider=backend_name).order_by('-modified').first()
    id_token = social.extra_data.get('id_token') if social else None
    if id_token:
        params['id_token_hint'] = id_token
    return '{}{}{}'.format(end_session_endpoint, '&' if '?' in end_session_endpoint else '?', urlencode(params))
