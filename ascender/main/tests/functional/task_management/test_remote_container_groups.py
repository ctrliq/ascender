"""Container groups that hand their pods to a hop node of the receptor mesh."""

from collections import namedtuple
from unittest import mock

import pytest

from ascender.main.models import Instance
from ascender.main.scheduler import TaskManager
from ascender.main.tasks.receptor import AWXReceptorJob, ReceptorConnectionType
from ascender.main.tasks.system import awx_k8s_reaper

from . import create_job

RunJob = namedtuple('RunJob', ['instance', 'build_execution_environment_params'])

SIGNING_CONFIG = [{'work-signing': {'privatekey': '/etc/receptor/work_private_key.pem'}}, {'tls-client': {'name': 'tlsclient'}}]


@pytest.fixture
def mesh_node():
    return Instance.objects.create(hostname='receptor.remote.example.com', node_type='hop', node_state='ready')


@pytest.fixture
def remote_job(default_instance_group, mesh_node, job_template_factory, default_job_execution_environment):
    default_instance_group.is_container_group = True
    default_instance_group.mesh_node = mesh_node
    default_instance_group.save()
    objects = job_template_factory('jt', organization='org1', project='proj', inventory='inv', credential='cred', jobs=['my_job'])
    jt = objects.job_template
    jt.instance_groups.add(default_instance_group)

    job = objects.jobs['my_job']
    job.instance_group = default_instance_group
    job.execution_environment = default_job_execution_environment
    job.status = 'pending'
    job.dependencies_processed = True
    job.save()
    return job


def receptor_job_for(job):
    receptor_job = AWXReceptorJob(RunJob(instance=job, build_execution_environment_params=lambda x: {}), runner_params={'settings': {}})
    receptor_job.config_data = SIGNING_CONFIG
    return receptor_job


@pytest.mark.django_db
class TestDispatch:
    def test_work_goes_signed_to_the_mesh_node(self, remote_job, mesh_node):
        receptor_job = receptor_job_for(remote_job)
        assert receptor_job.mesh_node == mesh_node.hostname
        assert receptor_job.work_type == 'kubernetes-incluster-auth'
        assert receptor_job.sign_work is True
        assert 'secret_kube_config' not in receptor_job.receptor_params

    def test_local_container_group_is_unchanged(self, remote_job, kube_credential):
        group = remote_job.instance_group
        group.mesh_node = None
        group.credential = kube_credential
        group.save()

        receptor_job = receptor_job_for(remote_job)
        assert receptor_job.mesh_node is None
        assert receptor_job.work_type == 'kubernetes-runtime-auth'
        assert receptor_job.sign_work is False
        assert receptor_job.pod_definition['metadata']['namespace']

    def test_pod_takes_the_namespace_of_the_mesh_node(self, remote_job):
        assert 'namespace' not in receptor_job_for(remote_job).pod_definition['metadata']

    @pytest.mark.parametrize('override', ['metadata:\n  namespace: {default}\n', 'metadata:\n', 'spec:\n  serviceAccountName: runner\n'])
    def test_override_without_a_namespace_of_its_own_keeps_the_nodes(self, remote_job, settings, override):
        # the UI seeds the pod spec editor with the default spec, namespace included
        group = remote_job.instance_group
        group.pod_spec_override = override.format(default=settings.ASCENDER_CONTAINER_GROUP_DEFAULT_NAMESPACE)
        group.save()
        assert 'namespace' not in receptor_job_for(remote_job).pod_definition['metadata']

    def test_pod_spec_override_can_still_pick_the_namespace(self, remote_job):
        group = remote_job.instance_group
        group.pod_spec_override = 'metadata:\n  namespace: automation\n'
        group.save()
        assert receptor_job_for(remote_job).pod_definition['metadata']['namespace'] == 'automation'

    def test_no_pull_secret_is_created_behind_a_mesh_node(self, remote_job, kube_credential):
        remote_job.execution_environment.credential = kube_credential
        remote_job.execution_environment.save()
        with mock.patch('ascender.main.scheduler.kubernetes.PodManager.create_secret') as create_secret:
            pod = receptor_job_for(remote_job).pod_definition
        create_secret.assert_not_called()
        assert 'imagePullSecrets' not in pod['spec']

    def test_submit_targets_the_mesh_node(self, remote_job, mesh_node):
        receptor_job = receptor_job_for(remote_job)
        receptor_ctl = mock.Mock()
        receptor_ctl.submit_work.side_effect = RuntimeError('stop here')

        with (
            mock.patch('ascender.main.tasks.receptor.get_conn_type', return_value=ReceptorConnectionType.STREAMTLS),
            mock.patch.object(AWXReceptorJob, 'transmit'),
        ):
            with pytest.raises(RuntimeError, match='stop here'):
                receptor_job._run_internal(receptor_ctl)

        kwargs = receptor_ctl.submit_work.call_args.kwargs
        assert kwargs['node'] == mesh_node.hostname
        assert kwargs['worktype'] == 'kubernetes-incluster-auth'
        assert kwargs['signwork'] is True
        assert kwargs['tlsclient'] == 'tlsclient'
        assert 'secret_kube_pod' in kwargs['params']

    def test_mesh_node_without_tls_is_refused_up_front(self, remote_job, mesh_node):
        receptor_ctl = mock.Mock()
        with (
            mock.patch('ascender.main.tasks.receptor.get_conn_type', return_value=ReceptorConnectionType.STREAM),
            mock.patch.object(AWXReceptorJob, 'transmit'),
        ):
            with pytest.raises(RuntimeError, match=f'Mesh node {mesh_node.hostname} must serve its control service over TLS'):
                receptor_job_for(remote_job)._run_internal(receptor_ctl)
        receptor_ctl.submit_work.assert_not_called()


