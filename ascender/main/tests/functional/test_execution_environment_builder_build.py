import configparser
import logging
import os
from datetime import timedelta
from unittest import mock

import pytest
import yaml

from django.utils.timezone import now

from ascender.main.management.commands.cleanup_jobs import Command as CleanupJobs
from ascender.main.models import (
    Credential,
    CredentialType,
    ExecutionEnvironment,
    ExecutionEnvironmentBuilder,
    ExecutionEnvironmentBuilderBuild,
    ExecutionEnvironmentBuilderBuildEvent,
    Project,
)
from ascender.main.scheduler.dependency_graph import DependencyGraph
from ascender.main.tasks.jobs import RunExecutionEnvironmentBuilderBuild, RunProjectUpdate
from ascender.main.utils.safe_yaml import SafeLoader


@pytest.fixture
def builder(organization):
    project = Project.objects.create(name='ee-proj', organization=organization, scm_type='git', scm_url='localhost')
    return ExecutionEnvironmentBuilder.objects.create(
        name='builder',
        organization=organization,
        project=project,
        execution_environment_file='ee/execution-environment.yml',
        image='registry.example.com/team/ee',
        tag='1.0',
    )


@pytest.fixture
def build(builder):
    build = builder.create_build()
    build.execution_environment = ExecutionEnvironment.objects.create(name='default', image='quay.io/ansible/awx-ee:latest')
    return build


@pytest.fixture
def task(build):
    task = RunExecutionEnvironmentBuilderBuild()
    task.instance = build
    return task


@pytest.fixture
def private_data_dir(tmp_path):
    for subfolder in ('env', 'inventory'):
        (tmp_path / subfolder).mkdir()
    return str(tmp_path)


def read_extra_vars(private_data_dir):
    with open(os.path.join(private_data_dir, 'env', 'extravars')) as f:
        return yaml.load(f, SafeLoader)


