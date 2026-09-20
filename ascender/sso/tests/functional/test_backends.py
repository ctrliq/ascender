import copy
from unittest import mock

import pytest
from ldap.cidict import cidict

from ascender.sso.backends import _update_m2m_from_groups, _update_m2m_from_map, on_populate_user


class MockLDAPGroups(object):
    def is_member_of(self, group_dn):
        return bool(group_dn)


class MockLDAPUser(object):
    def _get_groups(self):
        return MockLDAPGroups()


@pytest.mark.parametrize(
    "setting, expected_result",
    [
        (True, True),
        ('something', True),
        (False, False),
        ('', False),
    ],
)
def test_mock_objects(setting, expected_result):
    ldap_user = MockLDAPUser()
    assert ldap_user._get_groups().is_member_of(setting) == expected_result


@pytest.mark.parametrize(
    "opts, remove, expected_result",
    [
        # In these case we will pass no opts so we should get None as a return in all cases
        (
            None,
            False,
            None,
        ),
        (
            None,
            True,
            None,
        ),
        # Next lets test with empty opts ([]) This should return False if remove is True and None otherwise
        (
            [],
            True,
            False,
        ),
        (
            [],
            False,
            None,
        ),
        # Next opts is True, this will always return True
        (
            True,
            True,
            True,
        ),
        (
            True,
            False,
            True,
        ),
        # If we get only a non-string as an option we hit a continue and will either return None or False depending on the remove flag
        (
            [32],
            False,
            None,
        ),
        (
            [32],
            True,
            False,
        ),
        # Finally we need to test whether or not a user should be allowed in or not.
        # We use a mock class for ldap_user that simply returns true/false based on the otps
        (
            ['true'],
            False,
            True,
        ),
        # In this test we are going to pass a string to test the part of the code that coverts strings into array, this should give us True
        (
            'something',
            True,
            True,
        ),
        (
            [''],
            False,
            None,
        ),
        (
            False,
            True,
            False,
        ),
        # Empty strings are considered opts == None and will result in None or False based on the remove flag
        (
            '',
            True,
            False,
        ),
        (
            '',
            False,
            None,
        ),
    ],
)
@pytest.mark.django_db
def test__update_m2m_from_groups(opts, remove, expected_result):
    ldap_user = MockLDAPUser()
    assert expected_result == _update_m2m_from_groups(ldap_user, opts, remove)


class MockTriggerGroups(object):
    """
    django-auth-ldap keeps DNs in their normal form, which is lower case
    (LDAPSearch._process_results), and is_member_of folds what it is asked about
    before comparing. The mock has to do the same or it tests a directory that
    does not exist.
    """

    def __init__(self, group_dns):
        self.group_dns = {dn.lower() for dn in group_dns}

    def get_group_dns(self):
        return self.group_dns

    def is_member_of(self, group_dn):
        return group_dn.lower() in self.group_dns


class MockTriggerUser(object):
    """An LDAP user with real group DNs and attributes, unlike MockLDAPUser above."""

    def __init__(self, group_dns=(), attrs=None):
        self.attrs = attrs if attrs is not None else {}
        self._groups = MockTriggerGroups(group_dns)

    def _get_groups(self):
        return self._groups


GROUP_DN = 'CN=patching-viewers,OU=Groups,DC=example,DC=com'
OTHER_GROUP_DN = 'CN=somebody-else,OU=Groups,DC=example,DC=com'
ATTRS = {'mail': ['christopher.pall@example.com'], 'department': ['Private Cloud'], 'cn': ['Christopher Pall']}


