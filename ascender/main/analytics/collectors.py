import os
import platform
import distro

from django.db import connection
from django.db.models import Count
from ascender.settings.typed import settings
from django.contrib.sessions.models import Session
from django.utils.timezone import now

from ascender.main.utils import get_ascender_version, camelcase_to_underscore
from ascender.main import models
from ascender.main.scheduler.task_manager_models import TaskManagerModels

"""What the local metrics endpoint reports on.

These fed the Automation Analytics gather as well, which shipped them to Red
Hat. That is gone, so what is left is what /api/v2/metrics/ and the host metric
command read.
"""


def config(since, **kwargs):
    """What the install is, for the host metric report.

    The twenty licence fields this used to carry described a subscription: its
    sku, pool id, entitlement counts and expiry. There is no subscription, so
    there is nothing for them to say.
    """
    install_type = 'traditional'
    if os.environ.get('container') == 'oci':
        install_type = 'openshift'
    elif 'KUBERNETES_SERVICE_PORT' in os.environ:
        install_type = 'k8s'
    return {
        'platform': {
            'system': platform.system(),
            'dist': distro.linux_distribution(),
            'release': platform.release(),
            'type': install_type,
        },
        'install_uuid': settings.INSTALL_UUID,
        'instance_uuid': settings.SYSTEM_UUID,
        'tower_url_base': settings.ASCENDER_URL_BASE,
        'ascender_version': get_ascender_version(),
        'tower_version': get_ascender_version(),
        'authentication_backends': settings.AUTHENTICATION_BACKENDS,
        'logging_aggregators': settings.LOG_AGGREGATOR_LOGGERS,
        'external_logger_enabled': settings.LOG_AGGREGATOR_ENABLED,
        'external_logger_type': getattr(settings, 'LOG_AGGREGATOR_TYPE', None),
    }


def counts(since, **kwargs):
    counts = {}
    for cls in (
        models.Organization,
        models.Team,
        models.User,
        models.Inventory,
        models.Credential,
        models.Project,
        models.JobTemplate,
        models.WorkflowJobTemplate,
        models.Host,
        models.Schedule,
        models.NotificationTemplate,
    ):
        counts[camelcase_to_underscore(cls.__name__)] = cls.objects.count()

    inv_counts = dict(models.Inventory.objects.order_by().values_list('kind').annotate(Count('kind')))
    inv_counts['normal'] = inv_counts.get('', 0)
    inv_counts.pop('', None)
    inv_counts['smart'] = inv_counts.get('smart', 0)
    counts['inventories'] = inv_counts

    counts['unified_job'] = models.UnifiedJob.objects.exclude(launch_type='sync').count()  # excludes implicit project_updates
    counts['active_host_count'] = models.Host.objects.active_count()
    active_sessions = Session.objects.filter(expire_date__gte=now()).count()
    active_user_sessions = models.UserSessionMembership.objects.select_related('session').filter(session__expire_date__gte=now()).count()
    active_anonymous_sessions = active_sessions - active_user_sessions
    counts['active_sessions'] = active_sessions
    counts['active_user_sessions'] = active_user_sessions
    counts['active_anonymous_sessions'] = active_anonymous_sessions
    counts['running_jobs'] = (
        models.UnifiedJob.objects.exclude(launch_type='sync')
        .filter(
            status__in=(
                'running',
                'waiting',
            )
        )
        .count()
    )
    counts['pending_jobs'] = models.UnifiedJob.objects.exclude(launch_type='sync').filter(status__in=('pending',)).count()
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute(f"select count(*) from pg_stat_activity where datname='{connection.settings_dict['NAME']}'")
            counts['database_connections'] = cursor.fetchone()[0]
    else:
        # We should be using postgresql, but if we do that change that ever we should change the below value
        counts['database_connections'] = 1
    return counts


def instance_info(since, include_hostnames=False, **kwargs):
    info = {}
    # Use same method that the TaskManager does to compute consumed capacity without querying all running jobs for each Instance
    tm_models = TaskManagerModels.init_with_consumed_capacity(
        instance_fields=['uuid', 'version', 'capacity', 'cpu', 'memory', 'managed_by_policy', 'enabled', 'node_type']
    )
    for tm_instance in tm_models.instances.instances_by_hostname.values():
        instance = tm_instance.obj
        instance_info = {
            'uuid': instance.uuid,
            'version': instance.version,
            'capacity': instance.capacity,
            'cpu': instance.cpu,
            'memory': instance.memory,
            'managed_by_policy': instance.managed_by_policy,
            'enabled': instance.enabled,
            'consumed_capacity': tm_instance.consumed_capacity,
            'remaining_capacity': instance.capacity - tm_instance.consumed_capacity,
            'node_type': instance.node_type,
        }
        if include_hostnames is True:
            instance_info['hostname'] = instance.hostname
        info[instance.uuid] = instance_info
    return info


def job_counts(since, **kwargs):
    counts = {}
    counts['total_jobs'] = models.UnifiedJob.objects.exclude(launch_type='sync').count()
    counts['status'] = dict(models.UnifiedJob.objects.exclude(launch_type='sync').values_list('status').annotate(Count('status')).order_by())
    counts['launch_type'] = dict(models.UnifiedJob.objects.exclude(launch_type='sync').values_list('launch_type').annotate(Count('launch_type')).order_by())
    return counts


def job_instance_counts(since, **kwargs):
    counts = {}
    job_types = (
        models.UnifiedJob.objects.exclude(launch_type='sync')
        .values_list('execution_node', 'launch_type')
        .annotate(job_launch_type=Count('launch_type'))
        .order_by()
    )
    for job in job_types:
        counts.setdefault(job[0], {}).setdefault('launch_type', {})[job[1]] = job[2]

    job_statuses = models.UnifiedJob.objects.exclude(launch_type='sync').values_list('execution_node', 'status').annotate(job_status=Count('status')).order_by()
    for job in job_statuses:
        counts.setdefault(job[0], {}).setdefault('status', {})[job[1]] = job[2]
    return counts


'''
The event table can be *very* large, and we have a 100MB upload limit.

Split large table dumps at dump time into a series of files.
'''
MAX_TABLE_SIZE = 200 * 1048576
