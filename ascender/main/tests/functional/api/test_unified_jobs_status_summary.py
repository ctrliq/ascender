import pytest

from django.urls import reverse


def _summary_url(extra=''):
    return reverse('api:unified_job_status_summary', kwargs={'version': 'v2'}) + extra


def _counts(get, user, extra='', expect=200):
    return get(_summary_url(extra), user, expect=expect).data['counts']


@pytest.mark.django_db
def test_status_summary_returns_counts_for_active_statuses(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')
    job_factory(jt_linked, initial_state='successful')

    assert _counts(get, admin) == {'pending': 1, 'running': 2}


@pytest.mark.django_db
def test_status_summary_returns_empty_without_active_jobs(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='successful')

    assert _counts(get, admin) == {}


@pytest.mark.django_db
def test_status_summary_respects_user_filters(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    assert _counts(get, admin, '?status=pending') == {'pending': 1}


@pytest.mark.django_db
def test_status_summary_counts_each_job_once_with_multi_value_filter(get, admin, job_factory, jt_linked, organization):
    job = job_factory(jt_linked, initial_state='running')
    first = organization.labels.create(name='summary-label-a')
    second = organization.labels.create(name='summary-label-b')
    job.labels.add(first, second)

    # The filter joins both labels, repeating the job row.  The count is of
    # jobs, not joined rows.
    assert _counts(get, admin, '?labels__name__in=summary-label-a,summary-label-b') == {'running': 1}


@pytest.mark.django_db
def test_status_summary_does_not_count_workflow_approvals(get, admin, job_factory, jt_linked, organization):
    from ascender.main.models import WorkflowApproval, WorkflowApprovalTemplate

    job_factory(jt_linked, initial_state='running')
    approval_template = WorkflowApprovalTemplate.objects.create(name='summary-approval', organization=organization)
    WorkflowApproval.objects.create(
        name='summary-approval',
        workflow_approval_template=approval_template,
        status='pending',
        organization=organization,
    )

    assert _counts(get, admin) == {'running': 1}


@pytest.mark.django_db
def test_status_summary_respects_rbac(get, user, job_factory, jt_linked, organization):
    from ascender.main.models import Inventory, JobTemplate, Organization, Project

    auditor = user('status-summary-auditor', False)
    organization.auditor_role.members.add(auditor)

    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    other_org = Organization.objects.create(name='status-summary-other-org')
    other_project = Project.objects.create(name='status-summary-other-project', organization=other_org)
    other_inventory = Inventory.objects.create(name='status-summary-other-inventory', organization=other_org)
    other_template = JobTemplate.objects.create(
        name='status-summary-other-template',
        project=other_project,
        inventory=other_inventory,
        organization=other_org,
    )
    job_factory(other_template, initial_state='running')

    assert _counts(get, auditor) == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_status_summary_rejects_unknown_field_filters(get, admin):
    response = get(_summary_url('?not_a_field=value'), admin, expect=400)
    assert 'not_a_field' in str(response.data)


@pytest.mark.django_db
def test_status_summary_is_a_single_aggregate(get, admin, job_factory, jt_linked, django_assert_max_num_queries):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    with django_assert_max_num_queries(10):
        _counts(get, admin)


@pytest.mark.django_db
def test_status_summary_ignores_id_in_for_counts(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    # ``id__in`` only limits which representative rows a grouped list returns;
    # it must not narrow the active-status counts that support the summary row.
    assert _counts(get, admin, '?id__in={}'.format(running.id)) == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_status_summary_rejects_unknown_group_by(get, admin):
    response = get(_summary_url('?group_by=bogus'), admin, expect=400)
    assert 'group_by' in str(response.data)