@pytest.mark.parametrize(
    "opts, remove, triggers, expected_result",
    [
        # Without triggers the function is the old one, including its edge cases
        (None, True, None, None),
        (None, False, None, None),
        ([], True, None, False),
        (True, True, None, True),
        ([GROUP_DN], True, None, True),
        ([OTHER_GROUP_DN], True, None, False),
        # An attribute rule matches the user
        (None, True, {'attributes': {'mail': {'equals': 'christopher.pall@example.com'}}}, True),
        (None, True, {'attributes': {'department': {'equals': 'Private Cloud'}}}, True),
        (None, True, {'attributes': {'mail': {'matches': r'^.*@example\.com$'}}}, True),
        (None, True, {'attributes': {'mail': {'ends_with': '@example.com'}}}, True),
        (None, True, {'attributes': {'mail': {'contains': 'pall'}}}, True),
        (None, True, {'attributes': {'mail': {'in': ['christopher.pall@example.com', 'someone@example.com']}}}, True),
        # An attribute the user simply has, with no value constraint
        (None, True, {'attributes': {'department': {}}}, True),
        # An attribute rule that does not match revokes when remove is set, and is a no-op otherwise
        (None, True, {'attributes': {'mail': {'equals': 'someone.else@example.com'}}}, False),
        (None, False, {'attributes': {'mail': {'equals': 'someone.else@example.com'}}}, None),
        # A rule that does not match still falls back to the group DNs beside it
        ([GROUP_DN], True, {'attributes': {'mail': {'equals': 'someone.else@example.com'}}}, True),
        ([OTHER_GROUP_DN], True, {'attributes': {'mail': {'equals': 'someone.else@example.com'}}}, False),
        # join_condition decides how several attributes combine
        (None, True, {'attributes': {'join_condition': 'and', 'mail': {'ends_with': '@example.com'}, 'department': {'equals': 'Private Cloud'}}}, True),
        (None, True, {'attributes': {'join_condition': 'and', 'mail': {'ends_with': '@example.com'}, 'department': {'equals': 'Accounts'}}}, False),
        (None, True, {'attributes': {'join_condition': 'or', 'mail': {'ends_with': '@nowhere.com'}, 'department': {'equals': 'Private Cloud'}}}, True),
        # Group triggers say what the group DN list says today
        (None, True, {'groups': {'has_or': [GROUP_DN, OTHER_GROUP_DN]}}, True),
        (None, True, {'groups': {'has_or': [OTHER_GROUP_DN]}}, False),
        (None, True, {'groups': {'has_and': [GROUP_DN]}}, True),
        (None, True, {'groups': {'has_and': [GROUP_DN, OTHER_GROUP_DN]}}, False),
        (None, True, {'groups': {'has_not': [OTHER_GROUP_DN]}}, True),
        (None, True, {'groups': {'has_not': [GROUP_DN]}}, False),
        # always and never are unconditional
        (None, True, {'always': {}}, True),
        (None, False, {'always': {}}, True),
        (None, False, {'never': {}}, False),
        ([GROUP_DN], False, {'never': {}}, False),
        # A rule that cannot be evaluated leaves the entry exactly as it would be
        # without one: the group DNs decide, and on their own they decide nothing.
        # The API refuses these, but a settings file can still put one here.
        (None, True, {'nonsense': {}}, None),
        ([GROUP_DN], True, {'nonsense': {}}, True),
        ([OTHER_GROUP_DN], True, {'nonsense': {}}, False),
        (None, True, {'always': {}, 'never': {}}, None),
        ([GROUP_DN], True, {'always': {}, 'never': {}}, True),
        (None, True, {'groups': {'has_or': [OTHER_GROUP_DN], 'has_not': [GROUP_DN]}}, None),
        # Neither an empty rule body nor a pattern that does not compile, both of
        # which would otherwise match nobody and so revoke everybody.
        (None, True, {'attributes': {}}, None),
        (None, True, {'groups': {}}, None),
        (None, True, {'attributes': {'join_condition': 'and'}}, None),
        (None, True, {'attributes': {'mail': {'matches': '['}}}, None),
        # And a rule that is not even a mapping, which a settings file can hold
        (None, True, 'always', None),
        # An empty trigger rule is no rule at all
        ([GROUP_DN], True, {}, True),
        (None, True, {}, None),
    ],
)
@pytest.mark.django_db
def test__update_m2m_from_map(opts, remove, triggers, expected_result):
    ldap_user = MockTriggerUser(group_dns=[GROUP_DN], attrs=ATTRS)
    assert expected_result == _update_m2m_from_map(ldap_user, opts, remove, triggers, 'test map')


@pytest.mark.django_db
def test__update_m2m_from_map_does_not_consume_the_rule():
    """
    The settings cache hands out the same dict on every login, so evaluating a rule
    must leave it exactly as it was found.
    """
    ldap_user = MockTriggerUser(group_dns=[GROUP_DN], attrs=ATTRS)
    triggers = {'attributes': {'join_condition': 'and', 'mail': {'ends_with': '@example.com'}, 'department': {'equals': 'Private Cloud'}}}
    before = copy.deepcopy(triggers)

    assert _update_m2m_from_map(ldap_user, None, True, triggers, 'test map') is True
    assert triggers == before
    # And the second login has to reach the same answer as the first
    assert _update_m2m_from_map(ldap_user, None, True, triggers, 'test map') is True

    # The group path folds case on its way in, which must not be folded in place
    group_triggers = {'groups': {'has_or': [GROUP_DN]}}
    before = copy.deepcopy(group_triggers)
    assert _update_m2m_from_map(ldap_user, None, True, group_triggers, 'test map') is True
    assert group_triggers == before


@pytest.mark.django_db
def test_a_group_trigger_matches_what_a_group_dn_list_matches():
    """
    The group DNs in these maps are written the way a directory prints them, and
    is_member_of folds their case. A trigger naming the same group has to reach
    the same answer, or moving a working map over to a rule breaks it silently.
    """
    ldap_user = MockTriggerUser(group_dns=[GROUP_DN], attrs=ATTRS)

    for dn in (GROUP_DN, GROUP_DN.lower(), GROUP_DN.upper()):
        by_dn_list = _update_m2m_from_map(ldap_user, [dn], True, None, 'test map')
        by_trigger = _update_m2m_from_map(ldap_user, None, True, {'groups': {'has_or': [dn]}}, 'test map')
        assert by_dn_list is True, dn
        assert by_trigger is True, dn


