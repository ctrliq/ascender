import pytest


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
