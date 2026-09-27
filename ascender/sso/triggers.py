# Copyright (c) 2026 Ascender contributors
# All Rights Reserved.

import logging
import uuid

from ascender.dab.authentication.utils.claims import TriggerResult, process_groups, process_user_attributes
from ascender.sso.validators import validate_trigger_rule

logger = logging.getLogger('ascender.sso.triggers')


#: A trigger rule that could not be evaluated, as distinct from one that did not
#: match: the first has no opinion, the second is an answer.
UNUSABLE_RULE = object()


def evaluate_trigger_rule(triggers, groups, attributes, map_id):
    """
    Evaluate an AAP style trigger rule against one user.

    groups and attributes are callables returning the user's group names and
    their attributes as a mapping.  They are only called for the trigger type
    the rule actually uses, because reading groups can cost a directory query.
    groups may return None to say the groups are not known, which is not the
    same as belonging to none: has_not would let everyone through and has_or
    with remove would take the role from everyone, so the rule is unusable.

    Returns:
        True - the rule matched
        False - the rule explicitly denied the user
        None - the rule does not apply to this user
        UNUSABLE_RULE - the rule cannot be evaluated at all
    """
    # Rules can be written to a settings file as well as saved through the API,
    # so a rule reaching here may never have been validated.
    errors = validate_trigger_rule(triggers)
    if errors:
        logger.warning(
            "The trigger rule in mapping {} will be ignored: {}".format(map_id, '; '.join('{}: {}'.format(key, errors[key]) for key in sorted(errors)))
        )
        return UNUSABLE_RULE

    tracking_id = str(uuid.uuid4())
    trigger_result = TriggerResult.SKIP
    for trigger_type, trigger in triggers.items():
        if trigger_type == 'groups':
            user_groups = groups()
            if user_groups is None:
                logger.warning("The trigger rule in mapping {} will be ignored: the user's groups are not known".format(map_id))
                return UNUSABLE_RULE
            trigger_result = process_groups(trigger, user_groups, map_id, tracking_id)
        elif trigger_type == 'attributes':
            trigger_result = process_user_attributes(trigger, attributes(), map_id, tracking_id)
        elif trigger_type == 'always':
            trigger_result = TriggerResult.ALLOW
        elif trigger_type == 'never':
            trigger_result = TriggerResult.DENY

    if trigger_result is TriggerResult.ALLOW:
        return True
    if trigger_result is TriggerResult.DENY:
        return False
    return None


def resolve_membership(triggers, groups, attributes, map_id, fallback, remove):
    """
    Decide one role of one org/team map entry that may carry a trigger rule.

    fallback is a callable returning what the entry's older style options (group
    DNs for LDAP, usernames and regexes for social auth) decide for this user,
    as True, False or None.  Without a trigger rule that is the whole answer,
    which is what every existing configuration relies on.  With one, the rule is
    evaluated first and the older options only decide for a user the rule says
    nothing about.
    """
    if not triggers:
        return fallback()

    state = evaluate_trigger_rule(triggers, groups, attributes, map_id)
    if state is UNUSABLE_RULE:
        # A rule nobody can evaluate decides nothing.  Anything else here, the
        # revoke below included, would turn one typo into every user losing
        # the role.
        return fallback()
    if state is not None:
        return state

    # The rule did not apply to this user.  Fall back to the older options, and
    # if those say nothing either then remove behaves like an AAP revoke: a rule
    # the user does not meet costs them the membership.
    state = fallback()
    if state is None and remove:
        return False
    return state
