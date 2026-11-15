{% ifmeth POST %}
# Cancel all active jobs in a stack

Make a POST request to this resource to cancel the active jobs that share one
unified job template.  The query string carries the same filters as the Jobs
list; the request body names the template whose active jobs should be canceled:

    {"unified_job_template": 12}

Batches are processed from the highest job id down.  The first request omits
`before_id`; the response returns the lowest id it examined as
`next_before_id` (or `null` when nothing remains).  Continue a chunked cancel by
passing that cursor back:

    {"unified_job_template": 12, "before_id": 345}

The response status code is 202 and contains:

* `canceled`: number of jobs canceled in this request (integer)
* `skipped`: number of jobs the user may not cancel (integer)
* `skipped_ids`: ids of the skipped jobs (list of integers)
* `remaining`: number of unexamined active members below the cursor (integer)
* `next_before_id`: lowest id examined in this request, or `null` when done
  (integer or null)

At most 200 jobs are processed per request.  When `remaining` is greater than
zero and `next_before_id` is not `null`, repeat the request with the new
`before_id`.  Jobs the user may not cancel are skipped and reported rather than
failing the whole request; skipped jobs are not selected again, so a batch that
contains only skipped jobs still advances to the next batch.
{% endifmeth %}
