# Copyright (c) 2026 CIQ, Inc.
# All Rights Reserved.

"""
Regression tests for the SAML identity provider wrapper.

social-auth-core 5.0 made two breaking changes that Ascender's subclass has to
track, and neither was caught by the existing suite when the pin was lifted:

  1. SAMLIdentityProvider.__init__ gained ``backend`` as its first positional
     argument, so SAMLAuth.get_idp must pass itself through.
  2. get_attr's third argument became a *tuple* of candidate attribute names
     (plus a keyword-only validate_defaults), rather than a single name.

The first breaks SAML login initiation outright. The second is worse in
practice because it fails silently: every user detail maps to None unless the
IdP config names every attribute explicitly.

The candidate tuples are ordered, and every one of them leads with the OID that
4.x passed as its single default. That ordering is what keeps identities stable
across the upgrade, so the fixtures below give each OID and its friendly-name
alias *different* values and assert the OID wins.
"""

import inspect
from unittest import mock

import pytest

from social_core.backends.saml import OID_MAIL, OID_USERID, SAMLIdentityProvider
from social_core.exceptions import AuthInvalidParameter

from awx.sso.backends import SAMLAuth, TowerSAMLIdentityProvider

IDP_CONF = {
    'entity_id': 'https://idp.example.com/metadata',
    'url': 'https://idp.example.com/sso',
    'x509cert': 'notarealcert',
}

# Each OID and its friendly-name alias carry distinct values on purpose, so a
# regression in candidate ordering is detectable rather than silently passing.
ATTRIBUTES = {
    OID_USERID: ['jamie'],
    'username': ['jamie.alias'],
    OID_MAIL: ['jamie@example.com'],
    'email': ['alias@example.com'],
    'first_name': ['Jamie'],
    'last_name': ['Doe'],
}


@pytest.fixture(autouse=True)
def quiet_logger():
    """Isolate these unit tests from AWX's logging configuration.

    The console handler's dynamic_level_filter reads DB-backed settings, so any
    logger.warning() from the code under test would try to open a database
    connection and fail under pytest-django's no-DB default. Patching the
    module logger keeps these as true unit tests and gives the warning
    assertion something deterministic to check.
    """
    with mock.patch('awx.sso.backends.logger') as patched:
        yield patched


def _idp(**extra):
    return TowerSAMLIdentityProvider(object(), 'test', **dict(IDP_CONF, **extra))


def test_init_signature_matches_upstream():
    """Guard against upstream changing __init__ under us again."""
    params = list(inspect.signature(SAMLIdentityProvider.__init__).parameters)
    assert params[:3] == ['self', 'backend', 'name']


def test_get_attr_signature_matches_upstream():
    """The companion guard for get_attr, which broke silently rather than loudly."""
    params = inspect.signature(SAMLIdentityProvider.get_attr).parameters
    assert list(params)[:4] == ['self', 'attributes', 'conf_key', 'default_attributes']
    assert 'validate_defaults' in params


def test_get_idp_passes_backend_through():
    """SAMLAuth.get_idp must satisfy the upstream __init__ signature.

    Without the backend argument this raises TypeError inside auth_url(), which
    Ascender's SSO middleware converts into a bare redirect to /sso/error/. The
    user just sees the login page reload with no error surfaced.
    """
    backend = SAMLAuth.__new__(SAMLAuth)
    backend.setting = lambda key, default=None: {'ENABLED_IDPS': {'test': IDP_CONF}}[key]

    idp = SAMLAuth.get_idp(backend, 'test')

    assert isinstance(idp, TowerSAMLIdentityProvider)
    assert idp.name == 'test'
    assert idp.backend is backend


def test_get_attr_accepts_upstream_candidate_tuples():
    """Unconfigured attributes must resolve via upstream's default tuples."""
    details = _idp().get_user_details(ATTRIBUTES)

    assert details['first_name'] == 'Jamie'
    assert details['last_name'] == 'Doe'


def test_get_attr_prefers_the_oid_over_a_friendly_name_alias():
    """Candidate order decides identity mapping; the OID must stay first.

    If this flips, existing users silently re-map to a different SAML attribute
    on upgrade.
    """
    details = _idp().get_user_details(ATTRIBUTES)

    assert details['username'] == 'jamie'
    assert details['email'] == 'jamie@example.com'


def test_get_attr_honors_explicit_configuration():
    details = _idp(attr_email='email', attr_username='username').get_user_details(ATTRIBUTES)

    assert details['email'] == 'alias@example.com'
    assert details['username'] == 'jamie.alias'


def test_get_attr_explicit_none_disables_attribute():
    """An explicit None means "ignore", and must not fall back to defaults.

    Not reachable through Settings > Authentication today, since the attr_*
    fields reject null, but it is upstream's contract and a legacy database
    value can still hold one.
    """
    assert _idp(attr_email=None).get_user_details(ATTRIBUTES)['email'] is None


def test_get_attr_missing_configured_attribute_returns_none():
    """Diverges from upstream deliberately: warn and degrade, do not raise."""
    assert _idp(attr_email='not_sent_by_idp').get_user_details(ATTRIBUTES)['email'] is None


def test_get_attr_accepts_validate_defaults_without_raising():
    """Upstream may pass validate_defaults; accepting it must not TypeError.

    Ascender does not honor the flag, so the absent case still returns None
    rather than raising. Asserting the absent case is the point: the present
    case would pass either way.
    """
    value = _idp().get_attr({}, 'attr_email', ('email',), validate_defaults=True)

    assert value is None


@pytest.mark.parametrize(
    'raw, expected',
    [
        (['a', 'b'], 'a'),
        ('a', 'a'),
        ([], None),
        ('', None),
        ([''], None),
        (['   '], None),
    ],
)
def test_get_attr_blank_and_list_attribute_values(raw, expected):
    """Blank values are a mapping failure, not a value.

    Returning '' would blank out first_name/last_name on existing users, since
    the user_details pipeline step only skips None.
    """
    assert _idp(attr_email='email').get_attr({'email': raw}, 'attr_email', ()) == expected


def test_get_attr_warns_when_a_detail_cannot_be_mapped(quiet_logger):
    """The warning is the operator's only signal that a mapping is wrong."""
    _idp(attr_email='not_sent_by_idp').get_user_details(ATTRIBUTES)

    assert any(call.args[4] == 'attr_email' for call in quiet_logger.warning.call_args_list)


def test_get_user_permanent_id_prefers_the_oid():
    assert _idp().get_user_permanent_id(ATTRIBUTES) == 'jamie'


def test_get_user_permanent_id_falls_back_to_name_id():
    """Upstream PERSISTENT_FIELDS fallback. The old override raised KeyError here."""
    assert _idp().get_user_permanent_id({'name_id': 'abc123'}) == 'abc123'


@pytest.mark.parametrize('attributes', [{}, {OID_USERID: []}, {OID_USERID: ['']}])
def test_get_user_permanent_id_rejects_a_missing_or_blank_uid(attributes):
    """A blank permanent id collides every user from the IdP onto one identity.

    The old override returned '' or raised IndexError/KeyError here.
    """
    with pytest.raises(AuthInvalidParameter):
        _idp().get_user_permanent_id(attributes)
