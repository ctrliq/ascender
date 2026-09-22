# Vendored subset of django-ansible-base, see ascender/dab/VENDORED.md.
#
# Only the trigger evaluation half of ansible_base/authentication/utils/claims.py
# is kept: the pure functions that answer "does this rule apply to this user?".
# Everything downstream of that answer (create_claims, update_user_claims and the
# AuthenticatorMap/RBAC machinery they drive) is left upstream, because Ascender
# evaluates its maps out of settings rather than out of database rows.
import logging
import re
from enum import Enum, auto
from typing import Any, List, Optional

from django.conf import settings

from .trigger_definition import TRIGGER_DEFINITION

logger = logging.getLogger('ascender.dab.authentication.utils.claims')


class TriggerResult(Enum):
    ALLOW = auto()
    DENY = auto()
    SKIP = auto()


def _prefixed_debug(auth_map_pk: int, tracking_id: str, message: str):
    prefix = f"[{tracking_id}] Map [{auth_map_pk}]"
    logger.debug(f"{prefix} {message}")


def _is_case_insensitivity_enabled() -> bool:
    # Upstream reads the FEATURE_CASE_INSENSITIVE_AUTH_MAPS_ENABLED django-flags
    # flag.  django-flags is not a dependency here, so the same switch is a plain
    # Django setting instead.
    return bool(getattr(settings, 'AUTH_MAP_CASE_INSENSITIVE', False))


def _lowercase_group_triggers(trigger_condition: dict) -> dict:
    """
    Lowercase all group names provided to trigger
    """
    ci_trigger_condition = {}
    for operator, grouplist in trigger_condition.items():
        ci_trigger_condition[operator] = [f"{group}".casefold() for group in grouplist]
    return ci_trigger_condition


def process_groups(trigger_condition: dict, groups: list, map_id: int, tracking_id: str) -> TriggerResult:
    """
    Looks at a maps trigger for a group and users groups and determines if the trigger is defined for this user.
    Group DNs are compared case-insensitively when FEATURE_CASE_INSENSITIVE_AUTH_MAPS enabled.
    """
    if _is_case_insensitivity_enabled():
        groups = [f"{group}".casefold() for group in groups]
        trigger_condition = _lowercase_group_triggers(trigger_condition)

    invalid_conditions = set(trigger_condition.keys()) - set(TRIGGER_DEFINITION['groups']['keys'].keys())
    if invalid_conditions:
        logger.warning(f"[{tracking_id}] The conditions {', '.join(invalid_conditions)} for groups in mapping {map_id} are invalid and won't be processed")

    set_of_user_groups = set(groups)

    if "has_or" in trigger_condition:
        matching_groups = set_of_user_groups.intersection(set(trigger_condition["has_or"]))
        if matching_groups:
            _prefixed_debug(map_id, tracking_id, f"User has at least one trigger group [{matching_groups}], allowing")
            return TriggerResult.ALLOW
        else:
            _prefixed_debug(map_id, tracking_id, "User does not have any trigger groups, skipping")

    elif "has_and" in trigger_condition:
        if set(trigger_condition["has_and"]).issubset(set_of_user_groups):
            _prefixed_debug(map_id, tracking_id, "User has all groups in trigger, allowing")
            return TriggerResult.ALLOW
        else:
            _prefixed_debug(map_id, tracking_id, "User does not have all trigger groups, skipping")

    elif "has_not" in trigger_condition:
        unwanted_groups = set(trigger_condition["has_not"]).intersection(set_of_user_groups)
        if not unwanted_groups:
            _prefixed_debug(map_id, tracking_id, "User does not have disallowed groups, allowing")
            return TriggerResult.ALLOW
        else:
            _prefixed_debug(map_id, tracking_id, f"User has one or more disallowed groups [{unwanted_groups}], skipping")
    return TriggerResult.SKIP


def has_access_with_join(current_access: Optional[bool], new_access: bool, condition: str = 'or') -> Optional[bool]:
    """
    Handle join of authenticator_maps
    """
    if current_access is None:
        return new_access

    if condition == 'or':
        return current_access or new_access

    if condition == 'and':
        return current_access and new_access


def _lowercase_value(value: Any) -> Any:
    """
    Convert a value to lowercase, handling different types appropriately.

    Args:
        value: The value to convert (str, list, or other)

    Returns:
        The converted value with appropriate case folding applied
    """
    if isinstance(value, str):
        return value.casefold()
    elif isinstance(value, list):
        # Handle list values (for "in" operator which should only accept arrays)
        return [str(item).casefold() for item in value]
    else:
        # Keep other types as-is
        return value


def _lowercase_dict(condition: dict) -> dict:
    """
    Convert all values in a condition dictionary to lowercase.

    Args:
        condition: Dictionary of

    Returns:
        New dictionary with case-folded values (keys will remain the same)
    """
    if not condition:  # empty dict
        return {}

    updated_condition = {}
    for key, value in condition.items():
        updated_condition[key] = _lowercase_value(value)
    return updated_condition


