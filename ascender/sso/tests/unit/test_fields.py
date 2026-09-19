import pytest
from unittest import mock

from rest_framework.exceptions import ValidationError

from ascender.sso.fields import (
    SAMLOrgAttrField,
    SAMLTeamAttrField,
    SAMLUserFlagsAttrField,
    LDAPGroupTypeParamsField,
    LDAPServerURIField,
    LDAPSingleTeamMapField,
    LDAPTriggersField,
)


class TestSAMLOrgAttrField:
    @pytest.mark.parametrize(
        "data, expected",
        [
            ({}, {}),
            ({'remove': True, 'saml_attr': 'foobar'}, {'remove': True, 'saml_attr': 'foobar'}),
            ({'remove': True, 'saml_attr': 1234}, {'remove': True, 'saml_attr': '1234'}),
            ({'remove': True, 'saml_attr': 3.14}, {'remove': True, 'saml_attr': '3.14'}),
            ({'saml_attr': 'foobar'}, {'saml_attr': 'foobar'}),
            ({'remove': True}, {'remove': True}),
            ({'remove': True, 'saml_admin_attr': 'foobar'}, {'remove': True, 'saml_admin_attr': 'foobar'}),
            ({'saml_admin_attr': 'foobar'}, {'saml_admin_attr': 'foobar'}),
            ({'remove_admins': True, 'saml_admin_attr': 'foobar'}, {'remove_admins': True, 'saml_admin_attr': 'foobar'}),
            (
                {'remove': True, 'saml_attr': 'foo', 'remove_admins': True, 'saml_admin_attr': 'bar'},
                {'remove': True, 'saml_attr': 'foo', 'remove_admins': True, 'saml_admin_attr': 'bar'},
            ),
        ],
    )
    def test_internal_value_valid(self, data, expected):
        field = SAMLOrgAttrField()
        res = field.to_internal_value(data)
        assert res == expected

    @pytest.mark.parametrize(
        "data, expected",
        [
            ({'remove': 'blah', 'saml_attr': 'foobar'}, {'remove': ['Must be a valid boolean.']}),
            ({'remove': True, 'saml_attr': False}, {'saml_attr': ['Not a valid string.']}),
            (
                {'remove': True, 'saml_attr': False, 'foo': 'bar', 'gig': 'ity'},
                {'saml_attr': ['Not a valid string.'], 'foo': ['Invalid field.'], 'gig': ['Invalid field.']},
            ),
            ({'remove_admins': True, 'saml_admin_attr': False}, {'saml_admin_attr': ['Not a valid string.']}),
            ({'remove_admins': 'blah', 'saml_admin_attr': 'foobar'}, {'remove_admins': ['Must be a valid boolean.']}),
        ],
    )
    def test_internal_value_invalid(self, data, expected):
        field = SAMLOrgAttrField()
        with pytest.raises(ValidationError) as e:
            field.to_internal_value(data)
        assert e.value.detail == expected