@pytest.mark.django_db
class TestRunExecutionEnvironmentBuilderBuild:
    def test_extra_vars_without_credential(self, task, build, private_data_dir):
        task.build_extra_vars_file(build, private_data_dir)
        assert read_extra_vars(private_data_dir) == {
            'execution_environment_image': 'registry.example.com/team/ee',
            'execution_environment_tag': '1.0',
            'execution_environment_file': 'ee/execution-environment.yml',
            'execution_environment_build_file': 'ee/execution-environment.yml',
        }

    def test_extra_vars_with_registry_credential(self, task, build, builder, private_data_dir):
        registry = CredentialType.defaults['registry']()
        registry.save()
        builder.credential = Credential.objects.create(
            credential_type=registry,
            name='registry',
            inputs={'host': 'registry.example.com', 'username': 'pusher', 'password': '{{ not_a_template }}', 'verify_ssl': False},
        )
        builder.save()
        task.build_extra_vars_file(build, private_data_dir)
        assert read_extra_vars(private_data_dir)['registry_credential'] == {
            'host': 'registry.example.com',
            'username': 'pusher',
            'password': '{{ not_a_template }}',
            'verify_ssl': False,
        }
        # values are written as !unsafe, so ansible never renders them as templates
        with open(os.path.join(private_data_dir, 'env', 'extravars')) as f:
            assert "!unsafe 'password': !unsafe '{{ not_a_template }}'" in f.read()

    def test_runs_playbook_against_localhost(self, task, build, private_data_dir):
        assert task.build_inventory(build, private_data_dir) == 'localhost,'
        assert task.build_playbook_path_relative_to_cwd(build, private_data_dir) == '.ascender_build_ee.yml'
        assert build.capacity_type == 'control'
        assert build.event_class._meta.db_table == 'main_executionenvironmentbuilderbuildevent'
        assert build.event_parent_key == 'execution_environment_builder_build_id'

    @pytest.mark.parametrize(
        'configured,expected',
        [
            ([], ['--privileged']),
            (['--cap-add=SYS_ADMIN', '--device=/dev/fuse'], ['--cap-add=SYS_ADMIN', '--device=/dev/fuse']),
        ],
    )
    def test_container_options(self, task, build, private_data_dir, settings, configured, expected):
        settings.EXECUTION_ENVIRONMENT_BUILDER_CONTAINER_OPTIONS = configured
        settings.DEFAULT_CONTAINER_RUN_OPTIONS = ['--network', 'slirp4netns:enable_ipv6=true']
        settings.IS_K8S = False
        params = task.build_execution_environment_params(build, private_data_dir)
        assert params['container_options'] == ['--user=root', '--network', 'slirp4netns:enable_ipv6=true'] + expected

    def test_project_copied_with_playbook(self, task, build, builder, private_data_dir):
        def fake_sync_and_copy(project, private_data_dir):
            assert project == builder.project
            os.mkdir(os.path.join(private_data_dir, 'project'))

        with mock.patch.object(task, 'sync_and_copy', side_effect=fake_sync_and_copy):
            task.build_project_dir(build, private_data_dir)
        playbook = os.path.join(private_data_dir, 'project', '.ascender_build_ee.yml')
        with open(playbook) as f:
            assert yaml.safe_load(f)[0]['name'] == 'Build the Execution Environment'

    def test_project_update_records_revision(self, task, build, builder, private_data_dir):
        # the build reuses the job sync path, which records what it built from
        builder.project.scm_revision = 'abc123'
        builder.project.save()
        with mock.patch.object(task, 'get_sync_needs', return_value=[]), mock.patch.object(RunProjectUpdate, 'make_local_copy') as copy:
            task.sync_and_copy_without_lock(builder.project, private_data_dir)
        copy.assert_called_once_with(builder.project, private_data_dir)
        build.refresh_from_db()
        assert build.scm_revision == 'abc123'

    def test_fails_without_project(self, task, build, builder, private_data_dir):
        builder.project.delete()
        build.refresh_from_db()
        with mock.patch('ascender.main.tasks.jobs.create_partition'), pytest.raises(RuntimeError):
            task.pre_run_hook(build, private_data_dir)
        build.refresh_from_db()
        assert build.status == 'failed'
        assert 'valid project' in build.job_explanation


@pytest.fixture
def galaxy_credential(organization):
    galaxy = CredentialType.defaults['galaxy_api_token']()
    galaxy.save()
    cred = Credential.objects.create(
        credential_type=galaxy,
        name='hub',
        organization=organization,
        inputs={'url': 'https://hub.example.com/api/galaxy/', 'token': 'sekrit', 'auth_url': 'https://sso.example.com/token'},
    )
    public = Credential.objects.create(credential_type=galaxy, name='public', inputs={'url': 'https://galaxy.ansible.com/'})
    organization.galaxy_credentials.add(cred)
    organization.galaxy_credentials.add(public)
    return cred


def write_definition(private_data_dir, content):
    path = os.path.join(private_data_dir, 'project', 'ee', 'execution-environment.yml')
    os.makedirs(os.path.dirname(path))
    with open(path, 'w') as f:
        f.write(content)
    return os.path.join(private_data_dir, 'project')


