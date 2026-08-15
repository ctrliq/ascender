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


def update_user_org_team_mappings(
    backend,
    details,
    user=None,
    *args,
    **kwargs
):
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

    # ------------------------------------------------------------------
    # Ensure mapped organizations and teams exist.
    # ------------------------------------------------------------------

    orgs_list = []
    team_map = {}

    for org_name, org_opts in org_map.items():
        organization_alias = org_opts.get('organization_alias')

        if organization_alias:
            organization_name = organization_alias
        else:
            organization_name = org_name

        orgs_list.append(organization_name)

    for team_name, team_opts in team_map_settings.items():
        if 'organization' not in team_opts:
            continue

        organization = team_opts.get('organization')

        if not organization:
            logger.error(
                "Team named %s in social auth team map settings is "
                "invalid due to missing organization",
                team_name,
            )
            continue

        team_map[team_name] = organization

    create_org_and_teams(
        orgs_list,
        team_map,
        'Social Auth',
    )

    # ------------------------------------------------------------------
    # Compute organization desired state in memory.
    #
    # This mirrors the LDAP implementation in awx.sso.backends.
    # ------------------------------------------------------------------

    desired_org_states = {}

    for org_name, org_opts in org_map.items():
        organization_alias = org_opts.get('organization_alias')

        if organization_alias:
            organization_name = organization_alias
        else:
            organization_name = org_name

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

            desired_org_states[organization_name][role_name] = (
                _update_m2m_from_expression(
                    user,
                    opts,
                    role_remove,
                )
            )

        # If no mapping actually manages this organization, don't make the
        # reconciliation query load it.
        if all(
            desired_org_states[organization_name][role_name] is None
            for role_name in org_roles_and_expressions
        ):
            del desired_org_states[organization_name]

    # ------------------------------------------------------------------
    # Compute team desired state in memory.
    # ------------------------------------------------------------------

    desired_team_states = {}

    for team_name, team_opts in team_map_settings.items():
        if 'organization' not in team_opts:
            continue

        organization = team_opts.get('organization')

        if not organization:
            continue

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
# The default SOCIAL_AUTH_PIPELINE no longer calls these individually.
def update_user_orgs(backend, details, user=None, *args, **kwargs):
    return update_user_org_team_mappings(
        backend,
        details,
        user=user,
        *args,
        **kwargs
    )

def update_user_teams(backend, details, user=None, *args, **kwargs):
    return update_user_org_team_mappings(
        backend,
        details,
        user=user,
        *args,
        **kwargs
    )
