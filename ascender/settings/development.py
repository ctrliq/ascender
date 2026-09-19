# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Development settings for Ascender project.

# Python
import os
import socket
import copy
import sys
import traceback

# Centos-7 doesn't include the svg mime type
# /usr/lib64/python/mimetypes.py
import mimetypes

# Django Split Settings
from split_settings.tools import optional, include

# Load default settings.
from .defaults import *  # NOQA

# show colored logs in the dev environment
# to disable this, set `COLOR_LOGS = False` in ascender/settings/local_settings.py
COLOR_LOGS = True
LOGGING['handlers']['console']['()'] = 'ascender.main.utils.handlers.ColorHandler'  # noqa

ALLOWED_HOSTS = ['*']

mimetypes.add_type("image/svg+xml", ".svg", True)
mimetypes.add_type("image/svg+xml", ".svgz", True)

# Disallow sending session cookies over insecure connections
SESSION_COOKIE_SECURE = False

# Disallow sending csrf cookies over insecure connections
CSRF_COOKIE_SECURE = False

# debug toolbar and swagger assume that requirements/requirements_dev.txt are installed

INSTALLED_APPS += ['drf_spectacular', 'debug_toolbar']  # NOQA

MIDDLEWARE = ['debug_toolbar.middleware.DebugToolbarMiddleware'] + MIDDLEWARE  # NOQA

DEBUG_TOOLBAR_CONFIG = {'ENABLE_STACKTRACES': True}

# Configure a default UUID for development only.
SYSTEM_UUID = '00000000-0000-0000-0000-000000000000'
INSTALL_UUID = '00000000-0000-0000-0000-000000000000'

CLUSTER_HOST_ID = socket.gethostname()

ASCENDER_CALLBACK_PROFILE = True

# ======================!!!!!!! FOR DEVELOPMENT ONLY !!!!!!!=================================
# Disable normal scheduled/triggered task managers (DependencyManager, TaskManager, WorkflowManager).
# Allows user to trigger task managers directly for debugging and profiling purposes.
# Only works in combination with settings.SETTINGS_MODULE == 'ascender.settings.development'
ASCENDER_DISABLE_TASK_MANAGERS = False

# Needed for launching runserver in debug mode
# ======================!!!!!!! FOR DEVELOPMENT ONLY !!!!!!!=================================

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

# If there is an `/etc/ascender/settings.py`, include it.
# If there is a `/etc/ascender/conf.d/*.py`, include them.
include(optional('/etc/ascender/settings.py'), scope=locals())
include(optional('/etc/ascender/conf.d/*.py'), scope=locals())

# If any local_*.py files are present in ascender/settings/, use them to override
# default settings for development.  If not present, we can still run using
# only the defaults.
# this needs to stay at the bottom of this file
try:
    # Either name, non-empty, which is what the launch scripts test with
    # [ -n "${ASCENDER_KUBE_DEVEL}${AWX_KUBE_DEVEL}" ]. A getenv fallback would
    # disagree with them: the new name set but empty is a hit for getenv, so the
    # old name would be skipped and this path would choose local_*.py while the
    # scripts had already entered kube devel mode.
    if os.getenv('ASCENDER_KUBE_DEVEL') or os.getenv('AWX_KUBE_DEVEL'):
        include(optional('development_kube.py'), scope=locals())
    else:
        include(optional('local_*.py'), scope=locals())
except ImportError:
    traceback.print_exc()
    sys.exit(1)

# AWX_DISABLE_TASK_MANAGERS was the name until the rebrand, and it is the kind of
# setting that lives in someone's own local_settings.py rather than in this
# repository, so the rename cannot reach it. Read after the override chain above,
# so a file setting either name still beats the default here.
#
# Dropping the old name would not have failed: the toggle would have been ignored
# and the task managers would have kept running, which for a debugging switch
# reads as the debugger being broken rather than as a renamed setting.
#
# The old name applies only while the current one is still at its default, which
# is the same rule, and the same limitation, as _FORMER_NAMES in production.py:
# the test is whether anything changed the current name, and a file setting it to
# False explicitly cannot be told apart from a file not mentioning it. So writing
# both names with conflicting values resolves to the old one. Write one.
if 'AWX_DISABLE_TASK_MANAGERS' in locals():
    if ASCENDER_DISABLE_TASK_MANAGERS == DEFAULTS_SNAPSHOT.get('ASCENDER_DISABLE_TASK_MANAGERS'):
        ASCENDER_DISABLE_TASK_MANAGERS = AWX_DISABLE_TASK_MANAGERS  # NOQA

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
