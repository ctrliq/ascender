import pytest

from awx.api.versioning import reverse

from awx.main.models import Host, Inventory, Job, JobEvent, Organization


def run_job(inventory, ok=(), failures=()):
    job = Job(inventory=inventory)
    job.save()
    host_map = dict(inventory.hosts.values_list('name', 'id'))
    JobEvent.create_from_data(
        job_id=job.pk,
        parent_uuid='abc123',
        event='playbook_on_stats',
        event_data={
            'ok': {name: 1 for name in ok},
            'changed': {},
            'dark': {},
            'failures': {name: 1 for name in failures},
            'ignored': {},
            'processed': {},
            'rescued': {},
            'skipped': {},
        },
        host_map=host_map,
    ).save()
    return job


@pytest.fixture
def hosts():
    org = Organization.objects.create(name='org')
    inventory = Inventory.objects.create(name='inv', organization=org)
    for name in ('failing', 'recovered', 'passing', 'never_run'):
        Host.objects.create(name=name, inventory=inventory)
    return inventory


def names_from(response):
    return sorted(host['name'] for host in response.data['results'])


@pytest.mark.django_db
def test_filter_by_latest_summary_failed(hosts, get, user):
    run_job(hosts, ok=['passing'], failures=['failing', 'recovered'])
    run_job(hosts, ok=['recovered'], failures=['failing'])

    url = reverse('api:host_list')
    response = get(url + '?last_job_host_summary__failed=true', user('admin', True))
    assert names_from(response) == ['failing']

    response = get(url + '?last_job_host_summary__failed=false', user('admin', True))
    assert names_from(response) == ['passing', 'recovered']


@pytest.mark.django_db
def test_filter_by_last_job(hosts, get, user):
    first = run_job(hosts, ok=['passing', 'recovered'])
    second = run_job(hosts, ok=['recovered'])

    url = reverse('api:host_list')
    response = get(url + '?last_job=%d' % second.id, user('admin', True))
    assert names_from(response) == ['recovered']

    response = get(url + '?last_job=%d' % first.id, user('admin', True))
    assert names_from(response) == ['passing']


@pytest.mark.django_db
def test_filter_by_summary_isnull(hosts, get, user):
    run_job(hosts, ok=['passing'], failures=['failing'])

    url = reverse('api:host_list')
    response = get(url + '?last_job_host_summary__isnull=true', user('admin', True))
    assert names_from(response) == ['never_run', 'recovered']

    response = get(url + '?last_job_host_summary__isnull=false', user('admin', True))
    assert names_from(response) == ['failing', 'passing']


@pytest.mark.django_db
def test_filter_matches_dashboard_count(hosts, get, user):
    run_job(hosts, ok=['passing', 'recovered'], failures=['failing'])
    run_job(hosts, failures=['failing'])

    admin = user('admin', True)
    listed = get(reverse('api:host_list') + '?last_job_host_summary__failed=true', admin)
    dashboard = get(reverse('api:dashboard_view'), admin)
    assert len(listed.data['results']) == dashboard.data['hosts']['failed']
