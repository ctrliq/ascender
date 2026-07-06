import pytest

from awx.api.versioning import reverse
from awx.main.models import JobTemplate, InstanceGroup, WorkflowJob


@pytest.fixture
def routed_inventory(inventory):
    dc1 = inventory.groups.create(name='datacenter1', variables={'dc_instance_group': 'dc1-nodes'})
    dc2 = inventory.groups.create(name='datacenter2', variables={'dc_instance_group': 'dc2-nodes'})
    dc1.hosts.add(inventory.hosts.create(name='dc1-host'))
    dc2.hosts.add(inventory.hosts.create(name='dc2-host'))
    inventory.hosts.create(name='lonely-host')
    return inventory


@pytest.fixture
def routed_igs():
    return {name: InstanceGroup.objects.create(name=name) for name in ('dc1-nodes', 'dc2-nodes')}


@pytest.fixture
def routed_jt(project, routed_inventory):
    return JobTemplate.objects.create(
        name='routed-jt',
        project=project,
        inventory=routed_inventory,
        playbook='helloworld.yml',
        instance_group_routing_var='dc_instance_group',
    )


@pytest.mark.django_db
class TestInstanceGroupRoutingLaunch:
    def test_launch_denied_without_use_role(self, routed_jt, routed_igs, rando, post):
        routed_jt.execute_role.members.add(rando)
        response = post(reverse('api:job_template_launch', kwargs={'pk': routed_jt.pk}), {}, rando, expect=400)
        assert 'use permission' in response.data['errors'][0]
        assert 'dc1-nodes' in response.data['errors'][0]

    def test_launch_allowed_with_use_role(self, routed_jt, routed_igs, rando, post, mocker):
        routed_jt.execute_role.members.add(rando)
        for instance_group in routed_igs.values():
            instance_group.use_role.members.add(rando)
        mocker.patch.object(WorkflowJob, 'signal_start', return_value=True)
        response = post(reverse('api:job_template_launch', kwargs={'pk': routed_jt.pk}), {}, rando, expect=201)
        assert 'workflow_job' in response.data
        workflow_job = WorkflowJob.objects.get(pk=response.data['workflow_job'])
        assert workflow_job.workflow_nodes.count() == 3

    def test_launch_allowed_for_superuser(self, routed_jt, routed_igs, admin_user, post, mocker):
        mocker.patch.object(WorkflowJob, 'signal_start', return_value=True)
        response = post(reverse('api:job_template_launch', kwargs={'pk': routed_jt.pk}), {}, admin_user, expect=201)
        assert 'workflow_job' in response.data

    def test_launch_rejected_when_slicing_prompted(self, routed_jt, routed_igs, admin_user, post):
        routed_jt.ask_job_slice_count_on_launch = True
        routed_jt.save()
        response = post(reverse('api:job_template_launch', kwargs={'pk': routed_jt.pk}), {'job_slice_count': 3}, admin_user, expect=400)
        assert 'job slicing' in str(response.data)

    def test_launch_rejected_on_unknown_instance_group(self, routed_jt, routed_igs, admin_user, post):
        routed_igs['dc2-nodes'].delete()
        response = post(reverse('api:job_template_launch', kwargs={'pk': routed_jt.pk}), {}, admin_user, expect=400)
        assert 'dc2-nodes' in response.data['errors'][0]


@pytest.mark.django_db
class TestInstanceGroupRoutingValidation:
    def test_routing_var_must_be_a_variable_name(self, routed_jt, admin_user, patch):
        url = reverse('api:job_template_detail', kwargs={'pk': routed_jt.pk})
        response = patch(url, {'instance_group_routing_var': 'not a var!'}, admin_user, expect=400)
        assert 'valid variable name' in str(response.data['instance_group_routing_var'])

    def test_routing_cannot_be_combined_with_slicing(self, routed_jt, admin_user, patch):
        url = reverse('api:job_template_detail', kwargs={'pk': routed_jt.pk})
        response = patch(url, {'job_slice_count': 3}, admin_user, expect=400)
        assert 'job slicing' in str(response.data['instance_group_routing_var'])

    def test_routing_var_accepted(self, project, inventory, admin_user, patch):
        jt = JobTemplate.objects.create(name='plain-jt', project=project, inventory=inventory, playbook='helloworld.yml')
        url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
        patch(url, {'instance_group_routing_var': 'dc_instance_group'}, admin_user, expect=200)


@pytest.mark.django_db
class TestInstanceGroupRoutingWorkflowRelaunch:
    def test_relaunch_recomputes_buckets(self, routed_jt, routed_igs, admin_user, post, mocker):
        mocker.patch.object(WorkflowJob, 'signal_start', return_value=True)
        workflow_job = routed_jt.create_unified_job()
        url = reverse('api:workflow_job_relaunch', kwargs={'pk': workflow_job.pk})
        response = post(url, {}, admin_user, expect=201)
        relaunched = WorkflowJob.objects.get(pk=response.data['id'])
        assert relaunched.workflow_nodes.count() == 3

    def test_relaunch_rejected_when_routing_collapses(self, routed_jt, routed_igs, admin_user, post):
        workflow_job = routed_jt.create_unified_job()
        routed_jt.inventory.hosts.exclude(name='dc1-host').delete()
        url = reverse('api:workflow_job_relaunch', kwargs={'pk': workflow_job.pk})
        response = post(url, {}, admin_user, expect=400)
        assert 'no longer routes' in str(response.data)

    def test_relaunch_rejected_without_use_role(self, routed_jt, routed_igs, rando, admin_user, post):
        workflow_job = routed_jt.create_unified_job()
        routed_jt.execute_role.members.add(rando)
        url = reverse('api:workflow_job_relaunch', kwargs={'pk': workflow_job.pk})
        response = post(url, {}, rando, expect=400)
        assert 'use permission' in str(response.data)
