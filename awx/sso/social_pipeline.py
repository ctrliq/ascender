# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Python
import re
import logging

from awx.sso.common import create_org_and_teams, reconcile_users_org_team_mappings

logger = logging.getLogger('awx.sso.social_pipeline')


def _get_adapter_name(backend):
    # The backend name is only used to label log messages, the test backends do not always have one
    return getattr(backend, 'name', 'social')


def _desired_state_from_expression(user, expr, remove=True):
    """
    Helper function to evaluate the organization/team map expressions to determine if the user
    should be a member of the role.

    Returns:
        True - User should be added
        False - User should be removed
        None - Users membership should not be changed
    """
    if expr is None:
        return None

    should_add = False
    if not expr:
        pass
    elif expr is True:
        should_add = True
    else:
        if isinstance(expr, (str, type(re.compile('')))):
            expr = [expr]
        for ex in expr:
            if isinstance(ex, str):
                if user.username == ex or user.email == ex:
                    should_add = True
            elif isinstance(ex, type(re.compile(''))):
                if ex.match(user.username) or ex.match(user.email):
                    should_add = True

    if should_add:
        return True
    elif remove:
        return False
    return None


def _merge_desired_states(existing_state, new_state):
    """
    Helper function to combine the desired states of two map entries pointing at the same role.

    Being a member of the role wins over not being a member of it, which in turn wins over
    leaving the membership alone.
    """
    if new_state is None:
        return existing_state
    if existing_state is None:
        return new_state
    return existing_state or new_state


def _update_user_orgs(backend, user, desired_org_state, orgs_to_create):
    """
    Compute the organization memberships for the given user based on mapping rules
    defined in settings.
    """
    org_map = backend.setting('ORGANIZATION_MAP') or {}
    for org_name, org_opts in org_map.items():
        organization_alias = org_opts.get('organization_alias')
        if organization_alias:
            organization_name = organization_alias
        else:
            organization_name = org_name
        if organization_name not in orgs_to_create:
            orgs_to_create.append(organization_name)

        if organization_name not in desired_org_state:
            desired_org_state[organization_name] = {}

        remove = bool(org_opts.get('remove', True))
        for role_name, user_type in (('admin_role', 'admins'), ('member_role', 'users')):
            remove_members = bool(org_opts.get('remove_{}'.format(user_type), remove))
            state = _desired_state_from_expression(user, org_opts.get(user_type, None), remove_members)
            desired_org_state[organization_name][role_name] = _merge_desired_states(desired_org_state[organization_name].get(role_name, None), state)


def _update_user_teams(backend, user, desired_team_state, teams_to_create):
    """
    Compute the team memberships for the given user based on mapping rules defined
    in settings.
    """
    team_map = backend.setting('TEAM_MAP') or {}
    for team_name, team_opts in team_map.items():
        # Get or create the org to update.
        if 'organization' not in team_opts:
            continue
        organization_name = team_opts['organization']
        teams_to_create[team_name] = organization_name

        remove = bool(team_opts.get('remove', True))
        state = _desired_state_from_expression(user, team_opts.get('users', None), remove)
        if state is None:
            continue

        if organization_name not in desired_team_state:
            desired_team_state[organization_name] = {}
        desired_team_state[organization_name][team_name] = {'member_role': state}


def populate_user(backend, details, user=None, *args, **kwargs):
    """
    Update organization and team memberships for the given user based on mapping
    rules defined in settings.
    """
    if not user:
        return

    # Build the in-memory settings for how this user should be modeled
    desired_org_state = {}
    desired_team_state = {}
    orgs_to_create = []
    teams_to_create = {}
    _update_user_orgs(backend, user, desired_org_state, orgs_to_create)
    _update_user_teams(backend, user, desired_team_state, teams_to_create)

    adapter = _get_adapter_name(backend)

    # Create any mapped org/team which does not exist yet
    create_org_and_teams(orgs_to_create, teams_to_create, adapter)

    # Finally reconcile the user, this only writes the memberships which actually changed
    reconcile_users_org_team_mappings(user, desired_org_state, desired_team_state, adapter)


def update_user_orgs(backend, details, user=None, *args, **kwargs):
    """
    Update organization memberships for the given user based on mapping rules
    defined in settings.

    Kept for pipelines which reference the organization and team steps separately,
    populate_user does both in a single pass.
    """
    if not user:
        return

    desired_org_state = {}
    orgs_to_create = []
    _update_user_orgs(backend, user, desired_org_state, orgs_to_create)

    adapter = _get_adapter_name(backend)
    create_org_and_teams(orgs_to_create, {}, adapter)
    reconcile_users_org_team_mappings(user, desired_org_state, {}, adapter)


def update_user_teams(backend, details, user=None, *args, **kwargs):
    """
    Update team memberships for the given user based on mapping rules defined
    in settings.

    Kept for pipelines which reference the organization and team steps separately,
    populate_user does both in a single pass.
    """
    if not user:
        return

    desired_team_state = {}
    teams_to_create = {}
    _update_user_teams(backend, user, desired_team_state, teams_to_create)

    adapter = _get_adapter_name(backend)
    create_org_and_teams([], teams_to_create, adapter)
    reconcile_users_org_team_mappings(user, {}, desired_team_state, adapter)
