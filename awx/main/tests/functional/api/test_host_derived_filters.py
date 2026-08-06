import urllib.parse

import pytest

from awx.api.versioning import reverse

from awx.main.models import Host, Inventory, Job, JobEvent, Organization


def run_job(inventory, name='job', ok=(), failures=()):
    job = Job(inventory=inventory, name=name)
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
def inventory_with_hosts():
    org = Organization.objects.create(name='org')
    inventory = Inventory.objects.create(name='inv', organization=org)
    for name in ('failing', 'recovered', 'passing', 'never_run'):
        Host.objects.create(name=name, inventory=inventory)
    return inventory


def names_from(response):
    return sorted(host['name'] for host in response.data['results'])


def host_list(query=''):
    return reverse('api:host_list') + query


@pytest.mark.django_db
def test_filter_by_latest_summary_failed(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing'], failures=['failing', 'recovered'])
    run_job(inventory_with_hosts, ok=['recovered'], failures=['failing'])

    response = get(host_list('?last_job_host_summary__failed=true'), admin)
    assert names_from(response) == ['failing']

    response = get(host_list('?last_job_host_summary__failed=false'), admin)
    assert names_from(response) == ['passing', 'recovered']


@pytest.mark.django_db
def test_filter_by_last_job(inventory_with_hosts, get, admin):
    first = run_job(inventory_with_hosts, ok=['passing', 'recovered'])
    second = run_job(inventory_with_hosts, ok=['recovered'])

    response = get(host_list('?last_job=%d' % second.id), admin)
    assert names_from(response) == ['recovered']

    response = get(host_list('?last_job=%d' % first.id), admin)
    assert names_from(response) == ['passing']


@pytest.mark.django_db
def test_filter_by_last_job_in(inventory_with_hosts, get, admin):
    first = run_job(inventory_with_hosts, ok=['passing'])
    second = run_job(inventory_with_hosts, ok=['recovered'])

    response = get(host_list('?last_job__in=%d,%d' % (first.id, second.id)), admin)
    assert names_from(response) == ['passing', 'recovered']


@pytest.mark.django_db
def test_filter_by_summary_isnull(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing'], failures=['failing'])

    response = get(host_list('?last_job_host_summary__isnull=true'), admin)
    assert names_from(response) == ['never_run', 'recovered']

    response = get(host_list('?last_job_host_summary__isnull=false'), admin)
    assert names_from(response) == ['failing', 'passing']


@pytest.mark.django_db
def test_negated_filter_keeps_hosts_that_never_ran(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing'], failures=['failing'])

    response = get(host_list('?not__last_job_host_summary__failed=true'), admin)
    assert names_from(response) == ['never_run', 'passing', 'recovered']


@pytest.mark.django_db
def test_search_across_last_job(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, name='nightly build', ok=['passing'])
    run_job(inventory_with_hosts, name='adhoc patch', ok=['recovered'])

    response = get(host_list('?last_job__search=nightly'), admin)
    assert names_from(response) == ['passing']


@pytest.mark.django_db
def test_search_across_summary_matches_nothing(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing'])

    response = get(host_list('?last_job_host_summary__search=passing'), admin)
    assert response.status_code == 200
    assert names_from(response) == []


@pytest.mark.django_db
def test_smart_inventory_host_filter(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing'], failures=['failing'])
    last = run_job(inventory_with_hosts, ok=['recovered'])

    query = urllib.parse.quote('last_job_host_summary__failed=true', safe='')
    response = get(host_list('?host_filter=%s' % query), admin)
    assert names_from(response) == ['failing']

    query = urllib.parse.quote('last_job=%d' % last.id, safe='')
    response = get(host_list('?host_filter=%s' % query), admin)
    assert names_from(response) == ['recovered']


@pytest.mark.django_db
def test_other_models_filter_their_own_column(job_template, get, admin):
    job = Job.objects.create(job_template=job_template, name='template run')
    job_template.last_job = job
    job_template.save()

    response = get(reverse('api:job_template_list') + '?last_job=%d' % job.id, admin)
    assert [item['id'] for item in response.data['results']] == [job_template.id]

    response = get(reverse('api:job_template_list') + '?last_job=%d' % (job.id + 1), admin)
    assert response.data['results'] == []


@pytest.mark.django_db
def test_filter_matches_dashboard_count(inventory_with_hosts, get, admin):
    run_job(inventory_with_hosts, ok=['passing', 'recovered'], failures=['failing'])
    run_job(inventory_with_hosts, failures=['failing'])

    listed = get(host_list('?last_job_host_summary__failed=true'), admin)
    dashboard = get(reverse('api:dashboard_view'), admin)
    assert listed.data['count'] == dashboard.data['hosts']['failed']
