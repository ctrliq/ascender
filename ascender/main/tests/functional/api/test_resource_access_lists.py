import pytest
from django.test import override_settings

from ascender.api.versioning import reverse
from ascender.main.models import Role


@pytest.mark.django_db
def test_access_list_hides_system_roles_when_setting_enabled(get, organization, project, admin, system_auditor, user):
    """
    With ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS enabled, the system-wide singleton
    roles are hidden from the access list: a user who reaches a resource only
    through them disappears, and one who also holds an organizational role stays
    visible with that role but without the singleton.
    """
    superuser_org_admin = user('superuser-org-admin', True)
    organization.admin_role.members.add(superuser_org_admin)

    with override_settings(ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS=True):
        result = get(reverse('api:project_access_list', kwargs={'pk': project.id}), admin)

    assert result.status_code == 200
    results = {r['id']: r for r in result.data['results']}

    # Pure system admins and auditors no longer appear.
    assert admin.id not in results
    assert system_auditor.id not in results

    # A superuser tied to the resource's organization still appears...
    assert superuser_org_admin.id in results

    # ...but their system-wide role is not shown anymore, only the org role.
    record = results[superuser_org_admin.id]['summary_fields']
    displayed_role_ids = [access['role']['id'] for access in record.get('direct_access', []) + record.get('indirect_access', [])]
    system_role_ids = {
        Role.singleton('system_administrator').id,
        Role.singleton('system_auditor').id,
    }
    assert displayed_role_ids
    assert not set(displayed_role_ids) & system_role_ids
    assert organization.admin_role.id in displayed_role_ids


@pytest.mark.django_db
def test_user_roles_still_show_system_roles_when_setting_enabled(get, admin, system_auditor):
    """
    /api/v2/users/<id>/roles/ lists every role a user actually holds and is
    unaffected by ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS: the System
    Administrator and System Auditor singletons must still appear there.
    """
    with override_settings(ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS=True):
        admin_roles = get(reverse('api:user_roles_list', kwargs={'pk': admin.id}), admin)
        auditor_roles = get(reverse('api:user_roles_list', kwargs={'pk': system_auditor.id}), admin)

    assert admin_roles.status_code == 200
    assert Role.singleton('system_administrator').id in {r['id'] for r in admin_roles.data['results']}

    assert auditor_roles.status_code == 200
    assert Role.singleton('system_auditor').id in {r['id'] for r in auditor_roles.data['results']}


@pytest.mark.django_db
def test_direct_grant_holder_still_shown_when_setting_enabled(get, project, admin, user):
    """
    A user who is both a System Administrator and a direct grant-holder on the
    resource still appears in its access list when
    ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS is enabled; only their system-wide
    role is hidden from the display.
    """
    sysadmin_direct = user('sysadmin-direct', True)
    project.admin_role.members.add(sysadmin_direct)

    with override_settings(ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS=True):
        result = get(reverse('api:project_access_list', kwargs={'pk': project.id}), admin)

    assert result.status_code == 200
    results = {r['id']: r for r in result.data['results']}

    assert sysadmin_direct.id in results
    record = results[sysadmin_direct.id]['summary_fields']
    displayed_role_ids = [access['role']['id'] for access in record.get('direct_access', []) + record.get('indirect_access', [])]
    system_role_ids = {
        Role.singleton('system_administrator').id,
        Role.singleton('system_auditor').id,
    }
    assert project.admin_role.id in displayed_role_ids
    assert not set(displayed_role_ids) & system_role_ids


@pytest.mark.django_db
def test_indirect_access_list(get, organization, project, team_factory, user, admin):
    project_admin = user('project_admin')
    project_admin_team_member = user('project_admin_team_member')

    team_admin = user('team_admin')

    project_admin_team = team_factory('project-admin-team')

    project.admin_role.members.add(project_admin)
    project_admin_team.member_role.members.add(project_admin_team_member)
    project_admin_team.member_role.children.add(project.admin_role)

    project_admin_team.admin_role.members.add(team_admin)

    result = get(reverse('api:project_access_list', kwargs={'pk': project.id}), admin)
    assert result.status_code == 200

    # Result should be:
    #   project_admin should have direct access,
    #   project_team_admin should have "direct" access through being a team member -> project admin,
    #   team_admin should have direct access the same as the project_team_admin,
    #   admin should have access through system admin -> org admin -> project admin
    assert result.data['count'] == 4

    project_admin_res = [r for r in result.data['results'] if r['id'] == project_admin.id][0]
    team_admin_res = [r for r in result.data['results'] if r['id'] == team_admin.id][0]
    project_admin_team_member_res = [r for r in result.data['results'] if r['id'] == project_admin_team_member.id][0]
    admin_res = [r for r in result.data['results'] if r['id'] == admin.id][0]

    assert len(project_admin_res['summary_fields']['direct_access']) == 1
    assert len(project_admin_res['summary_fields']['indirect_access']) == 0
    assert len(team_admin_res['summary_fields']['direct_access']) == 1
    assert len(team_admin_res['summary_fields']['indirect_access']) == 0
    assert len(admin_res['summary_fields']['direct_access']) == 0
    assert len(admin_res['summary_fields']['indirect_access']) == 1

    project_admin_entry = project_admin_res['summary_fields']['direct_access'][0]['role']
    assert project_admin_entry['id'] == project.admin_role.id
    # assure that results for team admin are the same as for team member
    team_admin_entry = team_admin_res['summary_fields']['direct_access'][0]['role']
    assert team_admin_entry['id'] == project.admin_role.id
    assert team_admin_entry['name'] == 'Admin'

    project_admin_team_member_entry = project_admin_team_member_res['summary_fields']['direct_access'][0]['role']
    assert project_admin_team_member_entry['id'] == project.admin_role.id
    assert project_admin_team_member_entry['team_id'] == project_admin_team.id
    assert project_admin_team_member_entry['team_name'] == project_admin_team.name

    admin_entry = admin_res['summary_fields']['indirect_access'][0]['role']
    assert admin_entry['name'] == Role.singleton('system_administrator').name