class MockLDAPSettings(object):
    def __init__(self, organization_map=None, team_map=None):
        self.ORGANIZATION_MAP = organization_map or {}
        self.TEAM_MAP = team_map or {}


class MockBackend(object):
    def __init__(self, settings):
        self.settings = settings


class MockPopulateUser(MockTriggerUser):
    def __init__(self, organization_map=None, team_map=None, **kwargs):
        super(MockPopulateUser, self).__init__(**kwargs)
        self.dn = 'CN=Someone,OU=People,DC=example,DC=com'
        self.backend = MockBackend(MockLDAPSettings(organization_map, team_map))


def _populate(user, **kwargs):
    """Run the populate_user receiver and return the states it asked to reconcile."""
    ldap_user = MockPopulateUser(group_dns=[GROUP_DN], attrs=ATTRS, **kwargs)
    with mock.patch('ascender.sso.backends.create_org_and_teams'), mock.patch('ascender.sso.backends.reconcile_users_org_team_mappings') as reconcile:
        on_populate_user(None, user=user, ldap_user=ldap_user)
    assert reconcile.call_count == 1
    _user, desired_org_states, desired_team_states, _source = reconcile.call_args[0]
    return desired_org_states, desired_team_states


@pytest.mark.django_db
def test_on_populate_user_reads_the_team_trigger(existing_normal_user):
    _orgs, teams = _populate(
        existing_normal_user,
        team_map={
            'Viewers': {
                'organization': 'Example Org',
                'triggers': {'attributes': {'mail': {'equals': 'christopher.pall@example.com'}}},
                'remove': True,
            },
            'Nobody': {
                'organization': 'Example Org',
                'triggers': {'attributes': {'mail': {'equals': 'someone.else@example.com'}}},
                'remove': True,
            },
        },
    )

    assert teams == {'Example Org': {'Viewers': {'member_role': True}, 'Nobody': {'member_role': False}}}


@pytest.mark.django_db
def test_on_populate_user_reads_each_org_role_trigger(existing_normal_user):
    orgs, _teams = _populate(
        existing_normal_user,
        organization_map={
            'Example Org': {
                'triggers_admins': {'attributes': {'department': {'equals': 'Private Cloud'}}},
                'triggers_users': {'groups': {'has_or': [GROUP_DN]}},
                'triggers_auditors': {'never': {}},
            }
        },
    )

    assert orgs == {'Example Org': {'admin_role': True, 'member_role': True, 'auditor_role': False}}


@pytest.mark.django_db
def test_on_populate_user_leaves_a_map_without_triggers_alone(existing_normal_user):
    """The shape every existing configuration has, which must not move."""
    orgs, teams = _populate(
        existing_normal_user,
        organization_map={'Example Org': {'admins': [OTHER_GROUP_DN], 'users': [GROUP_DN]}},
        team_map={'Viewers': {'organization': 'Example Org', 'users': [GROUP_DN]}},
    )

    assert orgs == {'Example Org': {'admin_role': False, 'member_role': True, 'auditor_role': None}}
    assert teams == {'Example Org': {'Viewers': {'member_role': True}}}


@pytest.mark.parametrize("spelling", ['sAMAccountName', 'samaccountname', 'SAMACCOUNTNAME'])
@pytest.mark.django_db
def test_an_attribute_rule_ignores_the_case_of_the_attribute_name(spelling):
    """
    LDAP attribute names are case insensitive, and django-auth-ldap decodes the
    entry into an ldap.cidict so that they behave that way. A rule has to keep
    that, because with remove set a missed lookup revokes rather than does nothing.
    """
    ldap_user = MockTriggerUser(group_dns=[GROUP_DN], attrs=cidict({'sAMAccountName': ['cpall'], 'mail': ['a@example.com']}))

    assert _update_m2m_from_map(ldap_user, None, True, {'attributes': {spelling: {'equals': 'cpall'}}}, 'test map') is True


@pytest.mark.django_db
def test_an_entry_with_no_attributes_does_not_blow_up():
    ldap_user = MockTriggerUser(group_dns=[GROUP_DN], attrs=None)

    assert _update_m2m_from_map(ldap_user, None, True, {'attributes': {'mail': {'equals': 'a@example.com'}}}, 'test map') is False
    assert _update_m2m_from_map(ldap_user, None, False, {'attributes': {'mail': {'equals': 'a@example.com'}}}, 'test map') is None


@pytest.mark.django_db
def test_remove_for_one_org_role_does_not_decide_the_others(existing_normal_user):
    """
    remove_admins says what happens to admins. The roles evaluated after it keep
    their own default, which is the entry's remove, and that is true.
    """
    orgs, _teams = _populate(
        existing_normal_user,
        organization_map={
            'Example Org': {
                'admins': [OTHER_GROUP_DN],
                'remove_admins': False,
                'users': [OTHER_GROUP_DN],
                'auditors': [OTHER_GROUP_DN],
            }
        },
    )

    assert orgs == {'Example Org': {'admin_role': None, 'auditor_role': False, 'member_role': False}}
