"""Helpers for the grouped Jobs view.

A stack is a view-level grouping of active jobs that share a unified job
template.  Status grouping is the parallel mode that collapses all active jobs
into one summary row per status.  Nothing here is persisted; the list view keeps
one representative row for each group and attaches the counts the UI needs.
"""

from functools import lru_cache

from django.contrib.contenttypes.models import ContentType
from django.db.models import Case, Count, IntegerField, Max, Q, Subquery, Value, When
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ParseError

from ascender.main.constants import ACTIVE_STATES
from ascender.main.models import Job, JobTemplate, UnifiedJobTemplate, WorkflowJob

GROUP_BY_PARAM = 'group_by'
GROUP_BY_TEMPLATE = 'template'
GROUP_BY_STATUS = 'status'
GROUP_BY_VALUES = (GROUP_BY_TEMPLATE, GROUP_BY_STATUS)
TEMPLATE_FILTER_PARAM = 'unified_job_template'
STACK_CANCEL_CHUNK = 200
STACK_SUMMARY_TEMPLATE_LIMIT = 200


def validate_group_by(request):
    """Return the requested grouping mode, or None.

    ``group_by`` is reserved globally, so the field lookup backend never treats
    it as a filter.  ``template`` and ``status`` are meaningful; anything else is
    a 400 rather than a silently ignored parameter.
    """
    values = request.query_params.getlist(GROUP_BY_PARAM)
    if not values:
        return None
    if len(values) > 1 or values[0] not in GROUP_BY_VALUES:
        raise ParseError(_('Invalid group_by value. Only "template" and "status" are supported.'))
    return values[0]


def parse_template_ids(request):
    """Read and validate the summary endpoint's template id restriction.

    Accepts repeated and comma-separated ``unified_job_template__in`` values,
    matching the list filter's field lookup.  The summary endpoint is never
    allowed to fall back to an unrestricted list.
    """
    values = request.query_params.getlist(TEMPLATE_FILTER_PARAM + '__in')
    template_ids = set()
    for value in values:
        for part in value.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                template_ids.add(int(part))
            except (TypeError, ValueError):
                raise ParseError(_('unified_job_template__in must contain integers.'))
    if not template_ids:
        raise ParseError(_('unified_job_template__in is required.'))
    if len(template_ids) > STACK_SUMMARY_TEMPLATE_LIMIT:
        raise ParseError(_('Too many templates requested for a stack summary.'))
    return sorted(template_ids)


@lru_cache(maxsize=1)
def _stackable_ctype_ids():
    return (
        ContentType.objects.get_for_model(Job).id,
        ContentType.objects.get_for_model(WorkflowJob).id,
    )


def get_stack_members(queryset):
    """Active, eligible jobs with a template, under the caller's filters.

    This is the set used for counts and cancellation.  It is deliberately not
    the representative-collapsed queryset and is never paginated by this
    helper.
    """
    return queryset.filter(
        status__in=ACTIVE_STATES,
        unified_job_template__isnull=False,
        polymorphic_ctype_id__in=_stackable_ctype_ids(),
    )


