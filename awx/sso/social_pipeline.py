# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Python
import re
import logging

from awx.sso.common import (
    create_org_and_teams,
    reconcile_users_org_team_mappings,
)

logger = logging.getLogger('awx.sso.social_pipeline')


def _update_m2m_from_expression(user, opts, remove=True):
    """
    Evaluate a social-auth organization/team mapping expression.

    Returns:
        True  - user should be added
        False - user should be removed
        None  - membership should not be changed
    """
    if opts is None:
        return None

    if not opts:
        pass
    elif isinstance(opts, bool) and opts is True:
        return True
    else:
        if isinstance(opts, (str, type(re.compile('')))):
            opts = [opts]

        for expression in opts:
            if isinstance(expression, str):
                if user.username == expression or user.email == expression:
                    return True
            elif isinstance(expression, type(re.compile(''))):
                if expression.match(user.username) or expression.match(user.email):
                    return True

    if remove:
        return False

    return None


def _compute_org_desired_states(org_map, user):
    """
    Resolve the mapped organization names (honoring organization_alias) and
    evaluate each organization's admins/users expressions into a desired state.

    Returns a tuple of (orgs_list, desired_org_states):
      orgs_list          - the organization names that should exist
      desired_org_states - org name to {role_name: True/False/None}
    """
    orgs_list = []
    desired_org_states = {}

    for org_name, org_opts in org_map.items():
        organization_alias = org_opts.get('organization_alias')

        if organization_alias:
            organization_name = organization_alias
        else:
            organization_name = org_name

        orgs_list.append(organization_name)

        remove = bool(org_opts.get('remove', True))

        desired_org_states[organization_name] = {}

        # Social auth currently supports organization admins and users.
        org_roles_and_expressions = {
            'admin_role': 'admins',
            'member_role': 'users',
        }

        for role_name, expression_name in org_roles_and_expressions.items():
            opts = org_opts.get(expression_name, None)

            role_remove = bool(
                org_opts.get(
                    'remove_{}'.format(expression_name),
                    remove,
                )
            )

            desired_org_states[organization_name][role_name] = _update_m2m_from_expression(
                user,
                opts,
                role_remove,
            )

        # If no mapping actually manages this organization, don't make the
        # reconciliation query load it.
        if all(desired_org_states[organization_name][role_name] is None for role_name in org_roles_and_expressions):
            del desired_org_states[organization_name]

    return orgs_list, desired_org_states


def _compute_team_desired_states(team_map_settings, user):
    """
    Resolve the mapped teams (declaring the organizations they belong to) and
    evaluate each team's users expression into a desired state.

    Returns a tuple of (team_map, desired_team_states):
      team_map            - team name to organization name
      desired_team_states - organization name to {team name: {'member_role': True/False/None}}
    """
    team_map = {}
    desired_team_states = {}

    for team_name, team_opts in team_map_settings.items():
        if 'organization' not in team_opts:
            continue

        organization = team_opts.get('organization')

        if not organization:
            logger.error(
                "Team named %s in social auth team map settings is " "invalid due to missing organization",
                team_name,
            )
            continue

        team_map[team_name] = organization

        users_opts = team_opts.get('users', None)
        remove = bool(team_opts.get('remove', True))

        state = _update_m2m_from_expression(
            user,
            users_opts,
            remove,
        )

        if state is not None:
            if organization not in desired_team_states:
                desired_team_states[organization] = {}

            desired_team_states[organization][team_name] = {
                'member_role': state,
            }

    return team_map, desired_team_states


def update_user_org_team_mappings(backend, details, user=None, *args, **kwargs):
    """
    Compute the desired organization/team membership state in memory and
    reconcile all memberships in bulk.

    This follows the same desired-state approach used by LDAPBackend in
    awx.sso.backends.
    """
    if not user:
        return

    org_map = backend.setting('ORGANIZATION_MAP') or {}
    team_map_settings = backend.setting('TEAM_MAP') or {}

    orgs_list, desired_org_states = _compute_org_desired_states(org_map, user)
    team_map, desired_team_states = _compute_team_desired_states(team_map_settings, user)

    # Ensure mapped organizations and teams exist.
    create_org_and_teams(
        orgs_list,
        team_map,
        'Social Auth',
    )

    # One reconciliation for all organization/team memberships.
    reconcile_users_org_team_mappings(
        user,
        desired_org_states,
        desired_team_states,
        'Social Auth',
    )


# Kept for compatibility: a custom SOCIAL_AUTH_PIPELINE configured in
# awx settings (e.g. NON_ROOT settings or an awx-manage shell) may still list
# these legacy function names explicitly.
#
# Both entry points retain their original per-domain behavior:
#   update_user_orgs  -> organizations only (admin_role/member_role)
#   update_user_teams -> teams only (member_role)
# Referencing one does NOT manage the other domain, matching the historical
# behavior of the pre-merge pipeline.  Each still uses the same bulk
# create_org_and_teams + reconcile_users_org_team_mappings helpers as the
# merged step, so custom pipelines keep the bulk-reconciliation speedup.
def update_user_orgs(backend, details, user=None, *args, **kwargs):
    """
    Update organization memberships for the given user based on mapping rules
    defined in settings.  Teams are left untouched.
    """
    if not user:
        return

    org_map = backend.setting('ORGANIZATION_MAP') or {}

    orgs_list, desired_org_states = _compute_org_desired_states(org_map, user)

    # Ensure mapped organizations exist.  Teams (and the organizations only
    # referenced by them) are managed by update_user_teams.
    create_org_and_teams(
        orgs_list,
        {},
        'Social Auth',
    )

    reconcile_users_org_team_mappings(
        user,
        desired_org_states,
        {},
        'Social Auth',
    )


def update_user_teams(backend, details, user=None, *args, **kwargs):
    """
    Update team memberships for the given user based on mapping rules defined
    in settings.  Organization memberships are left untouched.
    """
    if not user:
        return

    team_map_settings = backend.setting('TEAM_MAP') or {}

    team_map, desired_team_states = _compute_team_desired_states(team_map_settings, user)

    # Ensure mapped teams (and the organizations they belong to) exist.
    create_org_and_teams(
        [],
        team_map,
        'Social Auth',
    )

    reconcile_users_org_team_mappings(
        user,
        {},
        desired_team_states,
        'Social Auth',
    )
