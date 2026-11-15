# Stacked Jobs list

The Jobs screen can group active job runs that share a unified job template into
one stack row.  Grouping is a view-level representation only; stacks are not a
new persisted entity.

## Grouping

* Enable grouping with the `group_by=template` or `group_by=status` query
  string parameter.  Any other value returns a 400.  `group_by` is a reserved
  parameter and is never treated as a field filter.
* Active, eligible jobs are those in `new`, `pending`, `waiting` or `running`
  state whose type is `job` or `workflow_job` and which have a unified job
  template.  Project updates, inventory updates, system jobs and ad-hoc
  commands are never stacked.
* Each template's active jobs collapse to one representative row: the running
  job with the highest id, falling back to the highest-id active job when none
  is running.  The representative drives the row's id, start time and sorting.
* A stack needs at least two active members.  A template with one active job is
  shown as a normal row.  Terminal jobs are never collapsed and sort as usual.
* The list response attaches a `stack` object to representative rows:

  ```json
  "stack": {
    "count": 3,
    "status_counts": {"pending": 2, "running": 1},
    "template": {
      "id": 12,
      "name": "Deploy app",
      "project": {"id": 3, "name": "Web"},
      "organization": {"id": 1, "name": "Default"}
    }
  }
  ```

* The count and status counts are computed over the same filtered, active,
  eligible member set that the list used, before collapsing and without
  pagination.  They respect the user's filters and RBAC.
* Stack and status summary rows return `summary_fields: {}`.  They are synthetic
  placeholders with no actions, so related summary fields are not computed for
  them.  Terminal rows keep their normal summary fields.
* An `id__in` restriction only limits which representative rows are returned;
  it never changes which member is representative or the counts.  If the
  representative is outside `id__in`, that stack (or status group) is absent
  from the response.
* Grouping and filters are independent.  Filters always narrow the set first,
  and grouping then summarizes that filtered set.  For example,
  `group_by=template&unified_job_template=<id>` shows that template's active
  jobs as a stack, and `group_by=status&status=pending` shows a status summary
  row for the filtered pending jobs.

## Canceling a stack

`POST /api/v2/unified_jobs/stacks/cancel/` cancels the active members of one
stack.  The query string carries the same filters as the Jobs list and the body
names the template:

    {"unified_job_template": 12}

Batches are processed from the highest job id down.  The first request omits
`before_id`; the response includes `next_before_id`, the lowest id that request
examined (or `null` when nothing is left).  Pass it back to continue:

    {"unified_job_template": 12, "before_id": 345}

The response is `202` with `canceled`, `skipped`, `skipped_ids`, `remaining` and
`next_before_id`.  A request processes at most 200 jobs.  `remaining` counts
unexamined active members below the cursor, so skipped jobs are never selected
again: a fully skipped batch still advances the cursor and lets a later request
reach jobs the user may cancel.  Repeat while `remaining` is greater than zero
and `next_before_id` is not `null`, always passing the new cursor.  Jobs the user
may not cancel are skipped and reported rather than failing the request.  When
any workflow job was canceled, the workflow manager is scheduled once at the
end.

## Template-filtered Jobs list

The stack name links to the normal Jobs list with grouping removed and the
template filter applied (`?unified_job_template=<id>`).  That list shows each
active or terminal run individually so it can be canceled or inspected on its
own.  Because the link removes grouping explicitly, the grouping selector shows
**No grouping** and stays available.

## Group by status

The same `group_by` parameter accepts `status`, which gives an at-a-glance view of
active work by status.  This mode is independent of template stacking; selecting
one replaces the other.

* All active jobs (`new`, `pending`, `waiting`, `running`) collapse into one
  summary row per status.  Every active unified job type that appears in the
  Jobs list counts: jobs, workflow jobs, project updates, inventory updates,
  system jobs and ad-hoc commands.  Workflow approvals are not jobs; they are
  not listed or counted by status grouping.  While a workflow job is waiting
  for an approval, the workflow job itself remains `running` and is counted as
  running.
* A status with a single active job still gets a summary row with count 1.  There
  is no minimum of two.
* Terminal jobs are never grouped and remain normal single rows.
* The row for each status uses the active job with the highest `id` as its
  placeholder.  The name column shows a translated title such as **Pending jobs**
  or **Running jobs**, linking to the status-filtered Jobs list.  The status
  column shows a single chip with the count, e.g. **Pending 12**.  The expand,
  select, ID, type, time and action cells are empty; status rows cannot be
  expanded or selected and have no cancel action.
* The title link removes `group_by` and any existing status filters (including
  the toolbar's `or__status`/`status__in` forms), applies `job.status=<status>`,
  resets the page and keeps non-status filters.  That list shows individual jobs
  rather than summary rows.
* The grouping selector is a three-option control: **No grouping**, **Group by
  status** and **Group by template**.  It is always available; filters do not
  disable grouping, and grouping does not prevent filtering.
* A status-grouped page refreshes its visible counts with
  `GET /api/v2/unified_jobs/status_summary/` using the same filters.  That read
  is not paginated and returns a `counts` map.  A missing visible status, or a
  status the page did not show before, triggers a full page reload so row
  membership and the list count stay correct.

## Refresh timing

Grouped pages use the websocket for live updates.  Stack and status summary
reads are coalesced with a five-second leading/trailing throttle, so a burst of
messages does not become a burst of requests.  A full page read is only needed
when row membership or pagination changes.

A terminal job that leaves a stack or status that still has other active
members is not present in the summary response: its terminal row and the list
count only appear after a page read.  Those ejection reads have their own
ten-second throttle, measured from the start of the last full page, so a storm
of finishing jobs cannot force a page read per job.  Any full page satisfies a
pending ejection.  A 60-second safety read, with jitter, remains the fallback
for dropped websocket messages.

