import pytest
from unittest import mock
import os
import tempfile
import shutil
from datetime import timedelta

from django.utils.timezone import now

from ascender.main.tasks.jobs import RunJob, RunInventoryUpdate
from ascender.main.tasks.system import execution_node_health_check, _batched_delete_inventory, _cleanup_images_and_files
from ascender.main.models import Host, Instance, Inventory, InventoryUpdate, Job, Project


@pytest.fixture
def scm_revision_file(tmpdir_factory):
    # Returns path to temporary testing revision file
    revision_file = tmpdir_factory.mktemp('revisions').join('revision.txt')
    with open(str(revision_file), 'w') as f:
        f.write('1234567890123456789012345678901234567890')
    return os.path.join(revision_file.dirname, 'revision.txt')


@pytest.mark.django_db
@pytest.mark.parametrize('node_type', ('control. hybrid'))
def test_no_worker_info_on_AWX_nodes(node_type):
    hostname = 'us-south-3-compute.invalid'
    Instance.objects.create(hostname=hostname, node_type=node_type)
    assert execution_node_health_check(hostname) is None


@pytest.fixture
def mock_job_folder(request):
    pdd_path = tempfile.mkdtemp(prefix='awx_123_')

    def test_folder_cleanup():
        if os.path.exists(pdd_path):
            shutil.rmtree(pdd_path)

    request.addfinalizer(test_folder_cleanup)

    return pdd_path


@pytest.mark.django_db
def test_folder_cleanup_stale_file(mock_job_folder, mock_me):
    _cleanup_images_and_files()
    assert os.path.exists(mock_job_folder)  # grace period should protect folder from deletion

    _cleanup_images_and_files(grace_period=0)
    assert not os.path.exists(mock_job_folder)  # should be deleted


@pytest.mark.django_db
def test_folder_cleanup_running_job(mock_job_folder, mock_me):
    me_inst = Instance.objects.create(hostname='local_node', uuid='00000000-0000-0000-0000-000000000000')
    with mock.patch.object(Instance.objects, 'me', return_value=me_inst):
        job = Job.objects.create(id=123, controller_node=me_inst.hostname, status='running')
        _cleanup_images_and_files(grace_period=0)
        assert os.path.exists(mock_job_folder)  # running job should prevent folder from getting deleted

        job.status = 'failed'
        job.save(update_fields=['status'])
        _cleanup_images_and_files(grace_period=0)
        assert not os.path.exists(mock_job_folder)  # job is finished and no grace period, should delete


@pytest.mark.django_db
def test_does_not_run_reaped_job(mocker, mock_me):
    job = Job.objects.create(status='failed', job_explanation='This job has been reaped.')
    mock_run = mocker.patch('ascender.main.tasks.jobs.ansible_runner.interface.run')
    try:
        RunJob().run(job.id)
    except Exception:
        pass
    job.refresh_from_db()
    assert job.status == 'failed'
    mock_run.assert_not_called()


@pytest.mark.django_db
class TestBatchedDeleteInventory:
    def test_deletes_every_host_and_the_inventory(self, organization):
        inventory = Inventory.objects.create(name='batched', organization=organization)
        for i in range(7):
            Host.objects.create(name='host-{}'.format(i), inventory=inventory)
        inventory_id = inventory.id

        _batched_delete_inventory(inventory, batch_size=2)

        assert not Inventory.objects.filter(id=inventory_id).exists()
        assert not Host.objects.filter(inventory_id=inventory_id).exists()

    def test_leaves_hosts_of_other_inventories_alone(self, organization):
        doomed = Inventory.objects.create(name='doomed', organization=organization)
        kept = Inventory.objects.create(name='kept', organization=organization)
        Host.objects.create(name='doomed-host', inventory=doomed)
        Host.objects.create(name='kept-host', inventory=kept)

        _batched_delete_inventory(doomed, batch_size=1)

        assert Inventory.objects.filter(id=kept.id).exists()
        assert [h.name for h in Host.objects.filter(inventory_id=kept.id)] == ['kept-host']

    def test_empty_inventory_is_deleted(self, organization):
        inventory = Inventory.objects.create(name='empty', organization=organization)
        inventory_id = inventory.id

        _batched_delete_inventory(inventory)

        assert not Inventory.objects.filter(id=inventory_id).exists()


@pytest.mark.django_db
class TestGetDependencyProjectUpdate:
    """Run the real query behind SourceControlMixin.get_dependency_project_update.

    The unit tests in unit/test_tasks.py patch this method, so the dependent_jobs
    subquery and the project and status filters are only exercised here.
    """

    @staticmethod
    def make_update(project, status, finished, dependency_of=None):
        update = project.create_project_update(_eager_fields=dict(launch_type='dependency', status=status, finished=finished))
        if dependency_of is not None:
            dependency_of.dependent_jobs.add(update)
        return update

    @pytest.fixture
    def task(self, scm_inventory_source):
        task = RunInventoryUpdate()
        task.instance = scm_inventory_source.create_inventory_update()
        return task

    def test_only_the_successful_dependency_of_the_source_project_is_reused(self, task, project, organization):
        other_project = Project.objects.create(name='other-proj', organization=organization, scm_type='git', scm_url='localhost')
        finished = now()
        wanted = self.make_update(project, 'successful', finished, dependency_of=task.instance)
        self.make_update(project, 'failed', finished + timedelta(seconds=1), dependency_of=task.instance)
        self.make_update(project, 'canceled', finished + timedelta(seconds=2), dependency_of=task.instance)
        self.make_update(other_project, 'successful', finished + timedelta(seconds=3), dependency_of=task.instance)
        # A successful update of the same project that was not a dependency does not count either
        self.make_update(project, 'successful', finished + timedelta(seconds=4))

        assert task.get_dependency_project_update(project) == wanted

    def test_most_recently_finished_successful_dependency_wins(self, task, project):
        finished = now()
        # The latest to finish is neither the first nor the last by pk, so no pk ordering can pick it
        self.make_update(project, 'successful', finished, dependency_of=task.instance)
        newest = self.make_update(project, 'successful', finished + timedelta(minutes=2), dependency_of=task.instance)
        self.make_update(project, 'successful', finished + timedelta(minutes=1), dependency_of=task.instance)

        assert task.get_dependency_project_update(project) == newest

    @pytest.mark.parametrize('status', ['failed', 'canceled', 'error', 'running'])
    def test_unsuccessful_dependency_means_no_reuse(self, task, project, status):
        self.make_update(project, status, now(), dependency_of=task.instance)

        assert task.get_dependency_project_update(project) is None

    def test_inventory_update_without_dependencies_has_nothing_to_reuse(self, task, project):
        # Updates exist for the project, but none of them is a dependency of this inventory update
        self.make_update(project, 'successful', now())

        assert task.get_dependency_project_update(project) is None


@pytest.mark.django_db
def test_deleting_a_reused_dependency_keeps_the_inventory_updates(scm_inventory_source, project):
    dependency = project.create_project_update(_eager_fields=dict(launch_type='dependency', status='successful', finished=now()))
    reusers = [scm_inventory_source.create_inventory_update(_eager_fields=dict(source_project_update=dependency)) for _ in range(2)]

    dependency.delete()

    survivors = InventoryUpdate.objects.filter(pk__in=[iu.pk for iu in reusers])
    assert [iu.source_project_update_id for iu in survivors] == [None, None]
