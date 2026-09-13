import datetime

from awx.settings.typed import settings
from prometheus_client import CollectorRegistry, Gauge, Info, generate_latest

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Max
from django.utils import timezone

from awx.conf.license import get_license
from awx.main.utils import get_awx_version
from awx.main.models import UnifiedJob
from awx.main.analytics.collectors import (
    counts,
    instance_info,
    job_instance_counts,
    job_counts,
)


#: How far back the job timing gauges look. A window rather than everything,
#: because the aggregate is run on every scrape and the jobs table only grows:
#: measured here, bounded is 2.7ms against 38.8ms unbounded on 251 jobs, and
#: the gap is the whole table.
JOB_TIMING_WINDOW_MINUTES = 15


def job_timing(window_minutes=JOB_TIMING_WINDOW_MINUTES):
    """
    How long jobs waited before a worker took them, and how long they then ran.

    Both come from what a job already records: `created` when it was submitted,
    `started` when the dispatcher picked it up, and `elapsed` once it finished.
    Nothing new is measured and nothing is asked of the dispatcher or the
    runner, which is what makes this cheap: the runner's own timing already
    comes back over the mesh, or `elapsed` would never be set.

    The wait is the number this exists for. A job that takes nine minutes and
    should take two is either queued or slow, and those are different problems
    with different fixes, and until now nothing said which.
    """
    since = timezone.now() - datetime.timedelta(minutes=window_minutes)
    waited = ExpressionWrapper(F('started') - F('created'), output_field=DurationField())
    return UnifiedJob.objects.filter(started__isnull=False, created__gte=since).aggregate(
        jobs=Count('id'),
        wait_average=Avg(waited),
        wait_longest=Max(waited),
        run_average=Avg('elapsed'),
        run_longest=Max('elapsed'),
    )


