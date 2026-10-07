from unittest import mock

import pytest

from ascender.api.versioning import reverse
from ascender.main.access import ExecutionEnvironmentBuilderBuildAccess, UnifiedJobAccess, consumer_access
from ascender.main.models import (
    Credential,
    CredentialType,
    ExecutionEnvironmentBuilder,
    ExecutionEnvironmentBuilderBuild,
    Organization,
    Project,
    UnifiedJob,
)


@pytest.fixture
def ee_project(organization):
    return Project.objects.create(
        name='ee-proj',
        organization=organization,
        scm_type='git',
        scm_url='localhost',
        execution_environment_files=['execution-environment.yml', 'other/execution-environment.yaml'],
    )


@pytest.fixture
def registry_credential(organization):
    registry = CredentialType.defaults['registry']()
    registry.save()
    return Credential.objects.create(
        credential_type=registry,
        name='registry',
        organization=organization,
        inputs={'host': 'registry.example.com', 'username': 'pusher', 'password': 'secret', 'verify_ssl': False},
    )


@pytest.fixture
def builder(organization, ee_project):
    return ExecutionEnvironmentBuilder.objects.create(
        name='test-builder',
        organization=organization,
        project=ee_project,
        execution_environment_file='execution-environment.yml',
        image='registry.example.com/test/builder',
    )


@pytest.fixture
def ee_admin(user, organization):
    u = user('ee-admin', False)
    organization.execution_environment_admin_role.members.add(u)
    return u


@pytest.fixture
def build(builder, admin):
    return builder.create_build(created_by=admin)


def builder_data(organization, project, **kwargs):
    data = {
        'name': 'new-builder',
        'organization': organization.pk,
        'project': project.pk,
        'execution_environment_file': 'execution-environment.yml',
        'image': 'registry.example.com/new',
    }
    data.update(kwargs)
    return data


@pytest.mark.django_db
class TestBuilderCreate:
    def test_superuser_can_create(self, post, admin, organization, ee_project):
        r = post(reverse('api:execution_environment_builder_list'), builder_data(organization, ee_project), admin, expect=201)
        assert r.data['tag'] == 'latest'
        assert r.data['summary_fields']['project']['id'] == ee_project.pk

    def test_ee_admin_needs_project_use(self, post, ee_admin, organization, ee_project):
        url = reverse('api:execution_environment_builder_list')
        post(url, builder_data(organization, ee_project), ee_admin, expect=403)
        ee_project.use_role.members.add(ee_admin)
        post(url, builder_data(organization, ee_project), ee_admin, expect=201)

    def test_ee_admin_needs_credential_use(self, post, ee_admin, organization, ee_project, registry_credential):
        ee_project.use_role.members.add(ee_admin)
        url = reverse('api:execution_environment_builder_list')
        post(url, builder_data(organization, ee_project, credential=registry_credential.pk), ee_admin, expect=403)
        registry_credential.use_role.members.add(ee_admin)
        post(url, builder_data(organization, ee_project, credential=registry_credential.pk), ee_admin, expect=201)

    @pytest.mark.parametrize('who', ['rando', 'org_member', 'org_auditor'])
    def test_others_cannot_create(self, request, post, who, organization, ee_project):
        u = request.getfixturevalue(who)
        ee_project.use_role.members.add(u)
        post(reverse('api:execution_environment_builder_list'), builder_data(organization, ee_project), u, expect=403)

    def test_project_is_required(self, post, admin, organization, ee_project):
        data = builder_data(organization, ee_project)
        data.pop('project')
        r = post(reverse('api:execution_environment_builder_list'), data, admin, expect=400)
        assert 'project' in r.data

    def test_file_must_be_found_in_project(self, post, admin, organization, ee_project):
        r = post(
            reverse('api:execution_environment_builder_list'), builder_data(organization, ee_project, execution_environment_file='nope.yml'), admin, expect=400
        )
        assert 'execution_environment_file' in r.data

    def test_manual_project_file_read_from_disk(self, post, admin, organization):
        project = Project.objects.create(name='manual', organization=organization)
        url = reverse('api:execution_environment_builder_list')
        with mock.patch.object(Project, 'execution_environment_definitions', new=['ee/execution-environment.yml']):
            post(url, builder_data(organization, project, execution_environment_file='ee/execution-environment.yml'), admin, expect=201)
        with mock.patch.object(Project, 'execution_environment_definitions', new=[]):
            post(url, builder_data(organization, project, name='other', execution_environment_file='ee/execution-environment.yml'), admin, expect=400)

    def test_only_registry_credentials(self, post, admin, organization, ee_project, credentialtype_ssh):
        cred = Credential.objects.create(credential_type=credentialtype_ssh, name='ssh', inputs={'username': 'x'})
        r = post(reverse('api:execution_environment_builder_list'), builder_data(organization, ee_project, credential=cred.pk), admin, expect=400)
        assert 'credential' in r.data

    @pytest.mark.parametrize('field,value', [('image', 'Not An Image!'), ('tag', ':bad'), ('image', '')])
    def test_image_and_tag_validated(self, post, admin, organization, ee_project, field, value):
        r = post(reverse('api:execution_environment_builder_list'), builder_data(organization, ee_project, **{field: value}), admin, expect=400)
        assert field in r.data