@pytest.mark.django_db
class TestGalaxyServers:
    DEFINITION = """
version: 3
dependencies:
  galaxy: requirements.yml
additional_build_files:
  - src: files
    dest: configs
additional_build_steps:
  prepend_galaxy: COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
"""

    def test_definition_left_alone_without_galaxy_credentials(self, task, builder, private_data_dir):
        project_dir = write_definition(private_data_dir, self.DEFINITION)
        assert task.add_galaxy_servers(builder, project_dir) == 'ee/execution-environment.yml'
        assert os.listdir(os.path.join(project_dir, 'ee')) == ['execution-environment.yml']

    def test_organization_servers_reach_the_galaxy_stage(self, task, builder, private_data_dir, galaxy_credential, settings):
        settings.GALAXY_IGNORE_CERTS = True
        project_dir = write_definition(private_data_dir, self.DEFINITION)
        build_file = task.add_galaxy_servers(builder, project_dir)
        assert build_file == 'ee/.ascender-execution-environment.yml'
        with open(os.path.join(project_dir, build_file)) as f:
            definition = yaml.safe_load(f)
        # the user's own files and steps are kept, and the servers are set last
        assert definition['dependencies'] == {'galaxy': 'requirements.yml'}
        assert definition['additional_build_files'] == [{'src': 'files', 'dest': 'configs'}, {'src': '.ascender_galaxy.cfg', 'dest': 'ascender'}]
        assert definition['additional_build_steps']['prepend_galaxy'] == [
            'COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg',
            'ENV ANSIBLE_CONFIG=/build/ascender/.ascender_galaxy.cfg',
        ]
        config_path = os.path.join(project_dir, 'ee', '.ascender_galaxy.cfg')
        assert oct(os.stat(config_path).st_mode & 0o777) == '0o600'
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_path)
        assert dict(config['galaxy']) == {'server_list': 'server0,server1', 'ignore_certs': 'True'}
        assert dict(config['galaxy_server.server0']) == {
            'url': 'https://hub.example.com/api/galaxy/',
            'token': 'sekrit',
            'auth_url': 'https://sso.example.com/token',
        }
        assert dict(config['galaxy_server.server1']) == {'url': 'https://galaxy.ansible.com/'}
        # the token is in the build file only, not in the extra vars
        task.build_definition_file = build_file
        task.build_extra_vars_file(task.instance, private_data_dir)
        extra_vars = read_extra_vars(private_data_dir)
        assert extra_vars['execution_environment_build_file'] == build_file
        assert 'sekrit' not in str(extra_vars)

    def test_unreadable_definition_is_left_to_the_playbook(self, task, builder, private_data_dir, galaxy_credential):
        project_dir = write_definition(private_data_dir, 'version: [3')
        assert task.add_galaxy_servers(builder, project_dir) == 'ee/execution-environment.yml'


@pytest.mark.django_db
def test_event_from_runner_is_saved(build):
    # Runner leaves parent_uuid on a build's events, unlike a project update's
    event = ExecutionEnvironmentBuilderBuildEvent.create_from_data(
        execution_environment_builder_build_id=build.pk,
        job_created=build.created,
        uuid='abc',
        parent_uuid='def',
        counter=1,
        event='runner_on_ok',
        stdout='ok: [localhost]',
        event_data={'task': 'Push the EE image', 'host': 'localhost'},
    )
    event.save()
    assert list(build.get_event_queryset().values_list('task', 'parent_uuid')) == [('Push the EE image', 'def')]


@pytest.mark.django_db
class TestScheduling:
    def test_builds_of_one_builder_run_one_at_a_time(self, builder, organization):
        other = ExecutionEnvironmentBuilder.objects.create(
            name='other', organization=organization, project=builder.project, execution_environment_file='x', image='registry.example.com/other'
        )
        running, queued, unrelated = builder.create_build(), builder.create_build(), other.create_build()
        graph = DependencyGraph()
        graph.add_job(running)
        assert graph.task_blocked_by(queued) == running
        assert graph.task_blocked_by(unrelated) is None

    def test_cleanup_jobs_removes_old_builds(self, builder):
        old, recent = builder.create_build(status='successful'), builder.create_build(status='successful')
        ExecutionEnvironmentBuilderBuild.objects.filter(pk=old.pk).update(created=now() - timedelta(days=400))
        command = CleanupJobs()
        command.logger = logging.getLogger('ascender.main.commands.cleanup_jobs')
        command.cutoff = now() - timedelta(days=1)
        command.dry_run = False
        command.batch_size = 100000
        command.cleanup_execution_environment_builder_builds()
        assert list(ExecutionEnvironmentBuilderBuild.objects.values_list('pk', flat=True)) == [recent.pk]
