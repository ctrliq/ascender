import pytest

from django.urls import reverse

from ascender.api.views.job import UnifiedJobList


def _results(response):
    return response.data['results']


def _ids(response):
    return [row['id'] for row in _results(response)]


def _stacks(response):
    return {row['id']: row.get('stack') for row in _results(response)}


@pytest.mark.django_db
def test_grouped_list_without_id_in_applies_filters_once(get, admin, job_factory, jt_linked, mocker):
    job_factory(jt_linked, initial_state='running')
    spy = mocker.spy(UnifiedJobList, '_apply_list_filters')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    assert _ids(response)
    # The base and collapsed queries are identical without id__in, so the
    # filter backends (including RBAC) must not run a second time.
    assert spy.call_count == 1


@pytest.mark.django_db
def test_group_by_unknown_value_returns_400(get, admin):
    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=bogus', admin, expect=400)
    assert 'group_by' in str(response.data)


@pytest.mark.django_db
def test_group_by_status_collapses_active_rows_by_status(get, admin, job_factory, jt_linked):
    first_running = job_factory(jt_linked, initial_state='running')
    second_running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')
    finished = job_factory(jt_linked, initial_state='successful')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status', admin, expect=200)

    ids = _ids(response)
    # The highest-id running job represents the running status.  The pending
    # job represents pending.  The finished job remains a normal row.
    assert second_running.id in ids
    assert first_running.id not in ids
    assert pending.id in ids
    assert finished.id in ids
    assert _stacks(response)[second_running.id] is None
    groups = {row['id']: row.get('status_group') for row in _results(response)}
    assert groups[second_running.id] == {'status': 'running', 'count': 2}
    assert groups[pending.id] == {'status': 'pending', 'count': 1}
    assert groups[finished.id] is None


@pytest.mark.django_db
@pytest.mark.parametrize('group_by', ['template', 'status'])
def test_grouped_summary_rows_skip_summary_fields(group_by, get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')
    terminal = job_factory(jt_linked, initial_state='successful')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by={}'.format(group_by)
    response = get(url, admin, expect=200)

    rows = _results(response)
    summary_rows = [row for row in rows if row.get('stack') or row.get('status_group')]
    assert summary_rows
    assert all(row['summary_fields'] == {} for row in summary_rows)
    terminal_row = next(row for row in rows if row['id'] == terminal.id)
    assert terminal_row['summary_fields'] != {}


@pytest.mark.django_db
def test_group_by_status_id_in_keeps_the_selected_representative_and_full_count(get, admin, job_factory, jt_linked):
    first_running = job_factory(jt_linked, initial_state='running')
    second_running = job_factory(jt_linked, initial_state='running')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status&id__in={}'.format(second_running.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == [second_running.id]
    assert _results(response)[0]['status_group'] == {'status': 'running', 'count': 2}
    assert first_running.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_status_id_in_does_not_promote_a_non_representative(get, admin, job_factory, jt_linked):
    first_running = job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='running')

    # Consistent with template grouping: the representative is still the
    # highest-id active row, so selecting only a lower-ranked row hides the
    # status group instead of creating a one-row group.
    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status&id__in={}'.format(first_running.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == []


@pytest.mark.django_db
def test_group_by_status_collapses_a_single_active_job(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status', admin, expect=200)

    assert _ids(response) == [running.id]
    row = _results(response)[0]
    assert row['status_group'] == {'status': 'running', 'count': 1}
    assert row.get('stack') is None


@pytest.mark.django_db
def test_group_by_status_includes_all_active_job_types(get, admin, job_factory, jt_linked, project):
    from ascender.main.models import ProjectUpdate

    job = job_factory(jt_linked, initial_state='running')
    update = ProjectUpdate.objects.create(project=project, status='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status', admin, expect=200)

    ids = _ids(response)
    assert len(ids) == 1
    representative = update if update.id > job.id else job
    assert ids == [representative.id]
    row = _results(response)[0]
    assert row['status_group'] == {'status': 'running', 'count': 2}


@pytest.mark.django_db
def test_group_by_status_respects_user_filters(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status&status=pending'
    response = get(url, admin, expect=200)

    assert _ids(response) == [pending.id]
    row = _results(response)[0]
    assert row['status_group'] == {'status': 'pending', 'count': 1}
    assert running.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_is_not_treated_as_a_field_filter(get, admin, job_factory):
    job = job_factory(initial_state='running')
    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)
    # A job with no stack (only one active row for its template) is still a
    # plain row and is not filtered out by the reserved parameter.
    assert job.id in _ids(response)


@pytest.mark.django_db
def test_group_by_template_collapses_to_running_representative(get, admin, job_factory, jt_linked):
    pending = job_factory(jt_linked, initial_state='pending')
    running = job_factory(jt_linked, initial_state='running')
    pending_newer = job_factory(jt_linked, initial_state='pending')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    assert _ids(response) == [running.id]
    stack = _stacks(response)[running.id]
    assert stack is not None
    assert stack['count'] == 3
    assert stack['status_counts'] == {'pending': 2, 'running': 1}
    assert stack['template']['id'] == jt_linked.id
    assert stack['template']['name'] == jt_linked.name
    assert stack['template']['project']['id'] == jt_linked.project.id
    assert stack['template']['organization']['id'] == jt_linked.organization.id
    assert pending.id not in _ids(response)
    assert pending_newer.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_template_id_in_keeps_the_selected_representative_and_full_stack_count(get, admin, job_factory, jt_linked):
    pending = job_factory(jt_linked, initial_state='pending')
    running = job_factory(jt_linked, initial_state='running')
    pending_newer = job_factory(jt_linked, initial_state='pending')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&id__in={}'.format(running.id)
    response = get(url, admin, expect=200)

    # The representative is chosen from the unrestricted member set, so the
    # selected running row still carries the count of all three members.
    assert _ids(response) == [running.id]
    stack = _stacks(response)[running.id]
    assert stack['count'] == 3
    assert stack['status_counts'] == {'pending': 2, 'running': 1}
    assert pending.id not in _ids(response)
    assert pending_newer.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_template_id_in_does_not_promote_a_non_representative(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='pending')
    job_factory(jt_linked, initial_state='running')
    pending_newer = job_factory(jt_linked, initial_state='pending')

    # The id filter must not change which active job represents the template.
    # Selecting only a lower-ranked member therefore returns no stack row.
    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&id__in={}'.format(pending_newer.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == []


@pytest.mark.django_db
def test_group_by_template_falls_back_to_highest_active(get, admin, job_factory, jt_linked):
    older = job_factory(jt_linked, initial_state='pending')
    newer = job_factory(jt_linked, initial_state='new')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    assert _ids(response) == [newer.id]
    stack = _stacks(response)[newer.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'new': 1, 'pending': 1}
    assert older.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_template_single_active_job_is_not_collapsed(get, admin, job_factory, jt_linked):
    job = job_factory(jt_linked, initial_state='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    assert _ids(response) == [job.id]
    assert _stacks(response)[job.id] is None


@pytest.mark.django_db
def test_group_by_template_leaves_terminal_jobs_alone(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')
    finished = job_factory(jt_linked, initial_state='successful')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    ids = _ids(response)
    assert running.id in ids
    assert finished.id in ids
    assert pending.id not in ids
    stack = _stacks(response)[running.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_group_by_template_does_not_collapse_jobs_without_a_template(get, admin, job_factory):
    from ascender.main.models import Job as JobModel

    first = JobModel.objects.create(name='no-template-1', status='running')
    second = JobModel.objects.create(name='no-template-2', status='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    ids = _ids(response)
    assert first.id in ids
    assert second.id in ids
    assert _stacks(response)[first.id] is None
    assert _stacks(response)[second.id] is None


@pytest.mark.django_db
def test_template_filter_still_collapses(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&unified_job_template={}'.format(jt_linked.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == [running.id]
    stack = _stacks(response)[running.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}
    assert pending.id not in _ids(response)


@pytest.mark.django_db
def test_template_in_filter_still_collapses(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&unified_job_template__in={}'.format(jt_linked.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == [running.id]
    stack = _stacks(response)[running.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}
    assert pending.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_template_respects_user_filters(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&status=pending'
    response = get(url, admin, expect=200)

    # Only pending rows are considered, so the running job is not part of the
    # stack and there is only one pending row, which is not collapsed.
    assert _ids(response) == [pending.id]
    assert _stacks(response)[pending.id] is None
    assert running.id not in _ids(response)


@pytest.mark.django_db
def test_group_by_template_respects_template_filter(get, admin, job_factory, jt_linked):
    job = job_factory(jt_linked, initial_state='running')

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&unified_job_template={}'.format(jt_linked.id)
    response = get(url, admin, expect=200)

    assert _ids(response) == [job.id]


@pytest.mark.django_db
def test_group_by_template_collapses_workflow_jobs(get, admin, workflow_job_factory):
    first = workflow_job_factory(initial_state='running')
    workflow_job_factory(initial_state='pending')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    # Both workflow jobs share the workflow template; only the running one is
    # shown and it carries a stack payload.
    assert _ids(response) == [first.id]
    stack = _stacks(response)[first.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_group_by_template_does_not_collapse_non_stackable_types(get, admin, project):
    from ascender.main.models import ProjectUpdate

    first = ProjectUpdate.objects.create(project=project, status='running')
    second = ProjectUpdate.objects.create(project=project, status='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', admin, expect=200)

    ids = _ids(response)
    assert first.id in ids
    assert second.id in ids
    assert _stacks(response)[first.id] is None
    assert _stacks(response)[second.id] is None


@pytest.mark.django_db
def test_group_by_template_orders_representatives_by_requested_field(get, admin, job_factory, jt_linked, project, inventory, organization):
    from ascender.main.models import JobTemplate

    alpha = JobTemplate.objects.create(name='alpha-template', project=project, inventory=inventory, organization=organization)
    beta = JobTemplate.objects.create(name='beta-template', project=project, inventory=inventory, organization=organization)
    alpha_running = job_factory(alpha, initial_state='running')
    job_factory(alpha, initial_state='pending')
    beta_running = job_factory(beta, initial_state='running')
    job_factory(beta, initial_state='pending')

    base = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template'

    # Grouping defaults to -id when the caller does not ask for a sort.
    assert _ids(get(base, admin, expect=200)) == [beta_running.id, alpha_running.id]
    assert _ids(get(base + '&order_by=id', admin, expect=200)) == [alpha_running.id, beta_running.id]
    assert _ids(get(base + '&order_by=-id', admin, expect=200)) == [beta_running.id, alpha_running.id]
    assert _ids(get(base + '&order_by=name', admin, expect=200)) == [alpha_running.id, beta_running.id]
    assert _ids(get(base + '&order_by=-name', admin, expect=200)) == [beta_running.id, alpha_running.id]


@pytest.mark.django_db
def test_group_by_template_paginates_collapsed_rows_and_counts(get, admin, job_factory, jt_linked, project, inventory, organization):
    from ascender.main.models import JobTemplate

    representatives = []
    for index in range(3):
        template = JobTemplate.objects.create(name=f'page-template-{index}', project=project, inventory=inventory, organization=organization)
        representatives.append(job_factory(template, initial_state='running').id)
        job_factory(template, initial_state='pending')

    base = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&page_size=2'

    first = get(base, admin, expect=200)
    assert first.data['count'] == 3
    assert len(first.data['results']) == 2

    second = get(base + '&page=2', admin, expect=200)
    assert second.data['count'] == 3
    assert len(second.data['results']) == 1

    seen = [row['id'] for row in first.data['results']] + [row['id'] for row in second.data['results']]
    assert sorted(seen) == sorted(representatives)


@pytest.mark.django_db
def test_group_by_template_counts_only_jobs_user_can_see(get, user, job_factory, jt_linked, organization):
    from ascender.main.models import Inventory, JobTemplate, Organization, Project

    auditor = user('groupby-auditor', False)
    organization.auditor_role.members.add(auditor)

    first = job_factory(jt_linked, initial_state='running')
    second = job_factory(jt_linked, initial_state='pending')

    other_org = Organization.objects.create(name='groupby-other-org')
    other_project = Project.objects.create(name='groupby-other-project', organization=other_org)
    other_inventory = Inventory.objects.create(name='groupby-other-inventory', organization=other_org)
    other_template = JobTemplate.objects.create(name='groupby-other-template', project=other_project, inventory=other_inventory, organization=other_org)
    hidden = job_factory(other_template, initial_state='running')

    response = get(reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template', auditor, expect=200)

    ids = _ids(response)
    assert first.id in ids
    assert hidden.id not in ids
    # The stack count only includes the members the auditor can see.  The
    # hidden job in the other organization must not inflate the count.
    assert second.id not in ids
    stack = _stacks(response)[first.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_group_by_template_counts_each_job_once_with_multi_value_filter(get, admin, job_factory, jt_linked, organization):
    job = job_factory(jt_linked, initial_state='running')
    first = organization.labels.create(name='groupby-label-a')
    second = organization.labels.create(name='groupby-label-b')
    job.labels.add(first, second)

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&labels__name__in=groupby-label-a,groupby-label-b'
    response = get(url, admin, expect=200)

    # One active job must not become a two-member stack just because the
    # filter joins both of its labels.
    assert _ids(response) == [job.id]
    assert _stacks(response)[job.id] is None


@pytest.mark.django_db
def test_group_by_template_counts_each_member_once_with_multi_value_filter(get, admin, job_factory, jt_linked, organization):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')
    first = organization.labels.create(name='groupby-member-a')
    second = organization.labels.create(name='groupby-member-b')
    running.labels.add(first, second)
    pending.labels.add(first, second)

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=template&labels__name__in=groupby-member-a,groupby-member-b'
    response = get(url, admin, expect=200)

    assert _ids(response) == [running.id]
    stack = _stacks(response)[running.id]
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_group_by_status_counts_each_job_once_with_multi_value_filter(get, admin, job_factory, jt_linked, organization):
    job = job_factory(jt_linked, initial_state='running')
    first = organization.labels.create(name='groupby-status-a')
    second = organization.labels.create(name='groupby-status-b')
    job.labels.add(first, second)

    url = reverse('api:unified_job_list', kwargs={'version': 'v2'}) + '?group_by=status&labels__name__in=groupby-status-a,groupby-status-b'
    response = get(url, admin, expect=200)

    assert _ids(response) == [job.id]
    assert _results(response)[0]['status_group'] == {'status': 'running', 'count': 1}
