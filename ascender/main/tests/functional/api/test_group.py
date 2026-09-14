import pytest

from ascender.api.versioning import reverse

from ascender.main.models import Group


@pytest.mark.django_db
def test_cyclical_association_prohibited(post, inventory, admin_user):
    parent = Group.objects.create(inventory=inventory, name='parent_group')
    child = parent.children.create(inventory=inventory, name='child_group')
    # Attempt to make parent a child of the child
    url = reverse('api:group_children_list', kwargs={'pk': child.id})
    response = post(url, dict(id=parent.id), admin_user, expect=400)
    assert 'cyclical' in response.data['error'].lower()
