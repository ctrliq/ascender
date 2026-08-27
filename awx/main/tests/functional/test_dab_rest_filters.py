import pytest
from django.http import QueryDict

from awx.api.filters import HostFieldLookupBackend
from awx.main.models import Group, Host

# Coverage for the vendored awx.dab.rest_filters JSONField-as-text filtering,
# including lookups that traverse relations (hosts__ansible_facts__...), which
# require the Cast annotation to follow the full related path.


class _View:
    pass


def _filter(model_qs, qstring):
    class _Request:
        query_params = QueryDict(qstring)

        class user:
            is_superuser = True

    return HostFieldLookupBackend().filter_queryset(_Request(), model_qs, _View())


@pytest.fixture
def facts_host(inventory):
    host = inventory.hosts.create(name='facts-host', ansible_facts={'distribution': 'RockyLinux'})
    other = inventory.hosts.create(name='other-host', ansible_facts={'distribution': 'Debian'})
    group = inventory.groups.create(name='facts-group')
    group.hosts.add(host)
    other_group = inventory.groups.create(name='other-group')
    other_group.hosts.add(other)
    return host, group


@pytest.mark.django_db
def test_direct_jsonfield_filter(facts_host):
    host, _ = facts_host
    result = _filter(Host.objects.all(), 'ansible_facts__icontains=rockylinux')
    assert list(result) == [host]
    assert not _filter(Host.objects.all(), 'ansible_facts__icontains=does-not-exist').exists()


@pytest.mark.django_db
def test_related_jsonfield_filter(facts_host):
    """A JSONField lookup across a relation must cast the full related path."""
    _, group = facts_host
    result = _filter(Group.objects.all(), 'hosts__ansible_facts__icontains=rockylinux')
    assert list(result) == [group]
    assert not _filter(Group.objects.all(), 'hosts__ansible_facts__icontains=does-not-exist').exists()