@pytest.mark.django_db
class TestBuilderReadChange:
    @pytest.mark.parametrize(
        'who,count', [('admin', 1), ('ee_admin', 1), ('org_admin', 1), ('org_auditor', 1), ('system_auditor', 1), ('org_member', 0), ('rando', 0)]
    )
    def test_list_visibility(self, request, get, builder, who, count):
        r = get(reverse('api:execution_environment_builder_list'), request.getfixturevalue(who), expect=200)
        assert r.data['count'] == count

    def test_ee_admin_can_change_and_delete(self, patch, delete, ee_admin, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        r = patch(url, {'tag': 'v2'}, ee_admin, expect=200)
        assert r.data['tag'] == 'v2'
        delete(url, ee_admin, expect=204)
        assert not ExecutionEnvironmentBuilder.objects.filter(pk=builder.pk).exists()

    def test_auditor_cannot_change(self, patch, org_auditor, builder):
        patch(reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk}), {'tag': 'v2'}, org_auditor, expect=403)

    def test_move_needs_ee_admin_of_both_orgs(self, patch, ee_admin, builder):
        other = Organization.objects.create(name='other-org')
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        patch(url, {'organization': other.pk}, ee_admin, expect=403)
        other.execution_environment_admin_role.members.add(ee_admin)
        patch(url, {'organization': other.pk}, ee_admin, expect=200)

    def test_capabilities(self, get, ee_admin, org_auditor, builder):
        url = reverse('api:execution_environment_builder_detail', kwargs={'pk': builder.pk})
        builder.project.use_role.members.add(ee_admin)
        caps = get(url, ee_admin, expect=200).data['summary_fields']['user_capabilities']
        assert caps == {'edit': True, 'delete': True, 'start': True, 'copy': True}
        caps = get(url, org_auditor, expect=200).data['summary_fields']['user_capabilities']
        assert caps == {'edit': False, 'delete': False, 'start': False, 'copy': False}

    def test_copy(self, post, admin, builder):
        r = post(reverse('api:execution_environment_builder_copy', kwargs={'pk': builder.pk}), {'name': 'copied'}, admin, expect=201)
        copied = ExecutionEnvironmentBuilder.objects.get(pk=r.data['id'])
        assert (copied.project, copied.image, copied.execution_environment_file) == (builder.project, builder.image, builder.execution_environment_file)

    def test_access_list_and_object_roles(self, get, admin, rando, builder):
        get(reverse('api:execution_environment_builder_access_list', kwargs={'pk': builder.pk}), admin, expect=200)
        r = get(reverse('api:execution_environment_builder_object_roles_list', kwargs={'pk': builder.pk}), admin, expect=200)
        assert sorted(role['name'] for role in r.data['results']) == ['Admin', 'Read']
        get(reverse('api:execution_environment_builder_access_list', kwargs={'pk': builder.pk}), rando, expect=403)

    def test_project_files_endpoint(self, get, admin, ee_project):
        r = get(reverse('api:project_execution_environment_files', kwargs={'pk': ee_project.pk}), admin, expect=200)
        assert r.data == ['execution-environment.yml', 'other/execution-environment.yaml']