class TestSAMLTeamAttrField:
    @pytest.mark.parametrize(
        "data",
        [
            {},
            {'remove': True, 'saml_attr': 'foobar', 'team_org_map': []},
            {'remove': True, 'saml_attr': 'foobar', 'team_org_map': [{'team': 'Engineering', 'organization': 'Ansible'}]},
            {
                'remove': True,
                'saml_attr': 'foobar',
                'team_org_map': [
                    {'team': 'Engineering', 'organization': 'Ansible'},
                    {'team': 'Engineering', 'organization': 'Ansible2'},
                    {'team': 'Engineering2', 'organization': 'Ansible'},
                ],
            },
            {
                'remove': True,
                'saml_attr': 'foobar',
                'team_org_map': [
                    {'team': 'Engineering', 'organization': 'Ansible'},
                    {'team': 'Engineering', 'organization': 'Ansible2'},
                    {'team': 'Engineering2', 'organization': 'Ansible'},
                ],
            },
            {
                'remove': True,
                'saml_attr': 'foobar',
                'team_org_map': [
                    {'team': 'Engineering', 'team_alias': 'Engineering Team', 'organization': 'Ansible'},
                    {'team': 'Engineering', 'organization': 'Ansible2'},
                    {'team': 'Engineering2', 'organization': 'Ansible'},
                ],
            },
        ],
    )
    def test_internal_value_valid(self, data):
        field = SAMLTeamAttrField()
        res = field.to_internal_value(data)
        assert res == data

    @pytest.mark.parametrize(
        "data, expected",
        [
            (
                {'remove': True, 'saml_attr': 'foobar', 'team_org_map': [{'team': 'foobar', 'not_a_valid_key': 'blah', 'organization': 'Ansible'}]},
                {'team_org_map': {0: {'not_a_valid_key': ['Invalid field.']}}},
            ),
            (
                {'remove': False, 'saml_attr': 'foobar', 'team_org_map': [{'organization': 'Ansible'}]},
                {'team_org_map': {0: {'team': ['This field is required.']}}},
            ),
            (
                {'remove': False, 'saml_attr': 'foobar', 'team_org_map': [{}]},
                {'team_org_map': {0: {'organization': ['This field is required.'], 'team': ['This field is required.']}}},
            ),
        ],
    )
    def test_internal_value_invalid(self, data, expected):
        field = SAMLTeamAttrField()
        with pytest.raises(ValidationError) as e:
            field.to_internal_value(data)
        assert e.value.detail == expected


class TestSAMLUserFlagsAttrField:
    @pytest.mark.parametrize(
        "data",
        [
            {},
            {'is_superuser_attr': 'something'},
            {'is_superuser_value': ['value']},
            {'is_superuser_role': ['my_peeps']},
            {'remove_superusers': False},
            {'is_system_auditor_attr': 'something_else'},
            {'is_system_auditor_value': ['value2']},
            {'is_system_auditor_role': ['other_peeps']},
            {'remove_system_auditors': False},
        ],
    )
    def test_internal_value_valid(self, data):
        field = SAMLUserFlagsAttrField()
        res = field.to_internal_value(data)
        assert res == data

    @pytest.mark.parametrize(
        "data, expected",
        [
            (
                {
                    'junk': 'something',
                    'is_superuser_value': 'value',
                    'is_superuser_role': 'my_peeps',
                    'is_system_auditor_attr': 'else',
                    'is_system_auditor_value': 'value2',
                    'is_system_auditor_role': 'other_peeps',
                },
                {
                    'junk': ['Invalid field.'],
                    'is_superuser_role': ['Expected a list of items but got type "str".'],
                    'is_superuser_value': ['Expected a list of items but got type "str".'],
                    'is_system_auditor_role': ['Expected a list of items but got type "str".'],
                    'is_system_auditor_value': ['Expected a list of items but got type "str".'],
                },
            ),
            (
                {
                    'junk': 'something',
                },
                {
                    'junk': ['Invalid field.'],
                },
            ),
            (
                {
                    'junk': 'something',
                    'junk2': 'else',
                },
                {
                    'junk': ['Invalid field.'],
                    'junk2': ['Invalid field.'],
                },
            ),
            # make sure we can't pass a string to the boolean fields
            (
                {
                    'remove_superusers': 'test',
                    'remove_system_auditors': 'test',
                },
                {
                    "remove_superusers": ["Must be a valid boolean."],
                    "remove_system_auditors": ["Must be a valid boolean."],
                },
            ),
        ],
    )
    def test_internal_value_invalid(self, data, expected):
        field = SAMLUserFlagsAttrField()
        with pytest.raises(ValidationError) as e:
            field.to_internal_value(data)
        print(e.value.detail)
        assert e.value.detail == expected


