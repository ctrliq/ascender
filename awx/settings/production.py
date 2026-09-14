# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Production settings for Ascender project.

# Python
import os
import copy
import errno
import sys
import traceback

# Django Split Settings
from split_settings.tools import optional, include

# Load default settings.
from .defaults import *  # NOQA
from awx.settings.environment import environment_setting

DEBUG = False
TEMPLATE_DEBUG = DEBUG
SQL_DEBUG = DEBUG

# Clear database settings to force production environment to define them.
DATABASES = {}

# Clear the secret key to force production environment to define it.
SECRET_KEY = None

# Hosts/domain names that are valid for this site; required if DEBUG is False
# See https://docs.djangoproject.com/en/dev/ref/settings/#allowed-hosts
ALLOWED_HOSTS = []

# Very important that this is editable (not read_only) in the API
ASCENDER_ISOLATION_SHOW_PATHS = [
    '/etc/pki/ca-trust:/etc/pki/ca-trust:O',
    '/usr/share/pki:/usr/share/pki:O',
]

# Store a snapshot of default settings at this point before loading any
# customizable config files.
this_module = sys.modules[__name__]
local_vars = dir(this_module)
DEFAULTS_SNAPSHOT = {}  # define after we save local_vars so we do not snapshot the snapshot
for setting in local_vars:
    if setting.isupper():
        DEFAULTS_SNAPSHOT[setting] = copy.deepcopy(getattr(this_module, setting))

del local_vars  # avoid temporary variables from showing up in dir(settings)
del this_module
#
###############################################################################################
#
#  Any settings defined after this point will be marked as as a read_only database setting
#
################################################################################################

# Load settings from any .py files in the global conf.d directory specified in
# the environment, defaulting to /etc/tower/conf.d/.
settings_dir = environment_setting('SETTINGS_DIR', '/etc/tower/conf.d/')
settings_files = os.path.join(settings_dir, '*.py')

# Load remaining settings from the global settings file specified in the
# environment, defaulting to /etc/tower/settings.py.
settings_file = environment_setting('SETTINGS_FILE', '/etc/tower/settings.py')

# Attempt to load settings from /etc/tower/settings.py first, followed by
# /etc/tower/conf.d/*.py.
try:
    include(settings_file, optional(settings_files), scope=locals())
except ImportError:
    traceback.print_exc()
    sys.exit(1)
except IOError:
    from django.core.exceptions import ImproperlyConfigured

    included_file = locals().get('__included_file__', '')
    if not included_file or included_file == settings_file:
        # The import doesn't always give permission denied, so try to open the
        # settings file directly.
        try:
            e = None
            open(settings_file)
        except IOError:
            pass
        if e and e.errno == errno.EACCES:
            SECRET_KEY = 'permission-denied'
            LOGGING = {}
        else:
            msg = 'No AWX configuration found at %s.' % settings_file
            msg += '\nDefine the ASCENDER_SETTINGS_FILE environment variable to '
            msg += 'specify an alternate path.'
            raise ImproperlyConfigured(msg)
    else:
        raise

# The below runs AFTER all of the custom settings are imported
# because conf.d files will define DATABASES and this should modify that
from .application_name import set_application_name

set_application_name(DATABASES, CLUSTER_HOST_ID)  # NOQA

del set_application_name

from .statement_timeout import set_statement_timeout

set_statement_timeout(DATABASES, DATABASE_STATEMENT_TIMEOUT)  # NOQA

del set_statement_timeout

from .connection_reuse import set_conn_max_age

set_conn_max_age(DATABASES, DATABASE_CONN_MAX_AGE)  # NOQA

del set_conn_max_age

# Deployments that set a former name in /etc/tower/conf.d keep working for a
# release. The stored values are carried over by conf migrations 0011 and 0012,
# so this covers the hand written case only.
#
# The test is against DEFAULTS_SNAPSHOT rather than for the current name being
# absent. Every one of these has a default, so the current name is always
# present by the time this runs, and asking whether it exists answers nothing.
# What matters is whether anything has changed it.
_FORMER_NAMES = {
    'TOWER_URL_BASE': 'ASCENDER_URL_BASE',
    'AWX_ANSIBLE_CALLBACK_PLUGINS': 'ASCENDER_ANSIBLE_CALLBACK_PLUGINS',
    'AWX_CLEANUP_PATHS': 'ASCENDER_CLEANUP_PATHS',
    'AWX_COLLECTIONS_ENABLED': 'ASCENDER_COLLECTIONS_ENABLED',
    'AWX_ISOLATION_BASE_PATH': 'ASCENDER_ISOLATION_BASE_PATH',
    'AWX_ISOLATION_SHOW_PATHS': 'ASCENDER_ISOLATION_SHOW_PATHS',
    'AWX_MOUNT_ISOLATED_PATHS_ON_K8S': 'ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S',
    'AWX_REQUEST_PROFILE': 'ASCENDER_REQUEST_PROFILE',
    'AWX_ROLES_ENABLED': 'ASCENDER_ROLES_ENABLED',
    'AWX_RUNNER_KEEPALIVE_SECONDS': 'ASCENDER_RUNNER_KEEPALIVE_SECONDS',
    'AWX_SHOW_PLAYBOOK_LINKS': 'ASCENDER_SHOW_PLAYBOOK_LINKS',
    'AWX_TASK_ENV': 'ASCENDER_TASK_ENV',
    'AWX_AUTO_DEPROVISION_INSTANCES': 'ASCENDER_AUTO_DEPROVISION_INSTANCES',
    'AWX_CALLBACK_PROFILE': 'ASCENDER_CALLBACK_PROFILE',
    'AWX_CONTAINER_GROUP_DEFAULT_JOB_LABEL': 'ASCENDER_CONTAINER_GROUP_DEFAULT_JOB_LABEL',
    'AWX_CONTAINER_GROUP_DEFAULT_NAMESPACE': 'ASCENDER_CONTAINER_GROUP_DEFAULT_NAMESPACE',
    'AWX_CONTAINER_GROUP_K8S_API_TIMEOUT': 'ASCENDER_CONTAINER_GROUP_K8S_API_TIMEOUT',
    'AWX_CONTAINER_GROUP_K8S_API_USE_PROXY': 'ASCENDER_CONTAINER_GROUP_K8S_API_USE_PROXY',
    'AWX_CONTAINER_GROUP_POD_PENDING_TIMEOUT': 'ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT',
    'AWX_CONTROL_NODE_TASK_IMPACT': 'ASCENDER_CONTROL_NODE_TASK_IMPACT',
    'AWX_NOTIFICATION_REQUEST_TIMEOUT': 'ASCENDER_NOTIFICATION_REQUEST_TIMEOUT',
    'AWX_REBUILD_SMART_MEMBERSHIP': 'ASCENDER_REBUILD_SMART_MEMBERSHIP',
    'AWX_REQUEST_PROFILE_WITH_DOT': 'ASCENDER_REQUEST_PROFILE_WITH_DOT',
    'AWX_RUNNER_OMIT_ENV_FILES': 'ASCENDER_RUNNER_OMIT_ENV_FILES',
    'AWX_RUNNER_SUPPRESS_OUTPUT_FILE': 'ASCENDER_RUNNER_SUPPRESS_OUTPUT_FILE',
}
for _former, _current in _FORMER_NAMES.items():
    _scope = locals()
    if _former not in _scope:
        continue
    if _current in _scope and _scope[_current] != DEFAULTS_SNAPSHOT.get(_current):
        # Both names were written down. The current one wins.
        continue
    _scope[_current] = _scope[_former]
del _FORMER_NAMES, _former, _current, _scope