def collapse_to_representatives(queryset, members_queryset=None):
    """Keep the highest-ranked active job for each template.

    Ranking is ``(status='running') DESC, id DESC``.  Terminal jobs and jobs
    without a template are never collapsed.  ``members_queryset`` is the
    user-filtered set used to choose the representative; it must not include an
    ``id__in`` page restriction, while ``queryset`` still limits the returned
    rows to the requested ids.
    """
    members = get_stack_members(members_queryset if members_queryset is not None else queryset)
    running_order = Case(
        When(status='running', then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    # One DISTINCT ON pass over the members, rather than a correlated
    # representative lookup per active outer row.  The subquery is not
    # correlated, so its cost does not multiply by the number of active jobs on
    # the page (or in the count query).
    representative_ids = members.order_by('unified_job_template_id', running_order, '-id').distinct('unified_job_template_id').values('id')
    active_eligible = Q(
        status__in=ACTIVE_STATES,
        unified_job_template__isnull=False,
        polymorphic_ctype_id__in=_stackable_ctype_ids(),
    )
    return queryset.filter(~active_eligible | Q(id__in=Subquery(representative_ids)))


def get_active_jobs(queryset):
    """All active jobs under the caller's filters, regardless of type."""
    return queryset.filter(status__in=ACTIVE_STATES)


def status_group_counts(queryset):
    """Return the number of active jobs for each status under the filters.

    One aggregate query.  Count distinct ids because a filter through a
    multi-valued relation (for example labels or credentials) repeats a job row
    once per matching related object.
    """
    return {row['status']: row['count'] for row in (get_active_jobs(queryset).order_by().values('status').annotate(count=Count('id', distinct=True)))}


def status_group_aggregates(queryset):
    """Return the count and representative id for each active status.

    One aggregate query.  The representative is the highest-id active job for
    the status; it is the placeholder row for that status summary.
    """
    return {
        row['status']: {
            'status': row['status'],
            'count': row['count'],
            'representative_id': row['representative_id'],
        }
        for row in (get_active_jobs(queryset).order_by().values('status').annotate(count=Count('id', distinct=True), representative_id=Max('id')))
    }


def collapse_to_status_representatives(queryset, aggregates=None):
    """Keep the highest-id active job for each status.

    Terminal rows are never collapsed.  A status with one active job still
    collapses to that job, because the status row is a summary row even when it
    counts one job.
    """
    if aggregates is None:
        aggregates = status_group_aggregates(queryset)
    representative_ids = [group['representative_id'] for group in aggregates.values()]
    return queryset.filter(~Q(status__in=ACTIVE_STATES) | Q(id__in=representative_ids))


def _is_active_row(row):
    return row is not None and row.status in ACTIVE_STATES


def _is_active_eligible_row(row):
    return (
        row is not None and getattr(row, 'unified_job_template_id', None) and row.status in ACTIVE_STATES and row.polymorphic_ctype_id in _stackable_ctype_ids()
    )


def _template_metadata(template_ids):
    """Resolve template name, project and organization for the page's stacks."""
    if not template_ids:
        return {}

    base = {row['id']: row for row in UnifiedJobTemplate.objects.filter(id__in=template_ids).values('id', 'name', 'organization_id', 'organization__name')}
    projects = {
        row['unifiedjobtemplate_ptr_id']: {
            'id': row['project_id'],
            'name': row['project__name'],
        }
        for row in JobTemplate.objects.filter(unifiedjobtemplate_ptr_id__in=template_ids).values('unifiedjobtemplate_ptr_id', 'project_id', 'project__name')
        if row['project_id']
    }

    metadata = {}
    for template_id in template_ids:
        row = base.get(template_id)
        if row is None:
            metadata[template_id] = {'id': template_id}
            continue
        item = {'id': template_id, 'name': row['name']}
        if row['organization_id']:
            item['organization'] = {'id': row['organization_id'], 'name': row['organization__name']}
        if template_id in projects:
            item['project'] = projects[template_id]
        metadata[template_id] = item
    return metadata


def build_stack_map(queryset, rows):
    """Build the ``stack`` payload for the page's representative rows.

    ``queryset`` must be the filtered, pre-collapse queryset.  ``rows`` is the
    page of rows that will be serialized.  One aggregate query and one template
    metadata lookup are issued, never one per row.
    """
    template_ids = sorted({row.unified_job_template_id for row in rows if _is_active_eligible_row(row)})
    if not template_ids:
        return {}

    counts = {}
    status_counts = {}
    aggregate = (
        get_stack_members(queryset)
        .filter(unified_job_template_id__in=template_ids)
        .order_by()
        .values('unified_job_template_id', 'status')
        .annotate(count=Count('id', distinct=True))
    )
    for row in aggregate:
        template_id = row['unified_job_template_id']
        count = row['count']
        counts[template_id] = counts.get(template_id, 0) + count
        status_counts.setdefault(template_id, {})[row['status']] = count

    metadata = _template_metadata(template_ids)
    stack_map = {}
    for template_id in template_ids:
        total = counts.get(template_id, 0)
        if total < 2:
            continue
        stack_map[template_id] = {
            'count': total,
            'status_counts': status_counts.get(template_id, {}),
            'template': metadata.get(template_id, {'id': template_id}),
        }
    return stack_map


def build_status_group_map(queryset, rows, aggregates=None):
    """Build the ``status_group`` payload for the page's status rows.

    ``queryset`` must be the filtered, pre-collapse queryset.  ``rows`` is the
    page of rows that will be serialized.  The count covers every active job of
    each represented status under the user's filters and RBAC, before collapsing
    and without pagination.  Reuse ``status_group_aggregates`` when the caller
    already has it so the list issues only one aggregate query.
    """
    statuses = sorted({row.status for row in rows if _is_active_row(row)})
    if not statuses:
        return {}
    if aggregates is None:
        aggregates = status_group_aggregates(queryset)

    status_map = {}
    for status in statuses:
        group = aggregates.get(status)
        if group and group['count'] >= 1:
            status_map[status] = {'status': status, 'count': group['count']}
    return status_map


def is_status_group_representative(obj, status_map):
    """Whether ``obj`` is an active row with a status summary payload."""
    return _is_active_row(obj) and obj.status in status_map


def is_stack_representative(obj, stack_map):
    """Whether ``obj`` is an active eligible row with a stack payload."""
    return _is_active_eligible_row(obj) and obj.unified_job_template_id in stack_map
