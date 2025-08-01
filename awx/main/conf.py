# Python
import logging

# Django
from django.core.checks import Error
from django.utils.translation import gettext_lazy as _

# Django REST Framework
from rest_framework import serializers

# AWX
from awx.conf import fields, register, register_validate
from awx.main.models import ExecutionEnvironment
from awx.main.constants import SUBSCRIPTION_USAGE_MODEL_UNIQUE_HOSTS

logger = logging.getLogger('awx.main.conf')

register(
    'ACTIVITY_STREAM_ENABLED',
    field_class=fields.BooleanField,
    label=_('Enable Activity Stream'),
    help_text=_('Enable capturing activity for the activity stream.'),
    category=_('System'),
    category_slug='system',
)

register(
    'ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC',
    field_class=fields.BooleanField,
    label=_('Enable Activity Stream for Inventory Sync'),
    help_text=_('Enable capturing activity for the activity stream when running inventory sync.'),
    category=_('System'),
    category_slug='system',
)

register(
    'ORG_ADMINS_CAN_SEE_ALL_USERS',
    field_class=fields.BooleanField,
    label=_('All Users Visible to Organization Admins'),
    help_text=_('Controls whether any Organization Admin can view all users and teams, even those not associated with their Organization.'),
    category=_('System'),
    category_slug='system',
)

register(
    'MANAGE_ORGANIZATION_AUTH',
    field_class=fields.BooleanField,
    label=_('Organization Admins Can Manage Users and Teams'),
    help_text=_(
        'Controls whether any Organization Admin has the privileges to create and manage users and teams. '
        'You may want to disable this ability if you are using an LDAP or SAML integration.'
    ),
    category=_('System'),
    category_slug='system',
)

register(
    'TOWER_URL_BASE',
    field_class=fields.URLField,
    schemes=('http', 'https'),
    allow_plain_hostname=True,  # Allow hostname only without TLD.
    label=_('Base URL of the service'),
    help_text=_('This setting is used by services like notifications to render a valid url to the service.'),
    category=_('System'),
    category_slug='system',
)

register(
    'REMOTE_HOST_HEADERS',
    field_class=fields.StringListField,
    label=_('Remote Host Headers'),
    help_text=_(
        'HTTP headers and meta keys to search to determine remote host '
        'name or IP. Add additional items to this list, such as '
        '"HTTP_X_FORWARDED_FOR", if behind a reverse proxy. '
        'See the "Proxy Support" section of the AAP Installation guide '
        'for more details.'
    ),
    category=_('System'),
    category_slug='system',
)

register(
    'PROXY_IP_ALLOWED_LIST',
    field_class=fields.StringListField,
    label=_('Proxy IP Allowed List'),
    help_text=_(
        "If the service is behind a reverse proxy/load balancer, use this setting "
        "to configure the proxy IP addresses from which the service should trust "
        "custom REMOTE_HOST_HEADERS header values. "
        "If this setting is an empty list (the default), the headers specified by "
        "REMOTE_HOST_HEADERS will be trusted unconditionally')"
    ),
    category=_('System'),
    category_slug='system',
)

register(
    'CSRF_TRUSTED_ORIGINS',
    default=[],
    field_class=fields.StringListField,
    label=_('CSRF Trusted Origins List'),
    help_text=_(
        "If the service is behind a reverse proxy/load balancer, use this setting "
        "to configure the schema://addresses from which the service should trust "
        "Origin header values. "
    ),
    category=_('System'),
    category_slug='system',
)

register(
    'LICENSE',
    field_class=fields.DictField,
    default=lambda: {},
    label=_('License'),
    help_text=_('The license controls which features and functionality are enabled. Use /api/v2/config/ to update or change the license.'),
    category=_('System'),
    category_slug='system',
)

register(
    'REDHAT_USERNAME',
    field_class=fields.CharField,
    default='',
    allow_blank=True,
    encrypted=False,
    read_only=False,
    label=_('Red Hat customer username'),
    help_text=_('This username is used to send data to Automation Analytics'),
    category=_('System'),
    category_slug='system',
)

register(
    'REDHAT_PASSWORD',
    field_class=fields.CharField,
    default='',
    allow_blank=True,
    encrypted=True,
    read_only=False,
    label=_('Red Hat customer password'),
    help_text=_('This password is used to send data to Automation Analytics'),
    category=_('System'),
    category_slug='system',
)

