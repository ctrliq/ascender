import pytest

from ascender.sso.oidc import oidc_attributes, oidc_claims, oidc_groups


class FakeBackend:
    name = 'oidc'

    def __init__(self, id_token=None):
        self.id_token = id_token


class TestOIDCClaims:
    def test_userinfo_is_laid_over_the_id_token(self):
        backend = FakeBackend({'sub': '1', 'groups': ['from-token'], 'email': 'a@example.com'})
        claims = oidc_claims(backend, {'sub': '1', 'groups': ['from-userinfo']})
        assert claims == {'sub': '1', 'groups': ['from-userinfo'], 'email': 'a@example.com'}

    def test_the_token_response_is_not_claims(self):
        response = {'access_token': 'x', 'id_token': 'y', 'refresh_token': 'z', 'scope': 'openid', 'token_type': 'Bearer', 'email': 'a@example.com'}
        assert oidc_claims(FakeBackend({'scope': 'from-token'}), response) == {'scope': 'from-token', 'email': 'a@example.com'}

    def test_no_id_token_and_no_response(self):
        assert oidc_claims(FakeBackend(), None) == {}


class TestOIDCGroups:
    @pytest.mark.parametrize(
        'claims, groups_claim, expected',
        [
            ({'groups': ['a', 'b']}, 'groups', ['a', 'b']),
            ({'groups': 'a'}, 'groups', ['a']),
            ({'groups': ['a', 1, None, {'x': 1}]}, 'groups', ['a']),
            ({'groups': []}, 'groups', []),
            # Not sent at all is not the same as no groups: it is unknown.
            ({}, 'groups', None),
            ({'groups': ['a']}, '', None),
            ({'groups': {'a': 1}}, 'groups', None),
            # Entra ID group overage: the groups are behind another endpoint.
            ({'_claim_names': {'groups': 'src1'}, '_claim_sources': {'src1': {}}}, 'groups', None),
            # Keycloak's realm roles live in a nested claim.
            ({'realm_access': {'roles': ['admin']}}, 'realm_access.roles', ['admin']),
            ({'realm_access': ['admin']}, 'realm_access.roles', None),
            # Entra ID names claims with URLs, dots and all.
            ({'http://schemas.example.com/claims/groups': ['g']}, 'http://schemas.example.com/claims/groups', ['g']),
        ],
    )
    def test_groups(self, claims, groups_claim, expected):
        assert oidc_groups(claims, groups_claim) == expected


class TestOIDCAttributes:
    def test_nested_claims_are_offered_by_dotted_path(self):
        attributes = oidc_attributes({'realm_access': {'roles': ['admin', 'user']}, 'email': 'a@example.com'})
        assert attributes == {'realm_access.roles': ['admin', 'user'], 'email': 'a@example.com'}

    def test_booleans_read_the_way_they_were_sent(self):
        assert oidc_attributes({'email_verified': True, 'flags': [False]}) == {'email_verified': 'true', 'flags': ['false']}

    def test_a_claim_named_with_a_dot_wins_over_the_nested_path(self):
        assert oidc_attributes({'a.b': 'exact', 'a': {'b': 'nested'}})['a.b'] == 'exact'
        assert oidc_attributes({'a': {'b': 'nested'}, 'a.b': 'exact'})['a.b'] == 'exact'

    def test_nulls_and_containers_inside_lists_are_dropped(self):
        assert oidc_attributes({'missing': None, 'mixed': ['a', None, ['b'], {'c': 1}]}) == {'mixed': ['a']}