@pytest.mark.django_db
class TestLaunch:
    @mock.patch.object(ExecutionEnvironmentBuilderBuild, 'signal_start')
    def test_ee_admin_can_launch(self, signal_start, post, ee_admin, builder):
        r = post(reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk}), {}, ee_admin, expect=201)
        build = ExecutionEnvironmentBuilderBuild.objects.get(pk=r.data['execution_environment_builder_build'])
        assert r.data['type'] == 'execution_environment_builder_build'
        assert build.name == builder.name
        assert build.organization == builder.organization
        assert build.created_by == ee_admin
        assert build.dependencies_processed is True
        assert build.capacity_type == 'control'
        signal_start.assert_called_once()

    @pytest.mark.parametrize('who', ['rando', 'org_member', 'org_auditor'])
    def test_others_cannot_launch(self, request, post, builder, who):
        post(reverse('api:execution_environment_builder_launch', kwargs={'pk': builder.pk}), {}, request.getfixturevalue(who), expect=403)


@pytest.mark.django_db
class TestBuilds:
    @pytest.mark.parametrize('who,count', [('admin', 1), ('ee_admin', 1), ('org_admin', 1), ('org_auditor', 1), ('org_member', 0), ('rando', 0)])
    def test_visible_in_build_and_unified_job_lists(self, request, get, build, who, count):
        u = request.getfixturevalue(who)
        assert get(reverse('api:execution_environment_builder_build_list'), u, expect=200).data['count'] == count
        r = get(reverse('api:unified_job_list') + '?type=execution_environment_builder_build', u, expect=200)
        assert [j['id'] for j in r.data['results']] == [build.pk] * count

    def test_ee_admin_sees_build_without_org_role(self, ee_admin, build):
        # an EE admin who is not an org admin or auditor reaches the build through the builder
        build.organization = None
        build.save(update_fields=['organization'])
        assert UnifiedJobAccess(ee_admin).get_queryset().filter(pk=build.pk).exists()

    def test_detail(self, get, admin, build):
        r = get(reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk}), admin, expect=200)
        assert r.data['summary_fields']['execution_environment_builder'] == {
            'id': build.execution_environment_builder.pk,
            'name': 'test-builder',
            'description': '',
            'image': 'registry.example.com/test/builder',
            'tag': 'latest',
            'execution_environment_file': 'execution-environment.yml',
        }
        assert r.data['summary_fields']['project']['id'] == build.execution_environment_builder.project_id
        assert r.data['playbook_counts'] == {'play_count': 0, 'task_count': 0}
        assert {'cancel', 'relaunch', 'events', 'stdout', 'execution_environment_builder'} <= set(r.data['related'])
        get(reverse('api:execution_environment_builder_builds_list', kwargs={'pk': build.execution_environment_builder.pk}), admin, expect=200)

    @mock.patch.object(ExecutionEnvironmentBuilderBuild, 'signal_start')
    def test_relaunch(self, signal_start, post, ee_admin, org_auditor, build):
        url = reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': build.pk})
        post(url, {}, org_auditor, expect=403)
        r = post(url, {}, ee_admin, expect=201)
        relaunched = ExecutionEnvironmentBuilderBuild.objects.get(pk=r.data['id'])
        assert relaunched.launch_type == 'relaunch'
        assert relaunched.execution_environment_builder == build.execution_environment_builder

    def test_cancel_and_delete(self, get, post, delete, ee_admin, org_auditor, build):
        build.status = 'running'
        build.save(update_fields=['status'])
        cancel = reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': build.pk})
        assert get(cancel, ee_admin, expect=200).data['can_cancel'] is True
        post(cancel, {}, org_auditor, expect=403)
        build.status = 'successful'
        build.save(update_fields=['status'])
        detail = reverse('api:execution_environment_builder_build_detail', kwargs={'pk': build.pk})
        delete(detail, org_auditor, expect=403)
        delete(detail, ee_admin, expect=204)

    def test_events(self, get, admin, rando, build):
        url = reverse('api:execution_environment_builder_build_events_list', kwargs={'pk': build.pk})
        r = get(url, admin, expect=200)
        assert r['X-UI-Max-Events']
        get(url, rando, expect=403)

    def test_websocket_event_group_is_authorized(self, ee_admin, build):
        assert consumer_access('execution_environment_builder_build_events') is ExecutionEnvironmentBuilderBuildAccess
        assert ExecutionEnvironmentBuilderBuildAccess(ee_admin).get_queryset().filter(pk=build.pk).exists()

    def test_deleting_builder_deletes_builds(self, build):
        build.execution_environment_builder.delete()
        assert not UnifiedJob.objects.filter(pk=build.pk).exists()
