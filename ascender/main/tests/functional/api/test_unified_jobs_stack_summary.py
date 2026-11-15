import pytest

from django.urls import reverse


def _summary_url(template_ids, extra=''):
    base = reverse('api:unified_job_stack_summary', kwargs={'version': 'v2'})
    query = '?unified_job_template__in={}'.format(','.join(str(value) for value in template_ids))
    return base + query + extra


def _results(response):
    return response.data['results']


@pytest.mark.django_db
def test_stack_summary_requires_template_ids(get, admin):
    response = get(reverse('api:unified_job_stack_summary', kwargs={'version': 'v2'}), admin, expect=400)
    assert 'unified_job_template__in' in str(response.data)


@pytest.mark.django_db
def test_stack_summary_rejects_non_integer_template_ids(get, admin):
    url = reverse('api:unified_job_stack_summary', kwargs={'version': 'v2'}) + '?unified_job_template__in=12,nope'
    response = get(url, admin, expect=400)
    assert 'unified_job_template__in' in str(response.data)


@pytest.mark.django_db
def test_stack_summary_returns_only_requested_templates(get, admin, job_factory, jt_linked, project, inventory, organization):
    from ascender.main.models import JobTemplate

    running = job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')
    other = JobTemplate.objects.create(name='summary-other-template', project=project, inventory=inventory, organization=organization)
    other_running = job_factory(other, initial_state='running')
    job_factory(other, initial_state='pending')

    response = get(_summary_url([jt_linked.id]), admin, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [running.id]
    assert other_running.id not in [row['id'] for row in rows]
    stack = rows[0]['stack']
    assert stack['count'] == 2
    assert stack['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_stack_summary_rows_skip_summary_fields(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    response = get(_summary_url([jt_linked.id]), admin, expect=200)

    rows = _results(response)
    assert rows
    assert all(row['summary_fields'] == {} for row in rows)


@pytest.mark.django_db
def test_stack_summary_returns_single_active_row_without_stack(get, admin, job_factory, jt_linked):
    job = job_factory(jt_linked, initial_state='running')

    response = get(_summary_url([jt_linked.id]), admin, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [job.id]
    assert 'stack' not in rows[0]


@pytest.mark.django_db
def test_stack_summary_returns_empty_when_no_active_members(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='successful')

    response = get(_summary_url([jt_linked.id]), admin, expect=200)

    assert response.data['count'] == 0
    assert _results(response) == []


@pytest.mark.django_db
def test_stack_summary_respects_user_filters(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    response = get(_summary_url([jt_linked.id], '&status=pending'), admin, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [pending.id]
    # Only pending rows are considered, so there is one member and no stack.
    assert 'stack' not in rows[0]


@pytest.mark.django_db
def test_stack_summary_id_in_keeps_the_representative_and_full_count(get, admin, job_factory, jt_linked):
    running = job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')
    job_factory(jt_linked, initial_state='pending')

    response = get(_summary_url([jt_linked.id], '&id__in={}'.format(running.id)), admin, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [running.id]
    assert rows[0]['stack']['count'] == 3
    assert rows[0]['stack']['status_counts'] == {'pending': 2, 'running': 1}


@pytest.mark.django_db
def test_stack_summary_id_in_does_not_promote_a_non_representative(get, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')

    # The running row is the representative even though the pending row has the
    # higher id, so restricting to the pending row hides the stack entirely.
    response = get(_summary_url([jt_linked.id], '&id__in={}'.format(pending.id)), admin, expect=200)

    assert _results(response) == []


@pytest.mark.django_db
def test_stack_summary_respects_rbac(get, user, job_factory, jt_linked, organization):
    from ascender.main.models import Inventory, JobTemplate, Organization, Project

    auditor = user('stack-summary-auditor', False)
    organization.auditor_role.members.add(auditor)

    first = job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    other_org = Organization.objects.create(name='summary-other-org')
    other_project = Project.objects.create(name='summary-other-project', organization=other_org)
    other_inventory = Inventory.objects.create(name='summary-other-inventory', organization=other_org)
    other_template = JobTemplate.objects.create(
        name='summary-hidden-template',
        project=other_project,
        inventory=other_inventory,
        organization=other_org,
    )
    hidden = job_factory(other_template, initial_state='running')

    response = get(_summary_url([jt_linked.id, other_template.id]), auditor, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [first.id]
    assert hidden.id not in [row['id'] for row in rows]
    # The count only includes members the auditor can see.
    assert rows[0]['stack']['count'] == 2


@pytest.mark.django_db
def test_stack_summary_counts_each_member_once_with_multi_value_filter(get, admin, job_factory, jt_linked, organization):
    running = job_factory(jt_linked, initial_state='running')
    pending = job_factory(jt_linked, initial_state='pending')
    first = organization.labels.create(name='summary-member-a')
    second = organization.labels.create(name='summary-member-b')
    running.labels.add(first, second)
    pending.labels.add(first, second)

    response = get(_summary_url([jt_linked.id], '&labels__name__in=summary-member-a,summary-member-b'), admin, expect=200)

    rows = _results(response)
    assert [row['id'] for row in rows] == [running.id]
    assert rows[0]['stack']['count'] == 2
    assert rows[0]['stack']['status_counts'] == {'pending': 1, 'running': 1}


@pytest.mark.django_db
def test_stack_summary_does_not_load_unused_related_objects(get, admin, job_factory, jt_linked, django_assert_max_num_queries):
    job_factory(jt_linked, initial_state='running')
    job_factory(jt_linked, initial_state='pending')

    # The summary row is deliberately narrow; a regression that goes back
    # through the full list serializer or its access prefetches will exceed
    # this guard.
    with django_assert_max_num_queries(20):
        get(_summary_url([jt_linked.id]), admin, expect=200)


@pytest.mark.django_db
def test_stack_summary_rejects_unknown_group_by(get, admin, jt_linked):
    response = get(_summary_url([jt_linked.id], '&group_by=bogus'), admin, expect=400)
    assert 'group_by' in str(response.data)
