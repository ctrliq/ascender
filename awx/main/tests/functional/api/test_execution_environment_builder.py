# Python
import pytest
from unittest import mock

# AWX
from awx.api.versioning import reverse
from awx.main.models import Organization, User
from awx.main.models.execution_environment_builders import ExecutionEnvironmentBuilder
from awx.main.models.execution_environment_builder_builds import ExecutionEnvironmentBuilderBuild


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def builder(organization):
    return ExecutionEnvironmentBuilder.objects.create(
        name='test-builder',
        organization=organization,
        image='quay.io/test/builder',
        tag='latest',
    )


@pytest.fixture
def ee_admin(user, organization):
    """User with execution_environment_admin_role on the org."""
    u = user('ee-admin', False)
    organization.execution_environment_admin_role.members.add(u)
    return u


@pytest.fixture
def builder_admin(user, builder):
    """User with admin_role directly on the builder."""
    u = user('builder-admin', False)
    builder.admin_role.members.add(u)
    return u


@pytest.fixture
def build(builder, admin):
    return ExecutionEnvironmentBuilderBuild.objects.create(
        execution_environment_builder=builder,
        name='test-build',
        status='new',
        created_by=admin,
    )


# ---------------------------------------------------------------------------
# Builder CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderList:
    def test_admin_can_list(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_list')
        r = get(url, admin, expect=200)
        assert r.data['count'] >= 1

    def test_ee_admin_can_list(self, get, ee_admin, builder):
        url = reverse('api:execution_environment_builder_list')
        r = get(url, ee_admin, expect=200)
        assert r.data['count'] >= 1

    def test_rando_sees_empty_list(self, get, rando, builder):
        url = reverse('api:execution_environment_builder_list')
        r = get(url, rando, expect=200)
        assert r.data['count'] == 0

    def test_org_auditor_can_see(self, get, org_auditor, builder):
        """Org auditors have read_role through auditor_role → read_role chain."""
        url = reverse('api:execution_environment_builder_list')
        r = get(url, org_auditor, expect=200)
        assert r.data['count'] >= 1

    def test_admin_can_create(self, post, admin, organization):
        url = reverse('api:execution_environment_builder_list')
        r = post(url, {'name': 'new-builder', 'organization': organization.pk, 'image': 'quay.io/new'}, admin, expect=201)
        assert r.data['name'] == 'new-builder'

    def test_ee_admin_can_create(self, post, ee_admin, organization):
        url = reverse('api:execution_environment_builder_list')
        r = post(url, {'name': 'ee-admin-builder', 'organization': organization.pk, 'image': 'quay.io/new'}, ee_admin, expect=201)
        assert r.data['name'] == 'ee-admin-builder'

    def test_rando_cannot_create(self, post, rando, organization):
        url = reverse('api:execution_environment_builder_list')
        post(url, {'name': 'bad-builder', 'organization': organization.pk}, rando, expect=403)

    def test_org_member_cannot_create(self, post, org_member, organization):
        url = reverse('api:execution_environment_builder_list')
        post(url, {'name': 'bad-builder', 'organization': organization.pk}, org_member, expect=403)


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderDetail:
    def test_admin_can_read(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        assert r.data['name'] == 'test-builder'
        assert r.data['image'] == 'quay.io/test/builder'

    def test_rando_cannot_read(self, get, rando, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        get(url, rando, expect=403)

    def test_ee_admin_can_update(self, patch, ee_admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = patch(url, {'name': 'renamed-builder'}, ee_admin, expect=200)
        assert r.data['name'] == 'renamed-builder'

    def test_rando_cannot_update(self, patch, rando, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        patch(url, {'name': 'renamed-builder'}, rando, expect=403)

    def test_org_member_cannot_update(self, patch, org_member, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        patch(url, {'name': 'renamed-builder'}, org_member, expect=403)

    def test_ee_admin_can_delete(self, delete, ee_admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        delete(url, ee_admin, expect=204)
        assert not ExecutionEnvironmentBuilder.objects.filter(pk=builder.pk).exists()

    def test_rando_cannot_delete(self, delete, rando, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        delete(url, rando, expect=403)

    def test_summary_fields_include_organization(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        assert 'organization' in r.data['summary_fields']
        assert r.data['summary_fields']['organization']['id'] == builder.organization.pk

    def test_related_links(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        related = r.data.get('related', {})
        assert 'access_list' in related
        assert 'object_roles' in related


# ---------------------------------------------------------------------------
# Builder Launch
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderLaunch:
    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_admin_can_launch(self, mock_start, post, admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = post(url, {}, admin, expect=201)
        assert 'execution_environment_builder_build' in r.data
        build_id = r.data['execution_environment_builder_build']
        assert ExecutionEnvironmentBuilderBuild.objects.filter(pk=build_id).exists()
        mock_start.assert_called_once()

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_builder_admin_can_launch(self, mock_start, post, builder_admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = post(url, {}, builder_admin, expect=201)
        assert 'execution_environment_builder_build' in r.data

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_ee_admin_can_launch(self, mock_start, post, ee_admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = post(url, {}, ee_admin, expect=201)
        assert 'execution_environment_builder_build' in r.data

    def test_rando_cannot_launch(self, post, rando, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        post(url, {}, rando, expect=403)

    def test_org_member_cannot_launch(self, post, org_member, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        post(url, {}, org_member, expect=403)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_launch_with_custom_name(self, mock_start, post, admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = post(url, {'name': 'Custom Build Name'}, admin, expect=201)
        build_id = r.data['execution_environment_builder_build']
        build = ExecutionEnvironmentBuilderBuild.objects.get(pk=build_id)
        assert build.name == 'Custom Build Name'

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_launch_default_name(self, mock_start, post, admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = post(url, {}, admin, expect=201)
        build_id = r.data['execution_environment_builder_build']
        build = ExecutionEnvironmentBuilderBuild.objects.get(pk=build_id)
        assert builder.name in build.name

    def test_get_launch_endpoint(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        assert r.data == {}


# ---------------------------------------------------------------------------
# Build CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderBuildList:
    def test_admin_can_list_builds(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_list')
        r = get(url, admin, expect=200)
        assert r.data['count'] >= 1

    def test_rando_sees_empty_build_list(self, get, rando, build):
        url = reverse('api:execution_environment_builder_build_list')
        r = get(url, rando, expect=200)
        assert r.data['count'] == 0

    def test_ee_admin_can_list_builds(self, get, ee_admin, build):
        url = reverse('api:execution_environment_builder_build_list')
        r = get(url, ee_admin, expect=200)
        assert r.data['count'] >= 1

    def test_org_auditor_can_list_builds(self, get, org_auditor, build):
        url = reverse('api:execution_environment_builder_build_list')
        r = get(url, org_auditor, expect=200)
        assert r.data['count'] >= 1


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderBuildDetail:
    def test_admin_can_read_build(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert r.data['name'] == 'test-build'

    def test_rando_cannot_read_build(self, get, rando, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        get(url, rando, expect=403)

    def test_admin_can_delete_build(self, delete, admin, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        delete(url, admin, expect=204)

    def test_rando_cannot_delete_build(self, delete, rando, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        delete(url, rando, expect=403)

    def test_build_detail_has_summary_fields(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert 'summary_fields' in r.data

    def test_org_auditor_can_read_build(self, get, org_auditor, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        r = get(url, org_auditor, expect=200)
        assert r.data['name'] == 'test-build'

    def test_org_admin_can_delete_build(self, delete, org_admin, build):
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        delete(url, org_admin, expect=204)

    def test_creator_can_delete_build(self, delete, admin, build):
        """Build was created_by=admin, so admin (as creator) can delete."""
        url = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        delete(url, admin, expect=204)


# ---------------------------------------------------------------------------
# Build Relaunch
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderBuildRelaunch:
    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_admin_can_relaunch(self, mock_start, post, admin, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        r = post(url, {}, admin, expect=200)
        assert 'id' in r.data
        new_build = ExecutionEnvironmentBuilderBuild.objects.get(pk=r.data['id'])
        assert new_build.launch_type == 'relaunch'
        assert new_build.execution_environment_builder == build.execution_environment_builder
        mock_start.assert_called_once()

    def test_rando_cannot_relaunch(self, post, rando, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        post(url, {}, rando, expect=403)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_org_admin_can_relaunch(self, mock_start, post, org_admin, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        r = post(url, {}, org_admin, expect=200)
        assert 'id' in r.data
        new_build = ExecutionEnvironmentBuilderBuild.objects.get(pk=r.data['id'])
        assert new_build.launch_type == 'relaunch'

    def test_ee_admin_cannot_relaunch(self, post, ee_admin, build):
        """ee_admin has execution_environment_admin_role but not org admin_role."""
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        post(url, {}, ee_admin, expect=403)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.signal_start', return_value=True)
    def test_relaunch_uses_builder_name(self, mock_start, post, admin, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        r = post(url, {}, admin, expect=200)
        new_build = ExecutionEnvironmentBuilderBuild.objects.get(pk=r.data['id'])
        assert build.execution_environment_builder.name in new_build.name

    def test_get_relaunch_endpoint(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert r.data == {}


# ---------------------------------------------------------------------------
# Build Cancel
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderBuildCancel:
    def test_admin_can_get_cancel_info(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert 'can_cancel' in r.data

    def test_rando_cannot_cancel(self, post, rando, build):
        build.status = 'running'
        build.save(update_fields=['status'])
        url = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        post(url, {}, rando, expect=403)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.cancel', return_value=True)
    def test_org_admin_can_cancel(self, mock_cancel, post, org_admin, build):
        build.status = 'running'
        build.save(update_fields=['status'])
        url = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        post(url, {}, org_admin, expect=202)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.cancel', return_value=True)
    def test_creator_can_cancel(self, mock_cancel, post, admin, build):
        build.status = 'running'
        build.save(update_fields=['status'])
        url = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        post(url, {}, admin, expect=202)

    @mock.patch('awx.main.models.unified_jobs.UnifiedJob.cancel', return_value=True)
    def test_ee_admin_can_cancel(self, mock_cancel, post, ee_admin, build):
        """ee_admin can change the builder, so can cancel its builds."""
        build.status = 'running'
        build.save(update_fields=['status'])
        url = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        post(url, {}, ee_admin, expect=202)


# ---------------------------------------------------------------------------
# Events listing
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderBuildEvents:
    def test_admin_can_list_events(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_events_list', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert r.data['count'] == 0

    def test_rando_cannot_list_events(self, get, rando, build):
        url = reverse('api:execution_environment_builder_build_events_list', kwargs={'pk': build.pk})
        get(url, rando, expect=403)

    def test_max_events_header(self, get, admin, build):
        url = reverse('api:execution_environment_builder_build_events_list', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert 'X-UI-Max-Events' in r


# ---------------------------------------------------------------------------
# Access list & object roles
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderAccessList:
    def test_admin_can_view_access_list(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_access_list', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        assert 'count' in r.data

    def test_rando_cannot_view_access_list(self, get, rando, builder):
        url = reverse('api:execution_environment_builder_access_list', kwargs={'pk': builder.pk})
        get(url, rando, expect=403)


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderObjectRoles:
    def test_admin_can_view_object_roles(self, get, admin, builder):
        url = reverse('api:execution_environment_builder_object_roles_list', kwargs={'pk': builder.pk})
        r = get(url, admin, expect=200)
        assert r.data['count'] >= 1  # admin_role and read_role

    def test_rando_cannot_view_object_roles(self, get, rando, builder):
        url = reverse('api:execution_environment_builder_object_roles_list', kwargs={'pk': builder.pk})
        get(url, rando, expect=403)


# ---------------------------------------------------------------------------
# Copy
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderCopy:
    def test_admin_can_copy(self, post, admin, builder):
        url = reverse('api:execution_environment_builder_copy', kwargs={'pk': builder.pk})
        r = post(url, {'name': 'test-builder copy'}, admin, expect=201)
        assert r.data['id'] != builder.pk
        assert 'test-builder' in r.data['name']

    def test_rando_cannot_copy(self, post, rando, builder):
        url = reverse('api:execution_environment_builder_copy', kwargs={'pk': builder.pk})
        post(url, {}, rando, expect=403)


# ---------------------------------------------------------------------------
# RBAC: org transfer
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExecutionEnvironmentBuilderOrgTransfer:
    def test_ee_admin_can_transfer_to_another_org(self, patch, user, builder, organization):
        """EE admin of both orgs can transfer a builder."""
        other_org = Organization.objects.create(name='other-org')
        u = user('dual-ee-admin', False)
        organization.execution_environment_admin_role.members.add(u)
        other_org.execution_environment_admin_role.members.add(u)
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = patch(url, {'organization': other_org.pk}, u, expect=200)
        assert r.data['organization'] == other_org.pk

    def test_cannot_transfer_without_target_org_role(self, patch, ee_admin, builder):
        """EE admin of source org only cannot transfer to another org."""
        other_org = Organization.objects.create(name='other-org')
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        patch(url, {'organization': other_org.pk}, ee_admin, expect=403)

    def test_ee_admin_cannot_transfer_without_target_role(self, patch, ee_admin, builder):
        """EE admin of source org cannot transfer to an org where they lack the role."""
        other_org = Organization.objects.create(name='other-org')
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        patch(url, {'organization': other_org.pk}, ee_admin, expect=403)
