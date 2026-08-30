# Copyright (c) 2017 Ansible by Red Hat
# All Rights Reserved.

from contextlib import contextmanager

from django_pg_utils.locks import advisory_lock as pgware_advisory_lock
from django.db import connection


@contextmanager
def advisory_lock(*args, **kwargs):
    if connection.vendor == 'postgresql':
        with pgware_advisory_lock(*args, **kwargs) as internal_lock:
            yield internal_lock
    else:
        yield True
