import pytest

from django.urls import reverse

from ascender.api import stacks


def _cancel_url():
    return reverse('api:unified_job_stack_cancel', kwargs={'version': 'v2'})


def _cancel(post, admin, template, expect=202, before_id=None):
    body = {'unified_job_template': template.id}
    if before_id is not None:
        body['before_id'] = before_id
    return post(_cancel_url(), body, admin, expect=expect)


@pytest.mark.django_db
def test_stack_cancel_cancels_active_members(post, admin, job_factory, jt_linked):
    first = job_factory(jt_linked, initial_state='running')
    second = job_factory(jt_linked, initial_state='pending')
    terminal = job_factory(jt_linked, initial_state='successful')

    response = _cancel(post, admin, jt_linked)

    assert response.data['canceled'] == 2
    assert response.data['skipped'] == 0
    assert response.data['skipped_ids'] == []
    assert response.data['remaining'] == 0

    first.refresh_from_db()
    second.refresh_from_db()
    terminal.refresh_from_db()
    assert first.status == 'canceled'
    assert second.status == 'canceled'
    # Terminal jobs are not stack members and must not be touched.
    assert terminal.status == 'successful'


@pytest.mark.django_db
def test_stack_cancel_skips_jobs_user_cannot_cancel(post, user, job_factory, jt_linked, organization):
    auditor = user('stack-auditor', False)
    organization.auditor_role.members.add(auditor)

    first = job_factory(jt_linked, initial_state='running')
    second = job_factory(jt_linked, initial_state='pending')

    response = _cancel(post, auditor, jt_linked)

    assert response.data['canceled'] == 0
    assert response.data['skipped'] == 2
    assert set(response.data['skipped_ids']) == {first.id, second.id}
    assert response.data['remaining'] == 0

    first.refresh_from_db()
    second.refresh_from_db()
    assert first.status == 'running'
    assert second.status == 'pending'


@pytest.mark.django_db
def test_stack_cancel_skips_only_the_jobs_user_cannot_cancel(post, user, job_factory, jt_linked, organization):
    auditor = user('stack-mixed-auditor', False)
    organization.auditor_role.members.add(auditor)

    own = job_factory(jt_linked, initial_state='running', created_by=auditor)
    foreign = job_factory(jt_linked, initial_state='running')

    response = _cancel(post, auditor, jt_linked)

    # A partial-permission request cancels what it may and reports the rest.
    assert response.data['canceled'] == 1
    assert response.data['skipped'] == 1
    assert response.data['skipped_ids'] == [foreign.id]
    assert response.data['remaining'] == 0

    own.refresh_from_db()
    foreign.refresh_from_db()
    assert own.status == 'canceled'
    assert foreign.status == 'running'


@pytest.mark.django_db
def test_stack_cancel_schedules_workflow_manager_when_a_workflow_job_is_canceled(post, admin, workflow_job_factory, workflow_job_template, mocker):
    first = workflow_job_factory(workflow_job_template=workflow_job_template, initial_state='running')
    second = workflow_job_factory(workflow_job_template=workflow_job_template, initial_state='pending')
    schedule = mocker.patch('ascender.api.views.job.ScheduleWorkflowManager')

    response = _cancel(post, admin, workflow_job_template)

    assert response.data['canceled'] == 2
    assert response.data['remaining'] == 0
    schedule.return_value.schedule.assert_called_once_with()

    first.refresh_from_db()
    second.refresh_from_db()
    assert first.status == 'canceled'
    assert second.status == 'canceled'


@pytest.mark.django_db
def test_stack_cancel_does_not_schedule_workflow_manager_for_plain_jobs(post, admin, job_factory, jt_linked, mocker):
    job_factory(jt_linked, initial_state='running')
    schedule = mocker.patch('ascender.api.views.job.ScheduleWorkflowManager')

    response = _cancel(post, admin, jt_linked)

    assert response.data['canceled'] == 1
    schedule.return_value.schedule.assert_not_called()


