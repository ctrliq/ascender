import pytest

from prometheus_client.parser import text_string_to_metric_families
from ascender.main import models
from ascender.main.analytics.metrics import ASCENDER_METRIC_PREFIX, FORMER_METRIC_PREFIX, metrics
from ascender.api.versioning import reverse
from ascender.main.models.rbac import Role

EXPECTED_VALUES = {
    'ascender_system_info': 1.0,
    'ascender_organizations_total': 1.0,
    'ascender_users_total': 1.0,
    'ascender_teams_total': 1.0,
    'ascender_inventories_total': 1.0,
    'ascender_projects_total': 1.0,
    'ascender_job_templates_total': 1.0,
    'ascender_workflow_job_templates_total': 1.0,
    'ascender_hosts_total': 1.0,
    'ascender_schedules_total': 1.0,
    'ascender_sessions_total': 0.0,
    'ascender_status_total': 0.0,
    'ascender_running_jobs_total': 0.0,
    'ascender_job_wait_seconds_average': 0.0,
    'ascender_job_wait_seconds_longest': 0.0,
    'ascender_job_run_seconds_average': 0.0,
    'ascender_job_run_seconds_longest': 0.0,
    'ascender_job_timing_sample_total': 0.0,
    'ascender_instance_capacity': 100.0,
    'ascender_instance_consumed_capacity': 0.0,
    'ascender_instance_remaining_capacity': 100.0,
    'ascender_instance_cpu': 0.0,
    'ascender_instance_memory': 0.0,
    'ascender_instance_info': 1.0,
    'ascender_pending_jobs_total': 0,
    'ascender_database_connections_total': 1,
}


@pytest.mark.django_db
def test_metrics_counts(organization_factory, job_template_factory, workflow_job_template_factory):
    objs = organization_factory('org', superusers=['admin'])
    jt = job_template_factory('test', organization=objs.organization, inventory='test_inv', project='test_project', credential='test_cred')
    workflow_job_template_factory('test')
    models.Team(organization=objs.organization).save()
    models.Host(inventory=jt.inventory).save()
    models.Schedule(rrule='DTSTART;TZID=America/New_York:20300504T150000', unified_job_template=jt.job_template).save()

    output = metrics()
    gauges = text_string_to_metric_families(output.decode('UTF-8'))

    for gauge in gauges:
        for sample in gauge.samples:
            # Read the fields by name: Sample grew a sixth one, native_histogram, in
            # prometheus-client 0.21, so unpacking it as a 5-tuple ties this test to a
            # version of the library. The metrics code itself already reads by name.
            # Every family is emitted twice, under both names, so read the
            # former one as the name it is a copy of.
            name = sample.name
            if name.startswith(FORMER_METRIC_PREFIX):
                name = ASCENDER_METRIC_PREFIX + name[len(FORMER_METRIC_PREFIX) :]
            if name == 'ascender_database_connections_total':
                # Environmental: depends on what else holds a connection.
                assert sample.value >= 1
                continue
            assert EXPECTED_VALUES[name] == sample.value


@pytest.mark.django_db
def test_every_metric_is_also_served_under_its_former_name(organization_factory):
    """A dashboard written against the awx_ names keeps working after the rename."""
    organization_factory('org', superusers=['admin'])

    families = list(text_string_to_metric_families(metrics().decode('UTF-8')))
    names = {f.name for f in families}

    current = {n for n in names if n.startswith(ASCENDER_METRIC_PREFIX)}
    assert current, 'no metrics were emitted under the Ascender name'

    for name in sorted(current):
        former = FORMER_METRIC_PREFIX + name[len(ASCENDER_METRIC_PREFIX) :]
        assert former in names, f'{name} is not also served as {former}'

    # and the values agree, so the two are the same reading rather than two
    by_name = {f.name: {(s.name, tuple(sorted(s.labels.items()))): s.value for s in f.samples} for f in families}
    for name in sorted(current):
        former = FORMER_METRIC_PREFIX + name[len(ASCENDER_METRIC_PREFIX) :]
        a = {(k[0][len(ASCENDER_METRIC_PREFIX) :], k[1]): v for k, v in by_name[name].items()}
        b = {(k[0][len(FORMER_METRIC_PREFIX) :], k[1]): v for k, v in by_name[former].items()}
        assert a == b, f'{name} and {former} disagree'


def get_metrics_view_db_only():
    return reverse('api:metrics_view') + '?dbonly=1'


@pytest.mark.django_db
def test_metrics_permissions(get, admin, org_admin, alice, bob, organization):
    assert get(get_metrics_view_db_only(), user=admin).status_code == 200
    assert get(get_metrics_view_db_only(), user=org_admin).status_code == 403
    assert get(get_metrics_view_db_only(), user=alice).status_code == 403
    assert get(get_metrics_view_db_only(), user=bob).status_code == 403
    organization.auditor_role.members.add(bob)
    assert get(get_metrics_view_db_only(), user=bob).status_code == 403

    Role.singleton('system_auditor').members.add(bob)
    bob.is_system_auditor = True
    assert get(get_metrics_view_db_only(), user=bob).status_code == 200


@pytest.mark.django_db
def test_metrics_http_methods(get, post, patch, put, options, admin):
    assert get(get_metrics_view_db_only(), user=admin).status_code == 200
    assert put(get_metrics_view_db_only(), user=admin).status_code == 405
    assert patch(get_metrics_view_db_only(), user=admin).status_code == 405
    assert post(get_metrics_view_db_only(), user=admin).status_code == 405
    assert options(get_metrics_view_db_only(), user=admin).status_code == 200
