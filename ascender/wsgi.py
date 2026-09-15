# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Prepare the Ascender environment.
from ascender import prepare_env

prepare_env()

import django  # NOQA
from django.conf import settings  # NOQA
from django.urls import resolve  # NOQA
from django.core.wsgi import get_wsgi_application  # NOQA
import social_django  # NOQA

"""
WSGI config for the Ascender project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/dev/howto/deployment/wsgi/
"""

# Return the default Django WSGI application.
application = get_wsgi_application()
