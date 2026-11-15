# Read the active job count for each status

Make a GET request to this resource to refresh the counts on a status-grouped
Jobs list without fetching a whole page again.  The query string carries the
same filters as the Jobs list:

    ?status=running

The response is not paginated and contains one entry per active status that has
at least one matching job:

```json
{
  "counts": {
    "pending": 3,
    "running": 2
  }
}
```

Counts cover every active unified job type that appears in the Jobs list,
respect the same user filters and RBAC, and are computed before grouping and
without pagination.  An `id__in` restriction only limits which representative
rows a grouped list returns; it does not narrow these counts.  Workflow
approvals are not jobs and are not listed or counted; a workflow job that is
waiting for an approval remains `running` and is counted as running.

A status that is absent from `counts` has no matching active jobs.  The client
should treat a missing visible status, or a status it did not show before, as a
membership change and reload the grouped page.
