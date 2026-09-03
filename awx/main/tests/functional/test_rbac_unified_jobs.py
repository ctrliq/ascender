import pytest

from django.test.utils import CaptureQueriesContext
from django.db import connection

from awx.api.versioning import reverse
from awx.main.models import (
    AdHocCommand,
    InventorySource,
    InventoryUpdate,
    JobTemplate,
    Organization,
    Project,
    UnifiedJob,
    WorkflowApproval,
)


@pytest.mark.django_db
def test_unified_job_list_uses_or_not_union(user, organization, inventory, get):
    """The unified job list RBAC query uses OR-based filtering, not UNION."""
    org_admin = user('uj-org-admin')
    organization.admin_role.members.add(org_admin)

    project = Project.objects.create(name='uj-test-project', organization=organization)
    jt = JobTemplate.objects.create(name='uj-test-jt', project=project, inventory=inventory, organization=organization)
    jt.create_unified_job()

    inv_src = InventorySource.objects.create(name='uj-test-invsrc', inventory=inventory, source='ec2')
    InventoryUpdate.objects.create(inventory_source=inv_src, source=inv_src.source)

    AdHocCommand.objects.create(name='uj-test-adhoc', inventory=inventory)

    with CaptureQueriesContext(connection) as ctx:
        response = get(reverse('api:unified_job_list'), org_admin)

    assert response.status_code == 200
    assert response.data['count'] >= 3

    uj_rbac_queries = [q['sql'] for q in ctx.captured_queries if 'main_unifiedjob' in q['sql'] and 'main_rbac_role_ancestors' in q['sql']]
    assert uj_rbac_queries, "Expected a unified-job RBAC query"
    for sql in uj_rbac_queries:
        assert 'UNION' not in sql, "RBAC query should use OR, not UNION"


@pytest.mark.django_db
def test_unified_job_list_org_auditor_sees_jobs(user, get):
    """Org auditors see unified jobs in their org via the org auditor RBAC branch."""
    org = Organization.objects.create(name='uj-audit-org')
    auditor = user('uj-auditor')
    org.auditor_role.members.add(auditor)

    inventory = org.inventories.create(name='uj-audit-inv')
    project = Project.objects.create(name='uj-audit-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-audit-jt', project=project, inventory=inventory, organization=org)
    job = jt.create_unified_job()

    response = get(reverse('api:unified_job_list'), auditor)
    assert response.status_code == 200
    result_ids = [r['id'] for r in response.data['results']]
    assert job.pk in result_ids


@pytest.mark.django_db
def test_unified_job_list_inventory_viewer_sees_inventory_updates(user, get):
    """Users with inventory read permission see inventory updates via the inventory RBAC branch."""
    org = Organization.objects.create(name='uj-inv-org')
    inventory = org.inventories.create(name='uj-inv-test')
    inv_viewer = user('uj-inv-viewer')
    inventory.read_role.members.add(inv_viewer)

    inv_src = InventorySource.objects.create(name='uj-inv-src', inventory=inventory, source='ec2')
    inv_update = InventoryUpdate.objects.create(inventory_source=inv_src, source=inv_src.source)

    response = get(reverse('api:unified_job_list'), inv_viewer)
    assert response.status_code == 200
    result_ids = [r['id'] for r in response.data['results']]
    assert inv_update.pk in result_ids


@pytest.mark.django_db
def test_unified_job_list_team_grant_sees_jobs(user, get):
    """Access granted through a team (not a direct user->role grant) still
    surfaces jobs; the pre-computed role set must include team-mediated
    ancestry, not just directly-granted object roles."""
    from awx.main.models import Team

    org = Organization.objects.create(name='uj-team-org')
    inventory = org.inventories.create(name='uj-team-inv')
    project = Project.objects.create(name='uj-team-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-team-jt', project=project, inventory=inventory, organization=org)
    job = jt.create_unified_job()

    team = Team.objects.create(name='uj-team', organization=org)
    team_member = user('uj-team-member')
    team.member_role.members.add(team_member)
    jt.read_role.parents.add(team.member_role)

    response = get(reverse('api:unified_job_list'), team_member)
    assert response.status_code == 200
    result_ids = [r['id'] for r in response.data['results']]
    assert job.pk in result_ids


@pytest.mark.django_db
def test_unified_job_list_org_member_sees_nothing(user, get):
    """A user with roles (org member) but no job-related access sees no jobs.
    Unlike rando, this user has a non-empty role set, so it exercises the
    full OR query rather than the empty-role-set early exit."""
    org = Organization.objects.create(name='uj-member-org')
    member = user('uj-member')
    org.member_role.members.add(member)

    inventory = org.inventories.create(name='uj-member-inv')
    project = Project.objects.create(name='uj-member-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-member-jt', project=project, inventory=inventory, organization=org)
    jt.create_unified_job()

    response = get(reverse('api:unified_job_list'), member)
    assert response.status_code == 200
    assert len(response.data['results']) == 0


