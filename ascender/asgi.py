# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.
import os
import django

# Prepare the Ascender environment.
from ascender import prepare_env
from channels.routing import get_default_application  # noqa

prepare_env()  # NOQA


"""
ASGI config for the Ascender project.

It exposes the ASGI callable as a module-level variable named ``channel_layer``.

For more information on this file, see
https://channels.readthedocs.io/en/latest/deploying.html
"""

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ascender.settings")
django.setup()
channel_layer = get_default_application()
