# Copyright (c) 2026 Ascender contributors
# All Rights Reserved.

"""
What the generic OIDC login knows about a user, and what it does with it.

The social auth pipeline is shared by every social backend, so each step here
does nothing unless the login is coming through the generic OIDC backend.
"""

import logging
from urllib.parse import urlencode, urlsplit

from django.conf import settings

from social_core.backends.open_id_connect import OpenIdConnectAuth
from social_core.exceptions import AuthForbidden
from social_django.utils import load_strategy

from ascender.sso.triggers import UNUSABLE_RULE, evaluate_trigger_rule, resolve_membership

logger = logging.getLogger('ascender.sso.oidc')

OIDC_BACKEND_NAME = 'oidc'

#: What the token endpoint hands back next to the userinfo claims.  None of it
#: is a fact about the user, the tokens are credentials, and the rest would
#: otherwise shadow ID token claims of the same name.
TOKEN_RESPONSE_KEYS = frozenset(
    ('access_token', 'id_token', 'refresh_token', 'token_type', 'expires_in', 'refresh_expires_in', 'scope', 'session_state', 'not-before-policy')
)


def is_oidc(backend):
    return getattr(backend, 'name', None) == OIDC_BACKEND_NAME


def oidc_claims(backend, response):
    """
    The claims the provider made about the user.

    The ID token is validated by the backend before the pipeline runs and kept on
    it.  The response is the token endpoint's reply with the userinfo reply laid
    over it.  Providers disagree about which of the two carries groups, so both
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
    Refuse an OIDC login that SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS does not match.

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
    state = OIDCIdentity(backend, response).evaluate(triggers, 'OIDC login')
    if state is UNUSABLE_RULE:
        logger.error("Refusing the OIDC login of %s because SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS cannot be evaluated", username)
        raise AuthForbidden(backend)
    if state is not True:
        logger.info("Refusing the OIDC login of %s, who does not match SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS", username)
        raise AuthForbidden(backend)


def strip_username_domain(backend, details, *args, **kwargs):
    """
    Keep only the part before the @ of a new OIDC user's username.

    With SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN on, fernando.roca@example.com
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


#: The user flags SOCIAL_AUTH_OIDC_USER_FLAGS manages, by the name its keys use.
USER_FLAGS = (
    ('superuser', 'is_superuser'),
    ('system_auditor', 'is_system_auditor'),
)


def update_user_flags(backend, details, user=None, response=None, *args, **kwargs):
    """
    Grant or revoke superuser and system auditor from SOCIAL_AUTH_OIDC_USER_FLAGS.

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
        state = identity.resolve(triggers, 'OIDC user flag {}'.format(flag), lambda: None, remove)
        if state is None or state == bool(getattr(user, attribute)):
            continue
        logger.info("%s %s %s from the OIDC user flags", 'Granting' if state else 'Revoking', flag, user.username)
        setattr(user, attribute, state)
        # is_system_auditor is a role, which its setter writes on its own.
        save = save or attribute == 'is_superuser'
    if save:
        user.save(update_fields=['is_superuser'])


#: What ASCENDER_URL_BASE says until someone sets it.
UNSET_URL_BASE = 'https://ascenderhost'


def _post_logout_redirect_url(request):
    url = getattr(settings, 'SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL', '')
    if url:
        return url
    base = getattr(settings, 'ASCENDER_URL_BASE', '') or UNSET_URL_BASE
    if base.rstrip('/') == UNSET_URL_BASE:
        # No provider would accept the placeholder, and the user would be left
        # on its error page, so come back to where the logout was asked from.
        return request.build_absolute_uri('/')
    return base.rstrip('/') + '/'


def idp_logout_url(request):
    """
    Where to send the browser to end the user's session at the OIDC provider too.

    None unless SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP is on and this session was
    opened through OIDC.  Must be called before the local session is flushed,
    since both what backend logged the user in and who the user is live there.
    """
    if not getattr(settings, 'SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP', False):
        return None
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None
    if request.session.get('social_auth_last_login_backend') != OIDC_BACKEND_NAME:
        return None

    backend = OpenIdConnectAuth(load_strategy(request))
    try:
        end_session_endpoint = backend.oidc_config().get('end_session_endpoint')
    except Exception:
        logger.exception("Could not read the OIDC provider configuration, %s is only logged out of Ascender", user.username)
        return None
    if not end_session_endpoint:
        logger.warning("The OIDC provider does not advertise an end_session_endpoint, %s is only logged out of Ascender", user.username)
        return None
    # The browser is sent wherever this points, so it has to be a web address.
    if urlsplit(end_session_endpoint).scheme not in ('https', 'http'):
        logger.warning("The OIDC provider's end_session_endpoint is not an http(s) URL, %s is only logged out of Ascender", user.username)
        return None

    params = {
        'client_id': backend.get_key_and_secret()[0],
        'post_logout_redirect_uri': _post_logout_redirect_url(request),
    }
    social = user.social_auth.filter(provider=OIDC_BACKEND_NAME).order_by('-modified').first()
    id_token = social.extra_data.get('id_token') if social else None
    if id_token:
        params['id_token_hint'] = id_token
    return '{}{}{}'.format(end_session_endpoint, '&' if '?' in end_session_endpoint else '?', urlencode(params))
