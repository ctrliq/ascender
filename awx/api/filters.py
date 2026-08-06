# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

# Python
import functools
import operator

# Django
from django.db.models import Q

# django-ansible-base
from ansible_base.rest_filters.rest_framework.field_lookup_backend import FieldLookupBackend

__all__ = ['DERIVED_HOST_FIELDS', 'HostFieldLookupBackend']

# Host field -> path from JobHostSummary that backs it; None is the summary itself.
DERIVED_HOST_FIELDS = {'last_job': 'job', 'last_job_host_summary': None}


def _annotated_hosts():
    from awx.main.models.inventory import Host

    return Host.objects.with_latest_summary_id()


def hosts_matching_latest_summary(condition):
    """
    Hosts whose most recent JobHostSummary satisfies condition, a Q against JobHostSummary.

    Recency comes from _latest_summary_id, the annotation the Host list views already carry
    and that HostSerializer reads last_job/last_job_host_summary through, so a filter cannot
    disagree with the values it serializes.
    """
    from awx.main.models.jobs import JobHostSummary

    matching = JobHostSummary.objects.filter(condition).values('id')
    return _annotated_hosts().filter(_latest_summary_id__in=matching).values('pk')


def hosts_without_latest_summary(missing):
    """Hosts that have never run when missing is True, those that have when it is False."""
    return _annotated_hosts().filter(_latest_summary_id__isnull=missing).values('pk')


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

        if remainder == 'isnull':
            missing, _, _ = super().value_to_python(JobHostSummary, 'id__isnull', value)
            return hosts_without_latest_summary(missing), 'pk__in', False

        inner = remainder or 'id'
        if prefix:
            inner = '{}__{}'.format(prefix, inner)
        elif inner == 'search':
            # A summary holds none of the field names treated as searchable, which the
            # parent expresses as an empty lookup list, and an empty list of ORs matches
            # every row rather than none.
            return Host.objects.none().values('pk'), ['pk__in'], False

        value, inner, _ = super().value_to_python(JobHostSummary, inner, value)
        if isinstance(inner, list):
            # __search expands to several lookups, all relative to JobHostSummary, so the
            # OR collapses here; left to the caller they would be applied against Host.
            if not inner:
                return Host.objects.none().values('pk'), ['pk__in'], False
            condition = functools.reduce(operator.or_, (Q(**{one: value}) for one in inner))
            return hosts_matching_latest_summary(condition), ['pk__in'], False
        return hosts_matching_latest_summary(Q(**{inner: value})), 'pk__in', False