@pytest.mark.django_db
def test_stack_cancel_processes_chunks_and_reports_remaining(post, admin, job_factory, jt_linked, monkeypatch):
    monkeypatch.setattr(stacks, 'STACK_CANCEL_CHUNK', 2)
    jobs = [job_factory(jt_linked, initial_state='running') for _ in range(5)]

    first = _cancel(post, admin, jt_linked)
    assert first.data['canceled'] == 2
    assert first.data['remaining'] == 3
    assert first.data['next_before_id'] == min(job.id for job in jobs[-2:])

    second = _cancel(post, admin, jt_linked, before_id=first.data['next_before_id'])
    assert second.data['canceled'] == 2
    assert second.data['remaining'] == 1
    assert second.data['next_before_id'] == min(job.id for job in jobs[1:3])

    third = _cancel(post, admin, jt_linked, before_id=second.data['next_before_id'])
    assert third.data['canceled'] == 1
    assert third.data['remaining'] == 0
    assert third.data['next_before_id'] is None

    for job in jobs:
        job.refresh_from_db()
        assert job.status == 'canceled'


@pytest.mark.django_db
def test_stack_cancel_cursor_advances_past_a_fully_skipped_chunk(post, user, job_factory, jt_linked, organization, monkeypatch):
    monkeypatch.setattr(stacks, 'STACK_CANCEL_CHUNK', 2)
    auditor = user('stack-cursor-auditor', False)
    organization.auditor_role.members.add(auditor)

    # The highest ids belong to jobs the auditor cannot cancel, so the first
    # chunk is entirely skipped.  The cursor must still let the next request
    # reach the lower-id jobs the auditor may cancel.
    own = [job_factory(jt_linked, initial_state='running', created_by=auditor) for _ in range(2)]
    foreign = [job_factory(jt_linked, initial_state='running') for _ in range(2)]

    first = _cancel(post, auditor, jt_linked)
    assert first.data['canceled'] == 0
    assert first.data['skipped'] == 2
    assert set(first.data['skipped_ids']) == {job.id for job in foreign}
    assert first.data['remaining'] == 2
    assert first.data['next_before_id'] == min(job.id for job in foreign)

    second = _cancel(post, auditor, jt_linked, before_id=first.data['next_before_id'])
    assert second.data['canceled'] == 2
    assert second.data['skipped'] == 0
    assert second.data['remaining'] == 0
    assert second.data['next_before_id'] is None

    for job in own:
        job.refresh_from_db()
        assert job.status == 'canceled'
    for job in foreign:
        job.refresh_from_db()
        assert job.status == 'running'


@pytest.mark.django_db
def test_stack_cancel_rejects_non_integer_before_id(post, admin, job_factory, jt_linked):
    job_factory(jt_linked, initial_state='running')
    response = post(_cancel_url(), {'unified_job_template': jt_linked.id, 'before_id': 'not-a-number'}, admin, expect=400)
    assert 'before_id' in str(response.data)


@pytest.mark.django_db
def test_stack_cancel_requires_template_in_body(post, admin):
    response = post(_cancel_url(), {}, admin, expect=400)
    assert 'unified_job_template' in str(response.data)


@pytest.mark.django_db
def test_stack_cancel_rejects_non_integer_template(post, admin):
    response = post(_cancel_url(), {'unified_job_template': 'not-a-number'}, admin, expect=400)
    assert 'unified_job_template' in str(response.data)


@pytest.mark.django_db
def test_stack_cancel_only_touches_the_requested_template(post, admin, job_factory, jt_linked, workflow_job_factory):
    job = job_factory(jt_linked, initial_state='running')
    workflow_job = workflow_job_factory(initial_state='running')

    response = _cancel(post, admin, jt_linked)

    assert response.data['canceled'] == 1
    assert response.data['remaining'] == 0

    job.refresh_from_db()
    workflow_job.refresh_from_db()
    assert job.status == 'canceled'
    # A stack cancel for one template must not cancel another template's jobs.
    assert workflow_job.status == 'running'


@pytest.mark.django_db
def test_stack_cancel_does_not_load_unused_related_objects(post, user, job_factory, jt_linked, organization, django_assert_max_num_queries):
    auditor = user('stack-query-auditor', False)
    organization.auditor_role.members.add(auditor)
    job_factory(jt_linked, initial_state='running')

    # A skipped member still exercises the access check and the row load.
    with django_assert_max_num_queries(25):
        _cancel(post, auditor, jt_linked)


@pytest.mark.django_db
def test_stack_cancel_does_not_expose_get_as_an_unpaginated_list(get, admin):
    url = _cancel_url()
    get(url, admin, expect=405)