def metrics():
    REGISTRY = CollectorRegistry()

    SYSTEM_INFO = Info('awx_system', 'AWX System Information', registry=REGISTRY)
    ORG_COUNT = Gauge('awx_organizations_total', 'Number of organizations', registry=REGISTRY)
    USER_COUNT = Gauge('awx_users_total', 'Number of users', registry=REGISTRY)
    TEAM_COUNT = Gauge('awx_teams_total', 'Number of teams', registry=REGISTRY)
    INV_COUNT = Gauge('awx_inventories_total', 'Number of inventories', registry=REGISTRY)
    PROJ_COUNT = Gauge('awx_projects_total', 'Number of projects', registry=REGISTRY)
    JT_COUNT = Gauge('awx_job_templates_total', 'Number of job templates', registry=REGISTRY)
    WFJT_COUNT = Gauge('awx_workflow_job_templates_total', 'Number of workflow job templates', registry=REGISTRY)
    HOST_COUNT = Gauge(
        'awx_hosts_total',
        'Number of hosts',
        [
            'type',
        ],
        registry=REGISTRY,
    )
    SCHEDULE_COUNT = Gauge('awx_schedules_total', 'Number of schedules', registry=REGISTRY)
    USER_SESSIONS = Gauge(
        'awx_sessions_total',
        'Number of sessions',
        [
            'type',
        ],
        registry=REGISTRY,
    )
    RUNNING_JOBS = Gauge('awx_running_jobs_total', 'Number of running jobs on the system', registry=REGISTRY)
    PENDING_JOBS = Gauge('awx_pending_jobs_total', 'Number of pending jobs on the system', registry=REGISTRY)
    JOB_WAIT_AVERAGE = Gauge(
        'awx_job_wait_seconds_average', 'Mean seconds a job waited before the dispatcher started it, over the recent window', registry=REGISTRY
    )
    JOB_WAIT_LONGEST = Gauge(
        'awx_job_wait_seconds_longest', 'Longest seconds a job waited before the dispatcher started it, over the recent window', registry=REGISTRY
    )
    JOB_RUN_AVERAGE = Gauge('awx_job_run_seconds_average', 'Mean seconds a job ran once started, over the recent window', registry=REGISTRY)
    JOB_RUN_LONGEST = Gauge('awx_job_run_seconds_longest', 'Longest seconds a job ran once started, over the recent window', registry=REGISTRY)
    JOB_TIMING_SAMPLE = Gauge('awx_job_timing_sample_total', 'Number of jobs the timing gauges above were taken from', registry=REGISTRY)
    STATUS = Gauge(
        'awx_status_total',
        'Status of Job launched',
        [
            'status',
        ],
        registry=REGISTRY,
    )

    INSTANCE_CAPACITY = Gauge(
        'awx_instance_capacity',
        'Capacity of each node in the system',
        [
            'hostname',
            'instance_uuid',
            'node_type',
        ],
        registry=REGISTRY,
    )
    INSTANCE_CPU = Gauge(
        'awx_instance_cpu',
        'CPU cores on each node in the system',
        [
            'hostname',
            'instance_uuid',
        ],
        registry=REGISTRY,
    )
    INSTANCE_MEMORY = Gauge(
        'awx_instance_memory',
        'RAM (Kb) on each node in the system',
        [
            'hostname',
            'instance_uuid',
        ],
        registry=REGISTRY,
    )
    INSTANCE_INFO = Info(
        'awx_instance',
        'Info about each node in the system',
        [
            'hostname',
            'instance_uuid',
            'node_type',
        ],
        registry=REGISTRY,
    )
    INSTANCE_LAUNCH_TYPE = Gauge(
        'awx_instance_launch_type_total',
        'Type of Job launched',
        [
            'node',
            'launch_type',
        ],
        registry=REGISTRY,
    )
    INSTANCE_STATUS = Gauge(
        'awx_instance_status_total',
        'Status of Job launched',
        [
            'node',
            'status',
        ],
        registry=REGISTRY,
    )
    INSTANCE_CONSUMED_CAPACITY = Gauge(
        'awx_instance_consumed_capacity',
        'Consumed capacity of each node in the system',
        [
            'hostname',
            'instance_uuid',
            'node_type',
        ],
        registry=REGISTRY,
    )
    INSTANCE_REMAINING_CAPACITY = Gauge(
        'awx_instance_remaining_capacity',
        'Remaining capacity of each node in the system',
        [
            'hostname',
            'instance_uuid',
            'node_type',
        ],
        registry=REGISTRY,
    )

    LICENSE_INSTANCE_TOTAL = Gauge('awx_license_instance_total', 'Total number of managed hosts provided by your license', registry=REGISTRY)
    LICENSE_INSTANCE_FREE = Gauge('awx_license_instance_free', 'Number of remaining managed hosts provided by your license', registry=REGISTRY)

    DATABASE_CONNECTIONS = Gauge('awx_database_connections_total', 'Number of connections to database', registry=REGISTRY)

    license_info = get_license()
    SYSTEM_INFO.info(
        {
            'install_uuid': settings.INSTALL_UUID,
            'insights_analytics': str(settings.INSIGHTS_TRACKING_STATE),
            'tower_url_base': settings.ASCENDER_URL_BASE,
            'tower_version': get_awx_version(),
            'license_type': license_info.get('license_type', 'UNLICENSED'),
            'license_expiry': str(license_info.get('time_remaining', 0)),
            'pendo_tracking': settings.PENDO_TRACKING_STATE,
            'external_logger_enabled': str(settings.LOG_AGGREGATOR_ENABLED),
            'external_logger_type': getattr(settings, 'LOG_AGGREGATOR_TYPE', 'None'),
        }
    )

    LICENSE_INSTANCE_TOTAL.set(str(license_info.get('instance_count', 0)))
    LICENSE_INSTANCE_FREE.set(str(license_info.get('free_instances', 0)))

    current_counts = counts(None)

    ORG_COUNT.set(current_counts['organization'])
    USER_COUNT.set(current_counts['user'])
    TEAM_COUNT.set(current_counts['team'])
    INV_COUNT.set(current_counts['inventory'])
    PROJ_COUNT.set(current_counts['project'])
    JT_COUNT.set(current_counts['job_template'])
    WFJT_COUNT.set(current_counts['workflow_job_template'])

    HOST_COUNT.labels(type='all').set(current_counts['host'])
    HOST_COUNT.labels(type='active').set(current_counts['active_host_count'])

    SCHEDULE_COUNT.set(current_counts['schedule'])

    USER_SESSIONS.labels(type='all').set(current_counts['active_sessions'])
    USER_SESSIONS.labels(type='user').set(current_counts['active_user_sessions'])
    USER_SESSIONS.labels(type='anonymous').set(current_counts['active_anonymous_sessions'])

    DATABASE_CONNECTIONS.set(current_counts['database_connections'])

    all_job_data = job_counts(None)
    statuses = all_job_data.get('status', {})
    states = set(dict(UnifiedJob.STATUS_CHOICES).keys()) - set(['new'])
    for state in states:
        STATUS.labels(status=state).set(statuses.get(state, 0))

    RUNNING_JOBS.set(current_counts['running_jobs'])
    PENDING_JOBS.set(current_counts['pending_jobs'])

    # Zero where the window holds no jobs, rather than absent: a gauge that
    # disappears reads as a broken exporter, and an idle system is not that.
    timing = job_timing()
    seconds = lambda value: value.total_seconds() if isinstance(value, datetime.timedelta) else float(value or 0)  # noqa: E731
    JOB_TIMING_SAMPLE.set(timing['jobs'])
    JOB_WAIT_AVERAGE.set(seconds(timing['wait_average']))
    JOB_WAIT_LONGEST.set(seconds(timing['wait_longest']))
    JOB_RUN_AVERAGE.set(seconds(timing['run_average']))
    JOB_RUN_LONGEST.set(seconds(timing['run_longest']))

    instance_data = instance_info(None, include_hostnames=True)
    for uuid, info in instance_data.items():
        hostname = info['hostname']
        node_type = info['node_type']
        INSTANCE_CAPACITY.labels(hostname=hostname, instance_uuid=uuid, node_type=node_type).set(instance_data[uuid]['capacity'])
        INSTANCE_CPU.labels(hostname=hostname, instance_uuid=uuid).set(instance_data[uuid]['cpu'])
        INSTANCE_MEMORY.labels(hostname=hostname, instance_uuid=uuid).set(instance_data[uuid]['memory'])
        INSTANCE_CONSUMED_CAPACITY.labels(hostname=hostname, instance_uuid=uuid, node_type=node_type).set(instance_data[uuid]['consumed_capacity'])
        INSTANCE_REMAINING_CAPACITY.labels(hostname=hostname, instance_uuid=uuid, node_type=node_type).set(instance_data[uuid]['remaining_capacity'])
        INSTANCE_INFO.labels(hostname=hostname, instance_uuid=uuid, node_type=node_type).info(
            {
                'enabled': str(instance_data[uuid]['enabled']),
                'managed_by_policy': str(instance_data[uuid]['managed_by_policy']),
                'version': instance_data[uuid]['version'],
            }
        )

    instance_data = job_instance_counts(None)
    for node in instance_data:
        # skipping internal execution node (for system jobs)
        if node == '':
            continue
        types = instance_data[node].get('launch_type', {})
        for launch_type, value in types.items():
            INSTANCE_LAUNCH_TYPE.labels(node=node, launch_type=launch_type).set(value)
        statuses = instance_data[node].get('status', {})
        for status, value in statuses.items():
            INSTANCE_STATUS.labels(node=node, status=status).set(value)

    return generate_latest(registry=REGISTRY)


__all__ = ['metrics']
