# Covers the local modifications made to the vendored trigger evaluator.
# See ascender/dab/VENDORED.md.
import copy

import pytest
from django.test.utils import override_settings

from ascender.dab.authentication.utils.claims import TriggerResult, process_groups, process_user_attributes
from ascender.dab.authentication.utils.validation import validate_trigger_data


ATTRS = {'mail': ['Christopher.Pall@Example.com'], 'department': ['Private Cloud']}

# The evaluator logs, and Ascender's logging filters read the database backed settings.
pytestmark = pytest.mark.django_db


def test_process_user_attributes_leaves_the_trigger_alone():
    """
    Upstream pops join_condition off the caller's dict, which it gets fresh from a
    JSONField every time. Ours comes from the settings cache, so it has to survive.
    """
    trigger = {'join_condition': 'and', 'mail': {'ends_with': '@Example.com'}, 'department': {'equals': 'Private Cloud'}}
    before = copy.deepcopy(trigger)

    assert process_user_attributes(trigger, ATTRS, 1, 'tracking') is TriggerResult.ALLOW
    assert trigger == before

    # Without the copy the second call would evaluate under the default 'or' join
    # and let a user through on one attribute out of two.
    trigger['department'] = {'equals': 'Accounts'}
    assert process_user_attributes(trigger, ATTRS, 1, 'tracking') is TriggerResult.SKIP


@pytest.mark.parametrize(
    "case_insensitive, expected",
    [
        (False, TriggerResult.SKIP),
        (True, TriggerResult.ALLOW),
    ],
)
def test_attribute_case_folding_follows_the_setting(case_insensitive, expected):
    trigger = {'mail': {'equals': 'christopher.pall@example.com'}}
    with override_settings(AUTH_MAP_CASE_INSENSITIVE=case_insensitive):
        assert process_user_attributes(trigger, ATTRS, 1, 'tracking') is expected


@pytest.mark.parametrize(
    "case_insensitive, expected",
    [
        (False, TriggerResult.SKIP),
        (True, TriggerResult.ALLOW),
    ],
)
def test_group_case_folding_follows_the_setting(case_insensitive, expected):
    trigger = {'has_or': ['cn=viewers,ou=groups,dc=example,dc=com']}
    with override_settings(AUTH_MAP_CASE_INSENSITIVE=case_insensitive):
        assert process_groups(trigger, ['CN=viewers,OU=Groups,DC=example,DC=com'], 1, 'tracking') is expected


def test_matches_operator_is_a_regex():
    assert process_user_attributes({'mail': {'matches': r'^.*@example\.com$'}}, ATTRS, 1, 'tracking') is TriggerResult.ALLOW
    assert process_user_attributes({'mail': {'matches': r'^.*@nowhere\.com$'}}, ATTRS, 1, 'tracking') is TriggerResult.SKIP


@pytest.mark.parametrize(
    "triggers, expected_keys",
    [
        ({'always': {}}, []),
        ({'never': {}}, []),
        ({'groups': {'has_or': ['CN=a,DC=example,DC=com']}}, []),
        ({'attributes': {'join_condition': 'and', 'mail': {'equals': 'a@example.com'}}}, []),
        ({'nonsense': {}}, ['triggers.nonsense']),
        ({'groups': {'has_maybe': ['CN=a,DC=example,DC=com']}}, ['triggers.groups.has_maybe']),
        ({'groups': {'has_or': 'CN=a,DC=example,DC=com'}}, ['triggers.groups.has_or']),
        ({'attributes': {'join_condition': 'maybe'}}, ['triggers.attributes.join_condition']),
        ({'attributes': {'mail': {'starts_with': 'a'}}}, ['triggers.attributes.mail.starts_with']),
    ],
)
def test_validate_trigger_data(triggers, expected_keys):
    assert sorted(validate_trigger_data(triggers)) == expected_keys
