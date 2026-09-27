# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Python
import re
import logging

from django.conf import settings

from ascender.sso.common import (
    create_org_and_teams,
    reconcile_users_org_team_mappings,
)
from ascender.sso.oidc import OIDCIdentity, is_oidc

logger = logging.getLogger('ascender.sso.social_pipeline')


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
        if isinstance(opts, (str, re.Pattern)):
            opts = [opts]

        for expression in opts:
            if isinstance(expression, str):
                if user.username == expression or user.email == expression:
                    return True
            elif isinstance(expression, re.Pattern):
                if expression.match(user.username) or expression.match(user.email):
                    return True

    if remove:
        return False

    return None


def _update_m2m_from_map(user, opts, remove, triggers, identity, map_id):
    """
    Evaluate one role of one map entry.

    Only an OIDC login has claims for a trigger rule to match against, so for
    every other backend, and for an entry without a rule, this is exactly
    _update_m2m_from_expression.
    """
    if not triggers or identity is None:
        return _update_m2m_from_expression(user, opts, remove)
    return identity.resolve(triggers, map_id, lambda: _update_m2m_from_expression(user, opts, remove), remove)


def _compute_org_desired_states(org_map, user, identity=None):
    """
    Resolve the mapped organization names (honoring organization_alias) and
    evaluate each organization's admins/users expressions into a desired state.

    Returns a tuple of (orgs_list, desired_org_states):
      orgs_list          - the organization names that should exist
      desired_org_states - org name to {role_name: True/False}; only managed
        roles are recorded (orgs with no managed role are left out)
    """
    orgs_list = []
    desired_org_states = {}

    # Social auth currently supports organization admins and users.
    org_roles_and_expressions = {
        'admin_role': 'admins',
        'member_role': 'users',
    }

    for org_name, org_opts in org_map.items():
        organization_name = org_opts.get('organization_alias') or org_name

        orgs_list.append(organization_name)

        remove = bool(org_opts.get('remove', True))

        for role_name, expression_name in org_roles_and_expressions.items():
            opts = org_opts.get(expression_name, None)

            role_remove = bool(
                org_opts.get(
                    'remove_{}'.format(expression_name),
                    remove,
                )
            )

            state = _update_m2m_from_map(
                user,
                opts,
                role_remove,
                org_opts.get('triggers_{}'.format(expression_name)),
                identity,
                'organization {} {}'.format(org_name, expression_name),
            )

            # Multiple ORGANIZATION_MAP entries may resolve to the same
            # organization via organization_alias.  Merge them instead of
            # overwriting: a None result means this entry does not manage the
            # role, so only non-None states are recorded and organizations with
            # no recorded state are left out of the map.
            if state is not None:
                desired_org_states.setdefault(organization_name, {})[role_name] = state

    return orgs_list, desired_org_states


def _compute_team_desired_states(team_map_settings, user, identity=None):
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
                "Team named %s in social auth team map settings is invalid due to missing organization",
                team_name,
            )
            continue

        team_map[team_name] = organization

        users_opts = team_opts.get('users', None)
        remove = bool(team_opts.get('remove', True))

        state = _update_m2m_from_map(
            user,
            users_opts,
            remove,
            team_opts.get('triggers'),
            identity,
            'team {}'.format(team_name),
        )

        if state is not None:
            if organization not in desired_team_states:
                desired_team_states[organization] = {}

            desired_team_states[organization][team_name] = {
                'member_role': state,
            }

    return team_map, desired_team_states


def _backend_map(backend, name):
    """
    The org or team map that applies to logins through backend.

    OIDC used to have no maps of its own and read the shared SOCIAL_AUTH_ ones.
    Now that it has, an unset OIDC map still falls back to the shared one, so a
    configuration written before keeps working.
    """
    value = backend.setting(name)
    if value is None and is_oidc(backend):
        value = getattr(settings, 'SOCIAL_AUTH_{}'.format(name), None)
    return value or {}


def _update_user_memberships(backend, user, *, response=None, manage_orgs=True, manage_teams=True):
    """
    Compute the desired organization/team membership state in memory and
    reconcile all memberships in bulk.

    This follows the same desired-state approach used by LDAPBackend in
    ascender.sso.backends.  Which domains are managed is controlled by
    manage_orgs/manage_teams so the merged default step and the legacy
    per-domain entry points share one implementation.
    """
    org_map = _backend_map(backend, 'ORGANIZATION_MAP')
    team_map_settings = _backend_map(backend, 'TEAM_MAP')
    identity = OIDCIdentity(backend, response) if is_oidc(backend) else None

    orgs_list = []
    desired_org_states = {}
    team_map = {}
    desired_team_states = {}
    if manage_orgs:
        orgs_list, desired_org_states = _compute_org_desired_states(org_map, user, identity)
    if manage_teams:
        team_map, desired_team_states = _compute_team_desired_states(team_map_settings, user, identity)

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


def update_user_org_team_mappings(backend, details, user=None, *args, **kwargs):
    """Reconcile organization and team memberships in one bulk step."""
    if not user:
        return

    _update_user_memberships(backend, user, response=kwargs.get('response'))


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

    _update_user_memberships(backend, user, response=kwargs.get('response'), manage_teams=False)


def update_user_teams(backend, details, user=None, *args, **kwargs):
    """
    Update team memberships for the given user based on mapping rules defined
    in settings.  Organization memberships are left untouched.
    """
    if not user:
        return

    _update_user_memberships(backend, user, response=kwargs.get('response'), manage_orgs=False)
