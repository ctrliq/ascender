import pytest

from awx.main.models import Inventory
from awx.api.versioning import reverse


@pytest.mark.django_db
@pytest.mark.parametrize(
    "is_admin, status",
    [
        [True, 201],
        [False, 403],
    ],  # if they're a WFJ admin, they get a 201  # if they're not a WFJ *nor* org admin, they get a 403
)
def test_workflow_job_relaunch(workflow_job, post, admin_user, alice, is_admin, status):
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    if is_admin:
        post(url, user=admin_user, expect=status)
    else:
        post(url, user=alice, expect=status)


@pytest.mark.django_db
def test_workflow_job_relaunch_failure(workflow_job, post, admin_user):
    workflow_job.is_sliced_job = True
    workflow_job.job_template = None
    workflow_job.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    post(url, user=admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_not_inventory_failure(workflow_job, post, admin_user):
    workflow_job.is_sliced_job = True
    workflow_job.inventory = None
    workflow_job.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    post(url, user=admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_federated_inventory(organization, job_template, post, admin_user):
    """Relaunching a sliced workflow spawned from a federated inventory must not
    be blocked by the stale-slice-count check (federated inventories have no
    direct hosts, so hosts.count() is always 0)."""
    fed_inv = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
    inv_a = Inventory.objects.create(name='inv-a', organization=organization)
    inv_b = Inventory.objects.create(name='inv-b', organization=organization)
    inv_a.hosts.create(name='host-a')
    inv_b.hosts.create(name='host-b')
    fed_inv.input_inventories.add(inv_a)
    fed_inv.input_inventories.add(inv_b)

    job_template.inventory = fed_inv
    job_template.organization = organization
    job_template.save()

    wfj = job_template.create_unified_job()
    wfj.status = 'successful'
    wfj.save()
    assert wfj.is_sliced_job
    assert wfj.workflow_nodes.count() == 2

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, user=admin_user, expect=201)


@pytest.mark.django_db
def test_workflow_job_relaunch_with_pinned_hosts(slice_jt_factory, post, admin_user):
    """A sliced job with pinned hosts spawns fewer nodes than
    min(hosts, slice_count); the relaunch check must apply the same
    arithmetic instead of flagging a slice count change."""
    slice_jt = slice_jt_factory(3, jt_kwargs={'job_slice_pinned_hosts': 'foo0'})
    wfj = slice_jt.create_unified_job()
    wfj.status = 'successful'
    wfj.save()
    assert wfj.is_sliced_job
    assert wfj.workflow_nodes.count() == 2

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, user=admin_user, expect=201)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "is_admin, status",
    [
        [True, 202],
        [False, 403],
    ],  # if they're a WFJ admin, they get a 202  # if they're not a WFJ *nor* org admin, they get a 403
)
def test_workflow_job_cancel(workflow_job, post, admin_user, alice, is_admin, status):
    url = reverse("api:workflow_job_cancel", kwargs={'pk': workflow_job.pk})
    if is_admin:
        post(url, user=admin_user, expect=status)
    else:
        post(url, user=alice, expect=status)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed(wfjt, job_template, post, admin_user):
    from awx.main.models import WorkflowJobNode

    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='failed')
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed'}, admin_user, expect=201)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed_requires_a_failed_node(wfjt, job_template, post, admin_user):
    from awx.main.models import WorkflowJobNode

    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='successful')
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'successful'
    node.job.save()
    node.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed'}, admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed_deleted_template_message(wfjt, post, admin_user):
    from awx.main.models import WorkflowJobNode

    # the workflow is failed but has no failed JOB node — its only reached node
    # lost its template (deleted), so relaunch-from-failed can't recover it and
    # should say so rather than "no failed nodes"
    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='failed')
    WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=None, identifier='n1')
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed'}, admin_user, expect=400)
    assert 'no job template' in str(resp.data)
