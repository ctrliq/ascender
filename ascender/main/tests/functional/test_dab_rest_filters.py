import pytest
from django.http import QueryDict

from ascender.api.filters import HostFieldLookupBackend
from ascender.api.versioning import reverse
from ascender.main.models import Group, Host, ProjectUpdate

# Coverage for the vendored ascender.dab.rest_filters JSONField-as-text filtering,
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


@pytest.mark.django_db
def test_role_level_on_model_without_roles_is_a_400(get, admin, notification_template):
    """The ParseError for role_level must reach the client rather than a 500.

    Unpacking a throwaway value into "_" elsewhere in filter_queryset once made
    gettext unreachable there, so raising this error crashed while building it.
    """
    url = reverse('api:notification_template_list')
    response = get(url + '?role_level=notification_admin_role', admin, expect=400)
    assert 'role_level' in str(response.data)


@pytest.mark.django_db
def test_type_in_matches_each_listed_type(get, admin, job_factory, project):
    """type__in names several run types and matches a run of any of them.

    Type names lose their underscores before the lookup, and that step once
    ended the value handling, so the list was never split and matched nothing.
    """
    job = job_factory()
    update = ProjectUpdate.objects.create(project=project, name=project.name)
    url = reverse('api:unified_job_list')

    def ids(query):
        response = get(url + query, admin, expect=200)
        return {row['id'] for row in response.data['results']}

    assert {job.id, update.id} <= ids('?type__in=job,project_update')
    assert update.id in ids('?type__in=project_update')
    assert job.id not in ids('?type__in=project_update')
    assert job.id in ids('?type=job')


@pytest.mark.django_db
@pytest.mark.parametrize(
    'query, matches_job, matches_update',
    [
        ('?or__type=job', True, False),
        ('?not__type=job', False, True),
        ('?type__exact=project_update', False, True),
        ('?type__icontains=project_up', False, True),
        ('?type__startswith=jo', True, False),
    ],
)
def test_type_lookups_keep_the_type_name(get, admin, job_factory, project, query, matches_job, matches_update):
    """Every lookup on type compares type names, never content type ids.

    Splitting type__in once let the other suffixes reach the generic value
    conversion, which read the name as an id and answered 400.
    """
    job = job_factory()
    update = ProjectUpdate.objects.create(project=project, name=project.name)
    response = get(reverse('api:unified_job_list') + query, admin, expect=200)
    found = {row['id'] for row in response.data['results']}
    assert (job.id in found) is matches_job
    assert (update.id in found) is matches_update
