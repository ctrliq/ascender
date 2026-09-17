# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

import re

from django.utils.translation import gettext_lazy as _

__all__ = [
    'CLOUD_PROVIDERS',
    'PRIVILEGE_ESCALATION_METHODS',
    'ANSI_SGR_PATTERN',
    'CAN_CANCEL',
    'ACTIVE_STATES',
    'STANDARD_INVENTORY_UPDATE_ENV',
]

CLOUD_PROVIDERS = ('azure_rm', 'ec2', 'gce', 'vmware', 'openstack', 'satellite6', 'ascender', 'terraform')
PRIVILEGE_ESCALATION_METHODS = [
    ('sudo', _('Sudo')),
    ('su', _('Su')),
    ('pbrun', _('Pbrun')),
    ('pfexec', _('Pfexec')),
    ('dzdo', _('DZDO')),
    ('pmrun', _('Pmrun')),
    ('runas', _('Runas')),
    ('enable', _('Enable')),
    ('doas', _('Doas')),
    ('ksu', _('Ksu')),
    ('machinectl', _('Machinectl')),
    ('sesu', _('Sesu')),
]
CHOICES_PRIVILEGE_ESCALATION_METHODS = [('', _('None'))] + PRIVILEGE_ESCALATION_METHODS
ANSI_SGR_PATTERN = re.compile(r'\x1b\[[0-9;]*m')
STANDARD_INVENTORY_UPDATE_ENV = {
    # Failure to parse inventory should always be fatal
    'ANSIBLE_INVENTORY_UNPARSED_FAILED': 'True',
    # Always use the --export option for ansible-inventory
    'ANSIBLE_INVENTORY_EXPORT': 'True',
    # Redirecting output to stderr allows JSON parsing to still work with -vvv
    'ANSIBLE_VERBOSE_TO_STDERR': 'True',
    # if ansible-inventory --limit is used for an inventory import, unmatched should be a failure
    'ANSIBLE_HOST_PATTERN_MISMATCH': 'error',
}
CAN_CANCEL = ('new', 'pending', 'waiting', 'running')
ACTIVE_STATES = CAN_CANCEL
MINIMAL_EVENTS = set(['playbook_on_play_start', 'playbook_on_task_start', 'playbook_on_stats', 'EOF'])
CENSOR_VALUE = '************'
ENV_BLOCKLIST = frozenset(
    (
        'VIRTUAL_ENV',
        'PATH',
        'PYTHONPATH',
        'JOB_ID',
        'INVENTORY_ID',
        'INVENTORY_SOURCE_ID',
        'INVENTORY_UPDATE_ID',
        'AD_HOC_COMMAND_ID',
        'REST_API_URL',
        'REST_API_TOKEN',
        'MAX_EVENT_RES',
        'CALLBACK_QUEUE',
        'CALLBACK_CONNECTION',
        'CACHE',
        'JOB_CALLBACK_DEBUG',
        'INVENTORY_HOSTVARS',
        'AWX_HOST',
        'PROJECT_REVISION',
        'SUPERVISOR_CONFIG_PATH',
    )
)

# loggers that may be called in process of emitting a log
LOGGER_BLOCKLIST = (
    'ascender.main.utils.handlers',
    'ascender.main.utils.formatters',
    'ascender.main.utils.filters',
    'ascender.main.utils.encryption',
    'ascender.main.utils.log',
    # loggers that may be called getting logging settings
    'ascender.conf',
)

# Reported version for node seen in receptor mesh but for which capacity check
# failed or is in progress
RECEPTOR_PENDING = 'ansible-runner-???'

# The analytics loggers are the platform's data feed rather than its diagnostics:
# Ledger parses job events and the activity stream straight off these names, and
# so does anything a deployment has pointed at its external log aggregator. Four
# places parse the prefix back out of a record name, so it is defined once.
ANALYTICS_LOGGER_PREFIX = 'ascender.analytics'

# The service loggers are the platform's own diagnostics, and their names reach
# further than the code: LOG_AGGREGATOR_LOGGERS is a database setting holding
# the first segment of the names a deployment forwards, so an install made
# before the rename still says awx there. The filter accepts either, which is
# why both are named here rather than only the one the code emits.
SERVICE_LOGGER_PREFIX = 'ascender'
LEGACY_SERVICE_LOGGER_PREFIX = 'awx'

# Naming pattern for Ascender jobs in /tmp folder, like /tmp/ascender_42_xiwm
# also update ascenderkit.api.pages.unified_jobs in ctrliq/ascender-kit if changed,
# which is pinned by test_job_folder_prefix.py rather than left to this comment
JOB_FOLDER_PREFIX = 'ascender_%s_'

#: The postgres LISTEN/NOTIFY channels the dispatcher and the cache clearer use.
#: A listener subscribes to both names and a publisher writes to the current one,
#: because a NOTIFY reaches only whoever is listening at that moment: during a
#: rolling upgrade a node still on the old release publishes to the former name,
#: and a node that had stopped listening for it would simply not hear.
BROADCAST_CHANNEL = 'ascender_broadcast_all'
FORMER_BROADCAST_CHANNEL = 'tower_broadcast_all'
SETTINGS_CHANGE_CHANNEL = 'ascender_settings_change'
FORMER_SETTINGS_CHANGE_CHANNEL = 'tower_settings_change'

#: The namespace a credential type's injectors render against. Both names are
#: bound to the same object: `ascender` is the current one, and `tower` is what
#: an administrator's own credential type written before the rename says, stored
#: in the database where it cannot be rewritten from here. A field may not be
#: called either, or it would shadow the namespace.
RESERVED_NAMESPACE_NAMES = ('ascender', 'tower')

# What the folders were called before the rename. The cleanup sweeps both, since
# a job folder that predates an upgrade is still rubbish that has to be removed,
# and glob has no way to spell the two prefixes in one safe pattern.
FORMER_JOB_FOLDER_PREFIX = 'awx_%s_'

# :z option tells Podman that two containers share the volume content with r/w
# :O option tells Podman to mount the directory from the host as a temporary storage using the overlay file system.
# :ro or :rw option to mount a volume in read-only or read-write mode, respectively. By default, the volumes are mounted read-write.
# see podman-run manpage for further details
# /HOST-DIR:/CONTAINER-DIR:OPTIONS
CONTAINER_VOLUMES_MOUNT_TYPES = ['z', 'O', 'ro', 'rw']
MAX_ISOLATED_PATH_COLON_DELIMITER = 2

SURVEY_TYPE_MAPPING = {'text': str, 'textarea': str, 'password': str, 'multiplechoice': str, 'multiselect': str, 'integer': int, 'float': (float, int)}

# Every job gets one copy of each meta variable per prefix, so a playbook hook
# can read ascender_job_id without knowing what the platform used to be called.
# awx and tower stay because playbooks in the field name them, and this list is
# the only thing that decides: nothing else spells the prefixes out.
JOB_VARIABLE_PREFIXES = [
    'ascender',
    'awx',
    'tower',
]

# Note, the \u001b[... are ansi color codes. We don't currenly import any of the python modules which define the codes.
# Importing a library just for this message seemed like overkill
ANSIBLE_RUNNER_NEEDS_UPDATE_MESSAGE = (
    '\u001b[31m \u001b[1m This can be caused if the version of ansible-runner in your execution environment is out of date.\u001b[0m'
)

# Shared prefetch to use for creating a queryset for the purpose of writing or saving facts
HOST_FACTS_FIELDS = ('name', 'ansible_facts', 'ansible_facts_modified', 'modified', 'inventory_id')
