# Read the current stack rows for selected templates

Make a GET request to this resource to refresh the stack rows already visible on
a grouped Jobs list without fetching a whole page again.  The query string
carries the usual list filters plus the template ids to refresh:

    ?unified_job_template__in=12,15

The response is not paginated.  It contains:

* `count`: number of stack rows returned (integer)
* `results`: the representative job rows.  Each row has `id`, `type`, `name`,
  `status`, `started`, `finished`, `job_type`, `unified_job_template`,
  `summary_fields: {}` and, when the template still has more than one active
  member, a `stack` object.  This narrow shape is deliberate: the endpoint
  refreshes rows that only display those fields, so it does not load the
  related objects a full job-list row would serialize.

Only active eligible members are considered, and the same user filters and RBAC
as the list apply.  A template with one active member still appears in
`results`, as a normal row without a `stack` object; the client should replace
the old stack row with that row.  A template with no active members is absent
from `results`; the client should remove that row.  The `id__in` list filter
limits which representative rows are returned but never changes which member is
representative or the stack counts.

These are summary rows, so each result has `summary_fields: {}`.  Related
summary fields are not computed because summary rows have no actions.
