import pytest

from django.urls import reverse


@pytest.mark.django_db
def test_summary_fields_are_returned_by_default(get, admin_user, job_template):
    """No parameter means what every client has always received."""
    response = get(reverse('api:job_template_list', kwargs={'version': 'v2'}), user=admin_user, expect=200)

    assert response.data['results'][0]['summary_fields'] != {}


@pytest.mark.django_db
@pytest.mark.parametrize("value", ['none', 'None', 'false', '0'])
def test_summary_fields_can_be_asked_for_as_empty(value, get, admin_user, job_template):
    response = get(f"{reverse('api:job_template_list', kwargs={'version': 'v2'})}?summary_fields={value}", user=admin_user, expect=200)

    assert response.data['results'][0]['summary_fields'] == {}


@pytest.mark.django_db
def test_summary_fields_can_be_narrowed_to_a_list(get, admin_user, job_template):
    url = f"{reverse('api:job_template_list', kwargs={'version': 'v2'})}?summary_fields=organization,user_capabilities"
    response = get(url, user=admin_user, expect=200)

    returned = set(response.data['results'][0]['summary_fields'])
    assert returned <= {'organization', 'user_capabilities'}
    assert 'inventory' not in returned


@pytest.mark.django_db
def test_a_detail_view_takes_the_parameter_too(get, admin_user, job_template):
    url = f"{reverse('api:job_template_detail', kwargs={'version': 'v2', 'pk': job_template.pk})}?summary_fields=none"
    response = get(url, user=admin_user, expect=200)

    assert response.data['summary_fields'] == {}


@pytest.mark.django_db
def test_unified_job_list_summary_fields_can_be_narrowed(get, admin_user, job_factory):
    """B4: only requested summary keys are computed and returned for jobs."""
    job = job_factory(initial_state='running')
    url = f"{reverse('api:unified_job_list', kwargs={'version': 'v2'})}?summary_fields=organization,user_capabilities"
    response = get(url, user=admin_user, expect=200)

    row = next(item for item in response.data['results'] if item['id'] == job.id)
    returned = set(row['summary_fields'])
    assert returned <= {'organization', 'user_capabilities'}
    assert 'job_template' not in returned
    assert 'inventory' not in returned


@pytest.mark.django_db
def test_unified_job_list_summary_fields_default_and_none(get, admin_user, job_factory):
    job = job_factory(initial_state='running')
    base = reverse('api:unified_job_list', kwargs={'version': 'v2'})

    default = get(base, user=admin_user, expect=200)
    default_row = next(item for item in default.data['results'] if item['id'] == job.id)
    assert default_row['summary_fields'] != {}

    empty = get(base + '?summary_fields=none', user=admin_user, expect=200)
    empty_row = next(item for item in empty.data['results'] if item['id'] == job.id)
    assert empty_row['summary_fields'] == {}


@pytest.mark.django_db
@pytest.mark.parametrize('field', ['credential', 'credentials'])
def test_inventory_source_summary_fields_can_be_narrowed_to_credentials(field, get, admin_user, inventory_source, credential):
    inventory_source.credentials.add(credential)
    url = f"{reverse('api:inventory_source_detail', kwargs={'version': 'v2', 'pk': inventory_source.pk})}?summary_fields={field}"
    response = get(url, user=admin_user, expect=200)

    summary_fields = response.data['summary_fields']
    assert set(summary_fields) == {field}
    if field == 'credential':
        assert summary_fields['credential']['id'] == credential.id
    else:
        assert [item['id'] for item in summary_fields['credentials']] == [credential.id]