def _lowercase_attr_triggers(trigger_condition: dict) -> dict:
    """
    Lower case all keys (attribute names) and contained attribute values
    """
    ci_trigger_condition = {}
    for attr, condition in trigger_condition.items():
        if isinstance(condition, str):
            updated_condition = condition.casefold()
        elif isinstance(condition, dict):
            updated_condition = _lowercase_dict(condition)
        else:
            updated_condition = condition

        ci_trigger_condition[attr.casefold()] = updated_condition
    return ci_trigger_condition


def _validate_join_condition(join_condition, map_id: int, tracking_id: str) -> str:
    """
    Validate and normalize the join condition, defaulting to 'or' if invalid.

    Args:
        join_condition: The join condition to validate
        map_id: Authenticator map ID for logging
        tracking_id: Tracking ID for logging

    Returns:
        Valid join condition ('or' or 'and')
    """
    if join_condition not in TRIGGER_DEFINITION['attributes']['keys']['join_condition']['choices']:
        logger.warning(f"[{tracking_id}] Trigger join_condition {join_condition} on authenticator map {map_id} is invalid and will be set to 'or'")
        return 'or'
    return join_condition


def _validate_attribute_conditions(attribute: str, condition: dict, map_id: int, tracking_id: str) -> bool:
    """
    Validate attribute conditions and log warnings for invalid ones.

    Args:
        attribute: The attribute name
        condition: The condition dictionary for this attribute
        map_id: Authenticator map ID for logging
        tracking_id: Tracking ID for logging

    Returns:
        True if conditions are valid and should be processed, False if should be skipped
    """
    # Warn if there are any invalid conditions, we are just going to ignore them
    invalid_conditions = set(condition.keys()) - set(TRIGGER_DEFINITION['attributes']['keys']['*']['keys'].keys())
    if invalid_conditions:
        logger.warning(
            f"[{tracking_id}] The conditions {', '.join(invalid_conditions)} for attribute {attribute} "
            f"in authenticator map {map_id} are invalid and won't be processed"
        )

    # Validate that 'in' operator only accepts arrays
    if "in" in condition and not isinstance(condition["in"], list):
        logger.warning(
            f"[{tracking_id}] The 'in' operator for attribute {attribute} in authenticator map {map_id} "
            f"must use an array, not {type(condition['in']).__name__}. This condition will be ignored."
        )
        return False

    return True


def _prepare_case_insensitive_data(trigger_condition: dict, attributes: dict, map_id: int, tracking_id: str) -> tuple[dict, dict]:
    """
    Prepare trigger conditions and attributes for case-insensitive comparison if enabled.

    Args:
        trigger_condition: Original trigger conditions
        attributes: Original user attributes
        map_id: Authenticator map ID for logging
        tracking_id: Tracking ID for logging

    Returns:
        Tuple of (processed_trigger_condition, processed_attributes)
    """
    if _is_case_insensitivity_enabled():
        _prefixed_debug(map_id, tracking_id, f"[{tracking_id}] Case insensitivity enabled, converting attributes and values to lowercase")
        attributes = {f"{k}".casefold(): v for k, v in attributes.items()}
        trigger_condition = _lowercase_attr_triggers(trigger_condition)

    return trigger_condition, attributes


def _normalize_user_value(user_value):
    """
    Normalize user value to a list format for consistent processing.

    Args:
        user_value: The user attribute value

    Returns:
        List containing the user value(s)
    """
    if type(user_value) is not list:
        # If the value is a string then convert it to a list
        return [user_value]
    return user_value


