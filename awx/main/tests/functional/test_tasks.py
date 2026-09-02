import pytest
from unittest import mock
import os
import tempfile
import shutil

from awx.main.tasks.jobs import RunJob
from awx.main.tasks.system import execution_node_health_check, _batched_delete_inventory, _cleanup_images_and_files
from awx.main.models import Host, Instance, Inventory, Job


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
    mock_run = mocker.patch('awx.main.tasks.jobs.ansible_runner.interface.run')
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