@pytest.mark.django_db
class TestScheduling:
    def test_job_runs_behind_the_mesh_node(self, controlplane_instance_group, remote_job, mesh_node):
        with mock.patch.object(TaskManager, 'start_task') as start_task:
            TaskManager().schedule()
        start_task.assert_called_once()
        task, instance_group, instance = start_task.call_args.args
        assert task.execution_node == mesh_node.hostname
        assert instance_group == remote_job.instance_group
        assert instance is None

    @pytest.mark.parametrize('node_state, enabled', [('unavailable', True), ('installed', True), ('ready', False)])
    def test_job_waits_while_the_mesh_node_is_down(self, controlplane_instance_group, remote_job, mesh_node, node_state, enabled):
        mesh_node.node_state = node_state
        mesh_node.enabled = enabled
        mesh_node.save()
        with mock.patch.object(TaskManager, 'start_task') as start_task:
            TaskManager().schedule()
        # The job may still fall through to the next group on its list, just not to this one
        assert remote_job.instance_group not in [call.args[1] for call in start_task.call_args_list]

    def test_several_jobs_run_behind_the_same_node(self, controlplane_instance_group, remote_job):
        remote_job.unified_job_template.allow_simultaneous = True
        remote_job.unified_job_template.save()
        create_job(remote_job.unified_job_template)
        with mock.patch.object(TaskManager, 'start_task') as start_task:
            TaskManager().schedule()
        assert start_task.call_count == 2

    @pytest.mark.parametrize('first_node_up', [True, False])
    def test_failover_to_the_next_remote_group(self, controlplane_instance_group, remote_job, mesh_node, instance_group_factory, first_node_up):
        """Two remote groups listed in order on the template: the second one takes the jobs while the first one's node is down."""
        mesh_node.node_state = 'ready' if first_node_up else 'unavailable'
        mesh_node.save()
        second_node = Instance.objects.create(hostname='receptor.dc-b.example.com', node_type='hop', node_state='ready')
        second_group = instance_group_factory('dc-b')
        second_group.is_container_group = True
        second_group.mesh_node = second_node
        second_group.save()
        jt = remote_job.unified_job_template
        jt.instance_groups.add(second_group)
        # a fresh job, so its list of preferred groups includes the second one
        remote_job.status = 'successful'
        remote_job.save()
        create_job(jt)

        with mock.patch.object(TaskManager, 'start_task') as start_task:
            TaskManager().schedule()

        start_task.assert_called_once()
        task, instance_group, _ = start_task.call_args.args
        expected_group, expected_node = (jt.instance_groups.first(), mesh_node) if first_node_up else (second_group, second_node)
        assert instance_group == expected_group
        assert task.execution_node == expected_node.hostname


@pytest.mark.django_db
def test_k8s_reaper_leaves_remote_groups_alone(remote_job, kube_credential, instance_group_factory, settings):
    settings.RECEPTOR_RELEASE_WORK = True
    local_group = instance_group_factory('local-cg')
    local_group.is_container_group = True
    local_group.credential = kube_credential
    local_group.save()

    with mock.patch('ascender.main.scheduler.kubernetes.PodManager.list_active_jobs', return_value={}) as list_active_jobs:
        awx_k8s_reaper()

    assert [call.args[0] for call in list_active_jobs.call_args_list] == [local_group]
