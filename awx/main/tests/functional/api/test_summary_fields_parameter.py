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