register(
    'SUBSCRIPTIONS_USERNAME',
    field_class=fields.CharField,
    default='',
    allow_blank=True,
    encrypted=False,
    read_only=False,
    label=_('Red Hat or Satellite username'),
    help_text=_('This username is used to retrieve subscription and content information'),  # noqa
    category=_('System'),
    category_slug='system',
)

register(
    'SUBSCRIPTIONS_PASSWORD',
    field_class=fields.CharField,
    default='',
    allow_blank=True,
    encrypted=True,
    read_only=False,
    label=_('Red Hat or Satellite password'),
    help_text=_('This password is used to retrieve subscription and content information'),  # noqa
    category=_('System'),
    category_slug='system',
)

register(
    'AUTOMATION_ANALYTICS_URL',
    field_class=fields.URLField,
    default='https://example.com',
    schemes=('http', 'https'),
    allow_plain_hostname=True,  # Allow hostname only without TLD.
    label=_('Automation Analytics upload URL'),
    help_text=_('This setting is used to to configure the upload URL for data collection for Automation Analytics.'),
    category=_('System'),
    category_slug='system',
)

register(
    'INSTALL_UUID',
    field_class=fields.CharField,
    label=_('Unique identifier for an installation'),
    category=_('System'),
    category_slug='system',
    read_only=True,
)

register(
    'DEFAULT_CONTROL_PLANE_QUEUE_NAME',
    field_class=fields.CharField,
    label=_('The instance group where control plane tasks run'),
    category=_('System'),
    category_slug='system',
    read_only=True,
)

register(
    'DEFAULT_EXECUTION_QUEUE_NAME',
    field_class=fields.CharField,
    label=_('The instance group where user jobs run (currently only on non-VM installs)'),
    category=_('System'),
    category_slug='system',
    read_only=True,
)

register(
    'DEFAULT_EXECUTION_ENVIRONMENT',
    field_class=fields.PrimaryKeyRelatedField,
    allow_null=True,
    default=None,
    queryset=ExecutionEnvironment.objects.all(),
    label=_('Global default execution environment'),
    help_text=_('The Execution Environment to be used when one has not been configured for a job template.'),
    category=_('System'),
    category_slug='system',
)

register(
    'CUSTOM_VENV_PATHS',
    field_class=fields.StringListPathField,
    label=_('Custom virtual environment paths'),
    help_text=_('Paths where Tower will look for custom virtual environments (in addition to /var/lib/awx/venv/). Enter one path per line.'),
    category=_('System'),
    category_slug='system',
    default=[],
)

register(
    'AD_HOC_COMMANDS',
    field_class=fields.StringListField,
    label=_('Ansible Modules Allowed for Ad Hoc Jobs'),
    help_text=_('List of modules allowed to be used by ad-hoc jobs.'),
    category=_('Jobs'),
    category_slug='jobs',
    required=False,
)

