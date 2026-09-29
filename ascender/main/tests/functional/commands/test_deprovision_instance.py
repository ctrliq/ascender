import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import ProtectedError

from ascender.main.models import Instance, InstanceGroup


@pytest.mark.django_db
def test_deprovision_instance():
    Instance.objects.create(hostname='hop', node_type='hop')
    call_command('deprovision_instance', hostname='hop')
    assert not Instance.objects.filter(hostname='hop').exists()


@pytest.mark.django_db
def test_node_in_use_by_a_container_group_is_kept():
    hop = Instance.objects.create(hostname='hop', node_type='hop')
    InstanceGroup.objects.create(name='remote', is_container_group=True, mesh_node=hop)

    with pytest.raises(CommandError, match='hop runs the pods of these container groups, remove it from them first: remote'):
        call_command('deprovision_instance', hostname='hop')
    assert Instance.objects.filter(hostname='hop').exists()

    # nothing else may take the node away from under the group either
    with pytest.raises(ProtectedError):
        hop.delete()