class TestLDAPGroupTypeParamsField:
    @pytest.mark.parametrize(
        "group_type, data, expected",
        [
            ('LDAPGroupType', {'name_attr': 'user', 'bob': ['a', 'b'], 'scooter': 'hello'}, ['Invalid key(s): "bob", "scooter".']),
            ('MemberDNGroupType', {'name_attr': 'user', 'member_attr': 'west', 'bob': ['a', 'b'], 'scooter': 'hello'}, ['Invalid key(s): "bob", "scooter".']),
            (
                'PosixUIDGroupType',
                {'name_attr': 'user', 'member_attr': 'west', 'ldap_group_user_attr': 'legacyThing', 'bob': ['a', 'b'], 'scooter': 'hello'},
                ['Invalid key(s): "bob", "member_attr", "scooter".'],
            ),
        ],
    )
    def test_internal_value_invalid(self, group_type, data, expected):
        field = LDAPGroupTypeParamsField()
        field.get_depends_on = mock.MagicMock(return_value=group_type)

        with pytest.raises(ValidationError) as e:
            field.to_internal_value(data)
        assert e.value.detail == expected


class TestLDAPServerURIField:
    @pytest.mark.parametrize(
        "ldap_uri, exception, expected",
        [
            (r'ldap://servername.com:444', None, r'ldap://servername.com:444'),
            (r'ldap://servername.so3:444', None, r'ldap://servername.so3:444'),
            (r'ldaps://servername3.s300:344', None, r'ldaps://servername3.s300:344'),
            (r'ldap://servername.-so3:444', ValidationError, None),
        ],
    )
    def test_run_validators_valid(self, ldap_uri, exception, expected):
        field = LDAPServerURIField()
        if exception is None:
            assert field.run_validators(ldap_uri) == expected
        else:
            with pytest.raises(exception):
                field.run_validators(ldap_uri)