register(
    'ALLOW_JINJA_IN_EXTRA_VARS',
    field_class=fields.ChoiceField,
    choices=[
        ('always', _('Always')),
        ('never', _('Never')),
        ('template', _('Only On Job Template Definitions')),
    ],
    required=True,
    label=_('When can extra variables contain Jinja templates?'),
    help_text=_(
        'Ansible allows variable substitution via the Jinja2 templating '
        'language for --extra-vars. This poses a potential security '
        'risk where users with the ability to specify extra vars at job '
        'launch time can use Jinja2 templates to run arbitrary Python.  It is '
        'recommended that this value be set to "template" or "never".'
    ),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_ISOLATION_BASE_PATH',
    field_class=fields.CharField,
    label=_('Job execution path'),
    help_text=_('The directory in which the service will create new temporary directories for job execution and isolation (such as credential files).'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_ISOLATION_SHOW_PATHS',
    field_class=fields.StringListIsolatedPathField,
    required=False,
    label=_('Paths to expose to isolated jobs'),
    help_text=_(
        'List of paths that would otherwise be hidden to expose to isolated jobs. Enter one path per line. '
        'Volumes will be mounted from the execution node to the container. '
        'The supported format is HOST-DIR[:CONTAINER-DIR[:OPTIONS]]. '
    ),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_TASK_ENV',
    field_class=fields.KeyValueField,
    default={},
    label=_('Extra Environment Variables'),
    help_text=_('Additional environment variables set for playbook runs, inventory updates, project updates, and notification sending.'),
    category=_('Jobs'),
    category_slug='jobs',
    placeholder={'HTTP_PROXY': 'myproxy.local:8080'},
)

register(
    'AWX_RUNNER_KEEPALIVE_SECONDS',
    field_class=fields.IntegerField,
    label=_('K8S Ansible Runner Keep-Alive Message Interval'),
    help_text=_('Only applies to jobs running in a Container Group. If not 0, send a message every so-many seconds to keep connection open.'),
    category=_('Jobs'),
    category_slug='jobs',
    placeholder=240,  # intended to be under common 5 minute idle timeout
)

register(
    'GALAXY_TASK_ENV',
    field_class=fields.KeyValueField,
    label=_('Environment Variables for Galaxy Commands'),
    help_text=_(
        'Additional environment variables set for invocations of ansible-galaxy within project updates. '
        'Useful if you must use a proxy server for ansible-galaxy but not git.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    placeholder={'HTTP_PROXY': 'myproxy.local:8080'},
)

register(
    'INSIGHTS_TRACKING_STATE',
    field_class=fields.BooleanField,
    default=False,
    label=_('Gather data for Automation Analytics'),
    help_text=_('Enables the service to gather data on automation and send it to Automation Analytics.'),
    category=_('System'),
    category_slug='system',
)

register(
    'PROJECT_UPDATE_VVV',
    field_class=fields.BooleanField,
    label=_('Run Project Updates With Higher Verbosity'),
    help_text=_('Adds the CLI -vvv flag to ansible-playbook runs of project_update.yml used for project updates.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_ROLES_ENABLED',
    field_class=fields.BooleanField,
    default=True,
    label=_('Enable Role Download'),
    help_text=_('Allows roles to be dynamically downloaded from a requirements.yml file for SCM projects.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_COLLECTIONS_ENABLED',
    field_class=fields.BooleanField,
    default=True,
    label=_('Enable Collection(s) Download'),
    help_text=_('Allows collections to be dynamically downloaded from a requirements.yml file for SCM projects.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'ENABLE_ANSIBLE_29',
    field_class=fields.BooleanField,
    default=False,
    label=_('Enable Ansible 2.9 Compatibility'),
    help_text=_('If enabled, sets ANSIBLE_COLLECTIONS_PATHS for legacy Ansible 2.9 compatibility.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_SHOW_PLAYBOOK_LINKS',
    field_class=fields.BooleanField,
    default=False,
    label=_('Follow symlinks'),
    help_text=_(
        'Follow symbolic links when scanning for playbooks. Be aware that setting this to True can lead '
        'to infinite recursion if a link points to a parent directory of itself.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_MOUNT_ISOLATED_PATHS_ON_K8S',
    field_class=fields.BooleanField,
    default=False,
    label=_('Expose host paths for Container Groups'),
    help_text=_(
        'Expose paths via hostPath for the Pods created by a Container Group. '
        'HostPath volumes present many security risks, and it is a best practice to avoid the use of HostPaths when possible. '
    ),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'GALAXY_IGNORE_CERTS',
    field_class=fields.BooleanField,
    default=False,
    label=_('Ignore Ansible Galaxy SSL Certificate Verification'),
    help_text=_('If set to true, certificate validation will not be done when installing content from any Galaxy server.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'STDOUT_MAX_BYTES_DISPLAY',
    field_class=fields.IntegerField,
    min_value=0,
    label=_('Standard Output Maximum Display Size'),
    help_text=_('Maximum Size of Standard Output in bytes to display before requiring the output be downloaded.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'EVENT_STDOUT_MAX_BYTES_DISPLAY',
    field_class=fields.IntegerField,
    min_value=0,
    label=_('Job Event Standard Output Maximum Display Size'),
    help_text=_(
        u'Maximum Size of Standard Output in bytes to display for a single job or ad hoc command event. `stdout` will end with `\u2026` when truncated.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'MAX_WEBSOCKET_EVENT_RATE',
    field_class=fields.IntegerField,
    min_value=0,
    default=30,
    label=_('Job Event Maximum Websocket Messages Per Second'),
    help_text=_('Maximum number of messages to update the UI live job output with per second. Value of 0 means no limit.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'SCHEDULE_MAX_JOBS',
    field_class=fields.IntegerField,
    min_value=1,
    label=_('Maximum Scheduled Jobs'),
    help_text=_('Maximum number of the same job template that can be waiting to run when launching from a schedule before no more are created.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'AWX_ANSIBLE_CALLBACK_PLUGINS',
    field_class=fields.StringListField,
    required=False,
    label=_('Ansible Callback Plugins'),
    help_text=_('List of paths to search for extra callback plugins to be used when running jobs. Enter one path per line.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'DEFAULT_JOB_TIMEOUT',
    field_class=fields.IntegerField,
    min_value=0,
    default=0,
    label=_('Default Job Timeout'),
    help_text=_(
        'Maximum time in seconds to allow jobs to run. Use value of 0 to indicate that no '
        'timeout should be imposed. A timeout set on an individual job template will override this.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    unit=_('seconds'),
)

register(
    'DEFAULT_JOB_IDLE_TIMEOUT',
    field_class=fields.IntegerField,
    min_value=0,
    default=0,
    label=_('Default Job Idle Timeout'),
    help_text=_(
        'If no output is detected from ansible in this number of seconds the execution will be terminated. '
        'Use value of 0 to indicate that no idle timeout should be imposed.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    unit=_('seconds'),
)

register(
    'DEFAULT_INVENTORY_UPDATE_TIMEOUT',
    field_class=fields.IntegerField,
    min_value=0,
    default=0,
    label=_('Default Inventory Update Timeout'),
    help_text=_(
        'Maximum time in seconds to allow inventory updates to run. Use value of 0 to indicate that no '
        'timeout should be imposed. A timeout set on an individual inventory source will override this.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    unit=_('seconds'),
)

register(
    'DEFAULT_PROJECT_UPDATE_TIMEOUT',
    field_class=fields.IntegerField,
    min_value=0,
    default=0,
    label=_('Default Project Update Timeout'),
    help_text=_(
        'Maximum time in seconds to allow project updates to run. Use value of 0 to indicate that no '
        'timeout should be imposed. A timeout set on an individual project will override this.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    unit=_('seconds'),
)

register(
    'ANSIBLE_FACT_CACHE_TIMEOUT',
    field_class=fields.IntegerField,
    min_value=0,
    default=0,
    label=_('Per-Host Ansible Fact Cache Timeout'),
    help_text=_(
        'Maximum time, in seconds, that stored Ansible facts are considered valid since '
        'the last time they were modified. Only valid, non-stale, facts will be accessible by '
        'a playbook. Note, this does not influence the deletion of ansible_facts from the database. '
        'Use a value of 0 to indicate that no timeout should be imposed.'
    ),
    category=_('Jobs'),
    category_slug='jobs',
    unit=_('seconds'),
)

register(
    'MAX_FORKS',
    field_class=fields.IntegerField,
    allow_null=False,
    default=200,
    label=_('Maximum number of forks per job'),
    help_text=_('Saving a Job Template with more than this number of forks will result in an error. When set to 0, no limit is applied.'),
    category=_('Jobs'),
    category_slug='jobs',
)

register(
    'LOG_AGGREGATOR_HOST',
    field_class=fields.CharField,
    allow_null=True,
    default=None,
    label=_('Logging Aggregator'),
    help_text=_('Hostname/IP where external logs will be sent to.'),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_PORT',
    field_class=fields.IntegerField,
    allow_null=True,
    default=None,
    label=_('Logging Aggregator Port'),
    help_text=_('Port on Logging Aggregator to send logs to (if required and not provided in Logging Aggregator).'),
    category=_('Logging'),
    category_slug='logging',
    required=False,
)
register(
    'LOG_AGGREGATOR_TYPE',
    field_class=fields.ChoiceField,
    choices=['logstash', 'splunk', 'loggly', 'sumologic', 'ledger', 'other'],
    allow_null=True,
    default=None,
    label=_('Logging Aggregator Type'),
    help_text=_('Format messages for the chosen log aggregator.'),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_USERNAME',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    label=_('Logging Aggregator Username'),
    help_text=_('Username for external log aggregator (if required; HTTP/s only).'),
    category=_('Logging'),
    category_slug='logging',
    required=False,
)
register(
    'LOG_AGGREGATOR_PASSWORD',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    encrypted=True,
    label=_('Logging Aggregator Password/Token'),
    help_text=_('Password or authentication token for external log aggregator (if required; HTTP/s only).'),
    category=_('Logging'),
    category_slug='logging',
    required=False,
)
register(
    'LOG_AGGREGATOR_LOGGERS',
    field_class=fields.StringListField,
    default=['awx', 'activity_stream', 'job_events', 'system_tracking', 'broadcast_websocket', 'job_lifecycle'],
    label=_('Loggers Sending Data to Log Aggregator Form'),
    help_text=_(
        'List of loggers that will send HTTP logs to the collector, these can '
        'include any or all of: \n'
        'awx - service logs\n'
        'activity_stream - activity stream records\n'
        'job_events - callback data from Ansible job events\n'
        'system_tracking - facts gathered from scan jobs\n'
        'broadcast_websocket - errors pertaining to websockets broadcast metrics\n'
        'job_lifecycle - logs related to processing of a job\n'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_INDIVIDUAL_FACTS',
    field_class=fields.BooleanField,
    default=False,
    label=_('Log System Tracking Facts Individually'),
    help_text=_(
        'If set, system tracking facts will be sent for each package, service, or '
        'other item found in a scan, allowing for greater search query granularity. '
        'If unset, facts will be sent as a single dictionary, allowing for greater '
        'efficiency in fact processing.'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_ENABLED',
    field_class=fields.BooleanField,
    default=False,
    label=_('Enable External Logging'),
    help_text=_('Enable sending logs to external log aggregator.'),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_TOWER_UUID',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    label=_('Cluster-wide unique identifier.'),
    help_text=_('Useful to uniquely identify instances.'),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_PROTOCOL',
    field_class=fields.ChoiceField,
    choices=[('https', 'HTTPS/HTTP'), ('tcp', 'TCP'), ('udp', 'UDP')],
    default='https',
    label=_('Logging Aggregator Protocol'),
    help_text=_(
        'Protocol used to communicate with log aggregator.  '
        'HTTPS/HTTP assumes HTTPS unless http:// is explicitly used in '
        'the Logging Aggregator hostname.'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_TCP_TIMEOUT',
    field_class=fields.IntegerField,
    default=5,
    label=_('TCP Connection Timeout'),
    help_text=_('Number of seconds for a TCP connection to external log aggregator to timeout. Applies to HTTPS and TCP log aggregator protocols.'),
    category=_('Logging'),
    category_slug='logging',
    unit=_('seconds'),
)
register(
    'LOG_AGGREGATOR_VERIFY_CERT',
    field_class=fields.BooleanField,
    default=True,
    label=_('Enable/disable HTTPS certificate verification'),
    help_text=_(
        'Flag to control enable/disable of certificate verification'
        ' when LOG_AGGREGATOR_PROTOCOL is "https". If enabled, the'
        ' log handler will verify certificate sent by external log aggregator'
        ' before establishing connection.'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_LEVEL',
    field_class=fields.ChoiceField,
    choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    default='WARNING',
    label=_('Logging Aggregator Level Threshold'),
    help_text=_(
        'Level threshold used by log handler. Severities from lowest to highest'
        ' are DEBUG, INFO, WARNING, ERROR, CRITICAL. Messages less severe '
        'than the threshold will be ignored by log handler. (messages under category '
        'awx.anlytics ignore this setting)'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_ACTION_QUEUE_SIZE',
    field_class=fields.IntegerField,
    default=131072,
    min_value=1,
    label=_('Maximum number of messages that can be stored in the log action queue'),
    help_text=_(
        'Defines how large the rsyslog action queue can grow in number of messages '
        'stored. This can have an impact on memory utilization. When the queue '
        'reaches 75% of this number, the queue will start writing to disk '
        '(queue.highWatermark in rsyslog). When it reaches 90%, NOTICE, INFO, and '
        'DEBUG messages will start to be discarded (queue.discardMark with '
        'queue.discardSeverity=5).'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB',
    field_class=fields.IntegerField,
    default=1,
    min_value=1,
    label=_('Maximum disk persistence for rsyslogd action queuing (in GB)'),
    help_text=_(
        'Amount of data to store (in gigabytes) if an rsyslog action takes time '
        'to process an incoming message (defaults to 1). '
        'Equivalent to the rsyslogd queue.maxdiskspace setting on the action (e.g. omhttp). '
        'It stores files in the directory specified by LOG_AGGREGATOR_MAX_DISK_USAGE_PATH.'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_MAX_DISK_USAGE_PATH',
    field_class=fields.CharField,
    default='/var/lib/awx',
    label=_('File system location for rsyslogd disk persistence'),
    help_text=_(
        'Location to persist logs that should be retried after an outage '
        'of the external log aggregator (defaults to /var/lib/awx). '
        'Equivalent to the rsyslogd queue.spoolDirectory setting.'
    ),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'LOG_AGGREGATOR_RSYSLOGD_DEBUG',
    field_class=fields.BooleanField,
    default=False,
    label=_('Enable rsyslogd debugging'),
    help_text=_('Enabled high verbosity debugging for rsyslogd.  Useful for debugging connection issues for external log aggregation.'),
    category=_('Logging'),
    category_slug='logging',
)
register(
    'API_400_ERROR_LOG_FORMAT',
    field_class=fields.CharField,
    default='status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}',
    label=_('Log Format For API 4XX Errors'),
    help_text=_(
        'The format of logged messages when an API 4XX error occurs, '
        'the following variables will be substituted: \n'
        'status_code - The HTTP status code of the error\n'
        'user_name - The user name attempting to use the API\n'
        'url_path - The URL path to the API endpoint called\n'
        'remote_addr - The remote address seen for the user\n'
        'error - The error set by the api endpoint\n'
        'Variables need to be in the format {<variable name>}.'
    ),
    category=_('Logging'),
    category_slug='logging',
)


register(
    'AUTOMATION_ANALYTICS_LAST_GATHER',
    field_class=fields.DateTimeField,
    label=_('Last gather date for Automation Analytics.'),
    allow_null=True,
    category=_('System'),
    category_slug='system',
)
register(
    'AUTOMATION_ANALYTICS_LAST_ENTRIES',
    field_class=fields.CharField,
    label=_('Last gathered entries from the data collection service of Automation Analytics'),
    default='',
    allow_blank=True,
    category=_('System'),
    category_slug='system',
)


register(
    'AUTOMATION_ANALYTICS_GATHER_INTERVAL',
    field_class=fields.IntegerField,
    label=_('Automation Analytics Gather Interval'),
    help_text=_('Interval (in seconds) between data gathering.'),
    default=14400,  # every 4 hours
    min_value=1800,  # every 30 minutes
    category=_('System'),
    category_slug='system',
    unit=_('seconds'),
)

register(
    'IS_K8S',
    field_class=fields.BooleanField,
    read_only=True,
    category=_('System'),
    category_slug='system',
    help_text=_('Indicates whether the instance is part of a kubernetes-based deployment.'),
)

register(
    'BULK_JOB_MAX_LAUNCH',
    field_class=fields.IntegerField,
    default=100,
    label=_('Max jobs to allow bulk jobs to launch'),
    help_text=_('Max jobs to allow bulk jobs to launch'),
    category=_('Bulk Actions'),
    category_slug='bulk',
)

register(
    'BULK_HOST_MAX_CREATE',
    field_class=fields.IntegerField,
    default=100,
    label=_('Max number of hosts to allow to be created in a single bulk action'),
    help_text=_('Max number of hosts to allow to be created in a single bulk action'),
    category=_('Bulk Actions'),
    category_slug='bulk',
)

register(
    'BULK_HOST_MAX_DELETE',
    field_class=fields.IntegerField,
    default=250,
    label=_('Max number of hosts to allow to be deleted in a single bulk action'),
    help_text=_('Max number of hosts to allow to be deleted in a single bulk action'),
    category=_('Bulk Actions'),
    category_slug='bulk',
)

register(
    'UI_NEXT',
    field_class=fields.BooleanField,
    default=False,
    label=_('Enable Preview of New User Interface'),
    help_text=_('Enable preview of new user interface.'),
    category=_('System'),
    category_slug='system',
)

register(
    'SUBSCRIPTION_USAGE_MODEL',
    field_class=fields.ChoiceField,
    choices=[
        ('', _('Default model for AWX - no subscription. Deletion of host_metrics will not be considered for purposes of managed host counting')),
        (
            SUBSCRIPTION_USAGE_MODEL_UNIQUE_HOSTS,
            _('Usage based on unique managed nodes in a large historical time frame and delete functionality for no longer used managed nodes'),
        ),
    ],
    default='',
    allow_blank=True,
    label=_('Defines subscription usage model and shows Host Metrics'),
    category=_('System'),
    category_slug='system',
)

register(
    'CLEANUP_HOST_METRICS_LAST_TS',
    field_class=fields.DateTimeField,
    label=_('Last cleanup date for HostMetrics'),
    allow_null=True,
    category=_('System'),
    category_slug='system',
)

register(
    'HOST_METRIC_SUMMARY_TASK_LAST_TS',
    field_class=fields.DateTimeField,
    label=_('Last computing date of HostMetricSummaryMonthly'),
    allow_null=True,
    category=_('System'),
    category_slug='system',
)

register(
    'AWX_CLEANUP_PATHS',
    field_class=fields.BooleanField,
    label=_('Enable or Disable tmp dir cleanup'),
    default=True,
    help_text=_('Enable or Disable TMP Dir cleanup'),
    category=('Debug'),
    category_slug='debug',
)

register(
    'AWX_REQUEST_PROFILE',
    field_class=fields.BooleanField,
    label=_('Debug Web Requests'),
    default=False,
    help_text=_('Debug web request python timing'),
    category=('Debug'),
    category_slug='debug',
)

register(
    'DEFAULT_CONTAINER_RUN_OPTIONS',
    field_class=fields.StringListField,
    label=_('Container Run Options'),
    default=['--network', 'slirp4netns:enable_ipv6=true'],
    help_text=_("List of options to pass to podman run example: ['--network', 'slirp4netns:enable_ipv6=true', '--log-level', 'debug']"),
    category=('Jobs'),
    category_slug='jobs',
)

register(
    'RECEPTOR_RELEASE_WORK',
    field_class=fields.BooleanField,
    label=_('Release Receptor Work'),
    default=True,
    help_text=_('Release receptor work'),
    category=('Debug'),
    category_slug='debug',
)


def logging_validate(serializer, attrs):
    if not serializer.instance or not hasattr(serializer.instance, 'LOG_AGGREGATOR_HOST') or not hasattr(serializer.instance, 'LOG_AGGREGATOR_TYPE'):
        return attrs
    errors = []
    if attrs.get('LOG_AGGREGATOR_ENABLED', False):
        if (
            not serializer.instance.LOG_AGGREGATOR_HOST
            and not attrs.get('LOG_AGGREGATOR_HOST', None)
            or serializer.instance.LOG_AGGREGATOR_HOST
            and not attrs.get('LOG_AGGREGATOR_HOST', True)
        ):
            errors.append('Cannot enable log aggregator without providing host.')
        if (
            not serializer.instance.LOG_AGGREGATOR_TYPE
            and not attrs.get('LOG_AGGREGATOR_TYPE', None)
            or serializer.instance.LOG_AGGREGATOR_TYPE
            and not attrs.get('LOG_AGGREGATOR_TYPE', True)
        ):
            errors.append('Cannot enable log aggregator without providing type.')
    if errors:
        raise serializers.ValidationError(_('\n'.join(errors)))
    return attrs


register_validate('logging', logging_validate)


def csrf_trusted_origins_validate(serializer, attrs):
    if not serializer.instance or not hasattr(serializer.instance, 'CSRF_TRUSTED_ORIGINS'):
        return attrs
    if 'CSRF_TRUSTED_ORIGINS' not in attrs:
        return attrs
    errors = []
    for origin in attrs['CSRF_TRUSTED_ORIGINS']:
        if "://" not in origin:
            errors.append(
                Error(
                    "As of Django 4.0, the values in the CSRF_TRUSTED_ORIGINS "
                    "setting must start with a scheme (usually http:// or "
                    "https://) but found %s. See the release notes for details." % origin,
                )
            )
    if errors:
        error_messages = [error.msg for error in errors]
        raise serializers.ValidationError(_('\n'.join(error_messages)))
    return attrs

register_validate('system', csrf_trusted_origins_validate)