@pytest.mark.django_db
def test_unified_job_list_superuser_no_roles_sees_all(user, get):
    """A superuser with zero role memberships sees all jobs. Superusers are
    handled by the BaseAccess.get_queryset short-circuit, so the empty-role-set
    early exit in filtered_queryset must never be reachable for them."""
    superuser = user('uj-superuser', True)
    # Old-RBAC signals auto-enroll superusers in the system_administrator
    # singleton role; strip role memberships (restoring the flag without
    # signals) to prove the bypass does not depend on any role rows.
    superuser.roles.clear()
    type(superuser).objects.filter(pk=superuser.pk).update(is_superuser=True)
    superuser.refresh_from_db()
    assert superuser.is_superuser
    assert superuser.roles.count() == 0

    org = Organization.objects.create(name='uj-super-org')
    inventory = org.inventories.create(name='uj-super-inv')
    project = Project.objects.create(name='uj-super-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-super-jt', project=project, inventory=inventory, organization=org)
    job = jt.create_unified_job()

    response = get(reverse('api:unified_job_list'), superuser)
    assert response.status_code == 200
    result_ids = [r['id'] for r in response.data['results']]
    assert job.pk in result_ids


@pytest.mark.django_db
def test_unified_job_list_system_auditor_sees_all(system_auditor, get):
    """System auditors bypass filtered_queryset via BaseAccess.get_queryset —
    the closest analog of upstream's singleton-permission shortcut paths."""
    org = Organization.objects.create(name='uj-sysaud-org')
    inventory = org.inventories.create(name='uj-sysaud-inv')
    project = Project.objects.create(name='uj-sysaud-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-sysaud-jt', project=project, inventory=inventory, organization=org)
    job = jt.create_unified_job()

    inv_src = InventorySource.objects.create(name='uj-sysaud-invsrc', inventory=inventory, source='ec2')
    inv_update = InventoryUpdate.objects.create(inventory_source=inv_src, source=inv_src.source)

    adhoc = AdHocCommand.objects.create(name='uj-sysaud-adhoc', inventory=inventory)

    response = get(reverse('api:unified_job_list'), system_auditor)
    assert response.status_code == 200
    result_ids = [r['id'] for r in response.data['results']]
    assert job.pk in result_ids
    assert inv_update.pk in result_ids
    assert adhoc.pk in result_ids


@pytest.mark.django_db
def test_unified_job_list_rando_sees_nothing(rando, get):
    """Unprivileged user sees no unified jobs."""
    org = Organization.objects.create(name='uj-rando-org')
    inventory = org.inventories.create(name='uj-rando-inv')
    project = Project.objects.create(name='uj-rando-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-rando-jt', project=project, inventory=inventory, organization=org)
    jt.create_unified_job()
    AdHocCommand.objects.create(name='uj-rando-adhoc', inventory=inventory)

    response = get(reverse('api:unified_job_list'), rando)
    assert response.status_code == 200
    assert len(response.data['results']) == 0


@pytest.mark.django_db
def test_unified_job_list_pagination_uses_unfiltered_count(rando, get):
    """The pagination count should reflect total unified job rows, not
    the RBAC-filtered subset.  The RBAC-filtered COUNT is catastrophically
    slow on large tables with pk__in UNION subqueries.

    Workflow approvals are the exception: UnifiedJobAccess.get_queryset
    hides them from every request (superusers included), so counting them
    would inflate the page count with rows the endpoint can never return."""
    org = Organization.objects.create(name='uj-count-org')
    inventory = org.inventories.create(name='uj-count-inv')
    project = Project.objects.create(name='uj-count-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-count-jt', project=project, inventory=inventory, organization=org)
    jt.create_unified_job()
    WorkflowApproval.objects.create(name='uj-count-wfa')

    visible_jobs = UnifiedJob.objects.filter(workflowapproval__isnull=True).count()
    assert visible_jobs > 0
    assert UnifiedJob.objects.count() == visible_jobs + 1

    response = get(reverse('api:unified_job_list'), rando)
    assert response.status_code == 200
    assert len(response.data['results']) == 0
    assert response.data['count'] == visible_jobs


@pytest.mark.django_db
def test_unified_job_list_filtered_count_is_accurate(admin_user, get):
    """A search or field filter must report the filtered count, not the
    unfiltered table count — otherwise clients paginate against the full
    table and render phantom empty pages (and next links)."""
    org = Organization.objects.create(name='uj-filter-org')
    inventory = org.inventories.create(name='uj-filter-inv')
    project = Project.objects.create(name='uj-filter-project', organization=org)
    jt = JobTemplate.objects.create(name='uj-filter-jt', project=project, inventory=inventory, organization=org)
    for _ in range(3):
        jt.create_unified_job()

    assert UnifiedJob.objects.count() >= 3

    url = reverse('api:unified_job_list') + '?name__icontains=zzz-no-match&page_size=2'
    response = get(url, admin_user)
    assert response.status_code == 200
    assert response.data['count'] == 0
    assert response.data['results'] == []
    assert response.data['next'] is None

    url = reverse('api:unified_job_list') + '?name__icontains=uj-filter-jt&page_size=2'
    response = get(url, admin_user)
    assert response.status_code == 200
    assert response.data['count'] == 3
    assert len(response.data['results']) == 2
    assert response.data['next'] is not None
