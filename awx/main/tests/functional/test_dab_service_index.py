import uuid

import pytest

from awx.dab.resource_registry.models import Resource, ResourceType, service_id
from awx.main.models import Organization

# Coverage for the vendored awx.dab.resource_registry service-index API
# (formerly covered by django-ansible-base's own test suite).


@pytest.mark.django_db
def test_service_metadata(get, admin):
    response = get('/api/v2/service-index/metadata/', admin, expect=200)
    assert response.data['service_type'] == 'awx'
    assert str(response.data['service_id']) == str(service_id())


@pytest.mark.django_db
def test_service_index_requires_privileges(get, alice):
    get('/api/v2/service-index/metadata/', alice, expect=403)
    get('/api/v2/service-index/resources/', alice, expect=403)


@pytest.mark.django_db
def test_resource_types_registered(get, admin):
    response = get('/api/v2/service-index/resource-types/', admin, expect=200)
    names = {item['name'] for item in response.data['results']}
    assert {'shared.organization', 'shared.team', 'shared.user'} <= names


@pytest.mark.django_db
def test_resources_list_contains_created_objects(get, admin, organization, team):
    response = get('/api/v2/service-index/resources/?page_size=200', admin, expect=200)
    by_name = {(item['resource_type'], item['name']) for item in response.data['results']}
    assert ('shared.organization', organization.name) in by_name
    assert ('shared.team', team.name) in by_name


@pytest.mark.django_db
def test_resource_detail_by_ansible_id(get, admin, organization):
    resource = Resource.get_resource_for_object(organization)
    response = get(f'/api/v2/service-index/resources/{resource.ansible_id}/', admin, expect=200)
    assert response.data['name'] == organization.name
    assert response.data['resource_type'] == 'shared.organization'


@pytest.mark.django_db
def test_resource_create_organization(post, admin):
    """A resource server (gateway) pushes shared resources through this endpoint."""
    ansible_id = str(uuid.uuid4())
    post(
        '/api/v2/service-index/resources/',
        {'resource_type': 'shared.organization', 'ansible_id': ansible_id, 'resource_data': {'name': 'gateway-pushed-org'}},
        admin,
        expect=201,
    )
    org = Organization.objects.get(name='gateway-pushed-org')
    assert str(Resource.get_resource_for_object(org).ansible_id) == ansible_id


@pytest.mark.django_db
def test_resource_model_lifecycle(organization):
    """Resource rows are created and removed with their content object."""
    resource = Resource.get_resource_for_object(organization)
    assert resource.content_type.resource_type.name == 'shared.organization'
    org_pk = organization.pk
    organization.delete()
    assert not Resource.objects.filter(content_type=resource.content_type, object_id=org_pk).exists()


@pytest.mark.django_db
def test_resource_type_manifest(admin, organization):
    """The manifest streams ansible_id,hash CSV rows for a resource type."""
    # The `get` fixture can't be used here: it records response.content, which
    # streaming responses don't have. Drive the resolved view directly.
    from django.urls import resolve
    from rest_framework.test import APIRequestFactory, force_authenticate

    url = '/api/v2/service-index/resource-types/shared.organization/manifest/'
    request = APIRequestFactory().get(url)
    force_authenticate(request, user=admin)
    view, view_args, view_kwargs = resolve(url)
    response = view(request, *view_args, **view_kwargs)
    assert response.status_code == 200
    assert response.headers['Content-Type'] == 'text/csv'
    body = b''.join(part if isinstance(part, bytes) else part.encode() for part in response.streaming_content).decode()
    resource = Resource.get_resource_for_object(organization)
    matching = [line for line in body.splitlines() if line.startswith(str(resource.ansible_id))]
    assert len(matching) == 1
    ansible_id, resource_hash = matching[0].split(',')
    assert len(resource_hash) == 64  # sha256 hex digest


@pytest.mark.django_db
def test_shared_resource_types_are_externally_managed(admin):
    for name in ('shared.organization', 'shared.team', 'shared.user'):
        assert ResourceType.objects.get(name=name).externally_managed is True
