# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

# Django
from django.db.models import OuterRef, Subquery

# django-ansible-base
from ansible_base.rest_filters.rest_framework.field_lookup_backend import FieldLookupBackend

__all__ = ['HostFieldLookupBackend']

DERIVED_HOST_FIELDS = {'last_job': 'job', 'last_job_host_summary': None}


def latest_summaries():
    """The JobHostSummary rows that are the most recent one for their host."""
    from awx.main.models.jobs import JobHostSummary

    newest = JobHostSummary.objects.filter(host_id=OuterRef('host_id')).order_by('-id')
    return JobHostSummary.objects.filter(id=Subquery(newest.values('id')[:1]))


class HostFieldLookupBackend(FieldLookupBackend):
    """
    Resolves Host.last_job and Host.last_job_host_summary against the newest
    JobHostSummary for each host. The columns of the same name are denormalized
    caches that are no longer written, so a plain lookup matches nothing.
    """

    def value_to_python(self, model, lookup, value):
        from awx.main.models.inventory import Host
        from awx.main.models.jobs import JobHostSummary

        field, _, remainder = lookup.partition('__')
        if model is not Host or field not in DERIVED_HOST_FIELDS:
            return super().value_to_python(model, lookup, value)

        prefix = DERIVED_HOST_FIELDS[field]
        hosts_with_summary = latest_summaries().values('host_id')

        if remainder == 'isnull':
            value, _, _ = super().value_to_python(JobHostSummary, 'id__isnull', value)
            if value:
                return Host.objects.exclude(pk__in=hosts_with_summary).values('pk'), 'pk__in', False
            return hosts_with_summary, 'pk__in', False

        inner = remainder or 'id'
        if prefix:
            inner = '{}__{}'.format(prefix, inner)
        value, inner, _ = super().value_to_python(JobHostSummary, inner, value)
        return latest_summaries().filter(**{inner: value}).values('host_id'), 'pk__in', False
