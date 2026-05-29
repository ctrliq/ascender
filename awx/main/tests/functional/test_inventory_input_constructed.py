import pytest
from awx.main.models import Inventory
from awx.api.versioning import reverse


@pytest.mark.django_db
def test_constructed_inventory_post(post, admin_user, organization):
    inv1 = Inventory.objects.create(name='dummy1', kind='constructed', organization=organization)
    inv2 = Inventory.objects.create(name='dummy2', kind='constructed', organization=organization)
    resp = post(
        url=reverse('api:inventory_input_inventories', kwargs={'pk': inv1.pk}),
        data={'id': inv2.pk},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_add_constructed_inventory_source(post, admin_user, constructed_inventory):
    resp = post(
        url=reverse('api:inventory_inventory_sources_list', kwargs={'pk': constructed_inventory.pk}),
        data={'name': 'dummy1', 'source': 'constructed'},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_add_constructed_inventory_host(post, admin_user, constructed_inventory):
    resp = post(
        url=reverse('api:inventory_hosts_list', kwargs={'pk': constructed_inventory.pk}),
        data={'name': 'dummy1'},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_add_constructed_inventory_group(post, admin_user, constructed_inventory):
    resp = post(
        reverse('api:inventory_groups_list', kwargs={'pk': constructed_inventory.pk}),
        data={'name': 'group-test'},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_edit_constructed_inventory_source(patch, admin_user, inventory_source_factory):
    inv_src = inventory_source_factory(name='dummy1', source='constructed')
    resp = patch(
        reverse('api:inventory_source_detail', kwargs={'pk': inv_src.pk}),
        data={'description': inv_src.name},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Federated inventory input_inventories validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize('sub_kind', ['smart', 'constructed', 'federated'])
def test_federated_inventory_rejects_non_plain_source(post, admin_user, organization, sub_kind):
    """Attaching a smart/constructed/federated inventory as a source of a federated inventory is rejected."""
    fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
    sub = Inventory.objects.create(name='sub-inv', kind=sub_kind, organization=organization)
    resp = post(
        url=reverse('api:inventory_input_inventories', kwargs={'pk': fed.pk}),
        data={'id': sub.pk},
        user=admin_user,
        expect=400,
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_federated_inventory_accepts_plain_source(post, admin_user, organization):
    """Attaching a plain inventory as a source of a federated inventory is allowed."""
    fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
    plain = Inventory.objects.create(name='plain-inv', kind='', organization=organization)
    resp = post(
        url=reverse('api:inventory_input_inventories', kwargs={'pk': fed.pk}),
        data={'id': plain.pk},
        user=admin_user,
        expect=204,
    )
    assert resp.status_code == 204