def process_user_attributes(trigger_condition: dict, attributes: dict, map_id: int, tracking_id: str) -> TriggerResult:
    """
    Looks at a maps trigger for an attribute and the users attributes and determines if the trigger is defined for this user.
    Attribute names are compared case-insensitively when FEATURE_CASE_INSENSITIVE_AUTH_MAPS is enabled.
    """
    # The pop below mutates its argument.  Upstream hands this function a fresh
    # dict off a JSONField every time, so it never notices; our triggers come out
    # of the settings cache and would lose join_condition after the first login.
    trigger_condition = dict(trigger_condition)

    # Prepare data for case-insensitive comparison if needed
    trigger_condition, attributes = _prepare_case_insensitive_data(trigger_condition, attributes, map_id, tracking_id)

    # Extract and validate join condition
    has_access = None
    join_condition = trigger_condition.pop('join_condition', 'or')
    join_condition = _validate_join_condition(join_condition, map_id, tracking_id)

    # Process each attribute in the trigger condition
    for attribute in trigger_condition.keys():
        # If we have already determined the result, we can break out and return
        if _check_early_exit(has_access, join_condition, map_id, tracking_id):
            break

        # Validate attribute conditions
        if not _validate_attribute_conditions(attribute, trigger_condition[attribute], map_id, tracking_id):
            continue

        # The attribute is an empty dict we just need to see if the user has the attribute or not
        if trigger_condition[attribute] == {}:
            has_access = has_access_with_join(has_access, _check_empty_attribute(attribute, attributes, map_id, tracking_id), join_condition)
            continue

        # Check if user has the attribute
        user_value = attributes.get(attribute, None)
        if user_value is None:
            # if condition is not "and", the attribute value is not required, just move on
            if join_condition != 'and':
                _prefixed_debug(map_id, tracking_id, f"Attr [{attribute}] is not present in user attributes, skipping")
            # else, condition is "and" which means the attribute value IS required, set access to False
            else:
                _prefixed_debug(
                    map_id, tracking_id, f"Attr [{attribute}] is not present in user attributes but is required by condition 'and' changing access to false"
                )
                has_access = has_access_with_join(has_access, False, join_condition)
            continue

        # Normalize user value and process
        user_value = _normalize_user_value(user_value)
        has_access = _process_user_value(has_access, trigger_condition, user_value, join_condition, attribute, map_id, tracking_id)

    return TriggerResult.ALLOW if has_access else TriggerResult.SKIP


def _check_empty_attribute(attribute: str, attributes: dict, map_id: int, tracking_id: str) -> bool:
    _prefixed_debug(
        map_id,
        tracking_id,
        f"Attr [{attribute}] without value constraint {'is' if attribute in attributes else 'is not'} present, {_result_suffix(attribute in attributes)}",
    )
    return attribute in attributes


def _check_early_exit(has_access: Optional[bool], join_condition: str, map_id: int, tracking_id: str) -> bool:
    if has_access and join_condition == 'or':
        _prefixed_debug(map_id, tracking_id, "At least one attribute match with OR join, allowing")
        return True
    elif has_access is False and join_condition == 'and':
        _prefixed_debug(map_id, tracking_id, "At least one attribute mismatch with AND join, skipping")
        return True
    return False


def _evaluate_equals(user_value: str, trigger_value: str) -> bool:
    """Check if user value equals trigger value."""
    return user_value == trigger_value


def _evaluate_matches(user_value: str, trigger_value: str) -> bool:
    """Check if user value matches regex pattern."""
    return re.match(trigger_value, user_value, re.IGNORECASE) is not None


def _evaluate_contains(user_value: str, trigger_value: str) -> bool:
    """Check if user value contains trigger value."""
    return trigger_value in user_value


def _evaluate_ends_with(user_value: str, trigger_value: str) -> bool:
    """Check if user value ends with trigger value."""
    return user_value.endswith(trigger_value)


def _evaluate_in(user_value: str, trigger_value: list) -> bool:
    """Check if user value is in trigger value list."""
    return user_value in trigger_value


def _get_operator_messages(operator: str, result: bool) -> str:
    """Get appropriate message text for operator and result."""
    messages = {
        "equals": ("equals", "does not equal"),
        "matches": ("matches", "does not match"),
        "contains": ("contains", "does not contain"),
        "ends_with": ("ends with", "does not end with"),
        "in": ("is in", "is not in"),
    }
    true_msg, false_msg = messages.get(operator, ("", ""))
    return true_msg if result else false_msg


def _process_user_value(
    has_access: Optional[bool], trigger_condition: dict, user_value: List[str], join_condition: str, attribute: str, map_id: int, tracking_id: str
) -> Optional[bool]:
    # Operator dispatch table
    operators = {
        "equals": _evaluate_equals,
        "matches": _evaluate_matches,
        "contains": _evaluate_contains,
        "ends_with": _evaluate_ends_with,
        "in": _evaluate_in,
    }

    condition = trigger_condition[attribute]

    # Find which operator is present (preserve original priority order)
    operator = None
    trigger_value = None
    for op in ["equals", "matches", "contains", "ends_with", "in"]:
        if op in condition:
            operator = op
            trigger_value = condition[op]
            break

    if not operator:
        return has_access

    evaluate_fn = operators[operator]

    for a_user_value in user_value:
        # Normalize user value for comparison
        user_str = f"{a_user_value}".casefold() if _is_case_insensitivity_enabled() else f"{a_user_value}"

        # Evaluate condition
        result = evaluate_fn(user_str, trigger_value)
        has_access = has_access_with_join(has_access, result, join_condition)

        # Log result
        header = f"Attr [{attribute}] value [{user_str}]"
        message = _get_operator_messages(operator, result)
        _prefixed_debug(map_id, tracking_id, f"{header} {message} [{trigger_value}], {_result_suffix(result)}")

    return has_access


def _result_suffix(result: bool) -> str:
    return "allowing" if result else "skipping"