class TestLDAPTriggersField:
    @pytest.mark.parametrize(
        "data",
        [
            {'always': {}},
            {'never': {}},
            {'groups': {'has_or': ['CN=viewers,OU=Groups,DC=example,DC=com']}},
            {'groups': {'has_and': ['CN=a,DC=example,DC=com', 'CN=b,DC=example,DC=com']}},
            {'groups': {'has_not': ['CN=b,DC=example,DC=com']}},
            {'attributes': {'mail': {'equals': 'someone@example.com'}}},
            {'attributes': {'join_condition': 'and', 'mail': {'ends_with': '@example.com'}, 'department': {'equals': 'Private Cloud'}}},
            {'attributes': {'mail': {'in': ['a@example.com', 'b@example.com']}}},
            {'attributes': {'department': {}}},
        ],
    )
    def test_internal_value_valid(self, data):
        assert LDAPTriggersField().to_internal_value(data) == data

    @pytest.mark.parametrize(
        "data, expected_message",
        [
            ({'group': {'has_or': ['CN=a,DC=example,DC=com']}}, 'triggers.group'),
            ({'groups': {'has_maybe': ['CN=a,DC=example,DC=com']}}, 'triggers.groups.has_maybe'),
            ({'groups': {'has_or': 'CN=a,DC=example,DC=com'}}, 'triggers.groups.has_or'),
            ({'attributes': {'join_condition': 'maybe'}}, 'triggers.attributes.join_condition'),
            ({'attributes': {'mail': {'starts_with': 'someone'}}}, 'triggers.attributes.mail.starts_with'),
            ({'attributes': {'mail': {'in': 'someone@example.com'}}}, 'triggers.attributes.mail.in'),
        ],
    )
    def test_internal_value_invalid(self, data, expected_message):
        field = LDAPTriggersField()
        with pytest.raises(ValidationError) as excinfo:
            field.to_internal_value(data)
        assert expected_message in str(excinfo.value)

    def test_a_team_map_entry_takes_a_rule_beside_its_group_dns(self):
        """
        The thing this whole change is for: naming a person in a team map without
        inventing a directory group for them.
        """
        data = {
            'organization': 'Test Org',
            'users': ['CN=viewers,OU=Groups,DC=example,DC=com'],
            'triggers': {'attributes': {'mail': {'equals': 'someone@example.com'}}},
            'remove': True,
        }
        assert LDAPSingleTeamMapField().to_internal_value(data) == data

    @pytest.mark.parametrize(
        "data, expected_message",
        [
            # Only one top level trigger type is ever evaluated, so several would
            # silently honour one and drop the rest.
            ({'always': {}, 'never': {}}, 'triggers'),
            ({'groups': {'has_or': ['CN=a,DC=example,DC=com']}, 'attributes': {'mail': {'equals': 'a@example.com'}}}, 'triggers'),
            # And the same within groups, where has_or wins over the rest.
            ({'groups': {'has_or': ['CN=a,DC=example,DC=com'], 'has_not': ['CN=b,DC=example,DC=com']}}, 'triggers.groups'),
        ],
    )
    def test_a_rule_that_would_only_be_half_applied_is_refused(self, data, expected_message):
        field = LDAPTriggersField()
        with pytest.raises(ValidationError) as excinfo:
            field.to_internal_value(data)
        assert expected_message in str(excinfo.value)

    @pytest.mark.parametrize(
        "data, expected_message",
        [
            # A rule that matches nobody would, with remove set, strip the role
            # from the whole directory rather than do nothing.
            ({'attributes': {}}, 'triggers.attributes'),
            ({'attributes': {'join_condition': 'and'}}, 'triggers.attributes'),
            ({'groups': {}}, 'triggers.groups'),
            # And a pattern that does not compile would raise on every login.
            ({'attributes': {'mail': {'matches': '['}}}, 'triggers.attributes.mail.matches'),
            ({'attributes': {'mail': {'matches': '(unclosed'}}}, 'triggers.attributes.mail.matches'),
        ],
    )
    def test_a_rule_that_could_not_work_is_refused(self, data, expected_message):
        field = LDAPTriggersField()
        with pytest.raises(ValidationError) as excinfo:
            field.to_internal_value(data)
        assert expected_message in str(excinfo.value)

    def test_a_valid_pattern_is_accepted(self):
        data = {'attributes': {'mail': {'matches': r'^.*@example\.com$'}}}
        assert LDAPTriggersField().to_internal_value(data) == data

    def test_a_rule_survives_being_read_back(self):
        """What the settings API hands the UI has to be what was saved."""
        field = LDAPSingleTeamMapField()
        data = {
            'organization': 'Test Org',
            'users': ['CN=viewers,OU=Groups,DC=example,DC=com'],
            'triggers': {'attributes': {'join_condition': 'and', 'mail': {'ends_with': '@example.com'}, 'department': {'equals': 'Private Cloud'}}},
            'remove': True,
        }
        assert field.to_representation(field.to_internal_value(data)) == data

    @pytest.mark.parametrize(
        "data, expected",
        [
            (
                {'organization': 'Test Org', 'users': ['CN=viewers,OU=Groups,DC=example,DC=com'], 'remove': True},
                {'organization': 'Test Org', 'users': ['CN=viewers,OU=Groups,DC=example,DC=com'], 'remove': True},
            ),
            # A bare string is folded by StringListBooleanField, which lowercases
            # before deciding whether it is really a boolean. Long standing, and
            # harmless because is_member_of folds the DN it compares anyway.
            (
                {'organization': 'Test Org', 'users': 'CN=viewers,OU=Groups,DC=example,DC=com'},
                {'organization': 'Test Org', 'users': 'cn=viewers,ou=groups,dc=example,dc=com'},
            ),
            ({'organization': 'Test Org', 'users': True, 'remove': False}, {'organization': 'Test Org', 'users': True, 'remove': False}),
        ],
    )
    def test_an_entry_without_a_rule_is_untouched(self, data, expected):
        """The shape every existing configuration has. No triggers key appears."""
        field = LDAPSingleTeamMapField()
        assert field.to_representation(field.to_internal_value(data)) == expected

    def test_an_email_in_the_group_dn_list_is_still_refused(self):
        """
        It is not a DN, and silently never matching is how this went unnoticed in
        the first place.
        """
        field = LDAPSingleTeamMapField()
        with pytest.raises(ValidationError):
            field.to_internal_value({'organization': 'Test Org', 'users': ['someone@example.com']})
