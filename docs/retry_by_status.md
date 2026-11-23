# Relaunch on Hosts with Status

This feature allows the user to relaunch a job, targeting only the hosts marked
as "failed" in the original job.

The endpoint is `jobRelaunch` and `jobRelaunchView` in
`src/internal/api/jobs.go`. Relaunching a workflow job from its failed
nodes is a different feature (see
[Relaunch from Failed Nodes](./workflow.md#relaunch-from-failed-nodes)), as
are the automatic retries of workflow nodes (see
[Automatic Node Retries](./workflow.md#automatic-node-retries)).

### Definition of "failed"

This feature will relaunch against "failed hosts" in the original job, which
is different from "hosts with failed tasks". Unreachable hosts can have
no failed tasks. A host counts as failed when its host summary in the
original job has failures or is unreachable (the summary's `failed` flag,
set from the final playbook stats). This means that the count of "failed hosts" can be different
from the failed count, given in the summary at the end of a playbook.

This definition corresponds to Ansible `.retry` files.

### API Design of Relaunch

#### Basic Relaunch

POSTs to `/api/v2/jobs/N/relaunch/` without any request data relaunch
the job with the same `limit` value that the original job used, which
may be an empty string.

This is implicitly the "all" option, mentioned below; `{"hosts": null}`
does the same.

#### Relaunch by Status

Providing request data containing `{"hosts": "failed"}` changes
the `limit` of the relaunched job to target failed hosts from the previous
job. Hosts are provided as a comma-separated list of host names, in name order, in the limit. Formally,
these are the options:

 - `all`: relaunch without changing the job limit
 - `failed`: relaunch against all failed and unreachable hosts

The host names are those the hosts have when the job is relaunched: a host
renamed since the original job is targeted by its new name. Host names are
not quoted or escaped in the limit, so a host whose name contains a comma or
an Ansible pattern character is not targeted correctly.

Credential passwords the job's credentials ask for can be given in the same
request, under `credential_passwords` or at the top level
(`Missing passwords needed to start: <names>` under `credential_passwords`
when one is missing). A `null` `credential_passwords` is refused (`This field
may not be null.`), and an unknown `hosts` value gets DRF's choice error
(`"<value>" is not a valid choice.`).

### Relaunch Endpoint

Doing a GET to the relaunch endpoint returns additional information
regarding the host summary of the last job. Example response:

```json
{
    "passwords_needed_to_start": [],
    "retry_counts": {
        "all": 30,
        "failed": 18
    }
}
```

`all` counts the hosts that have a summary in the job. While the job is still
running, `retry_counts` is the message "Relaunch by host status not
available until job finishes running."

A POST with `{"hosts": "failed"}` is refused (`400`, with the message as the
string value of `hosts`, not in a list: `{"hosts": "Cannot retry on failed
hosts, playbook stats not available."}`) when:

* the job is still running: `Wait until job finishes before retrying on failed hosts.`;
* the job has no final playbook stats: `Cannot retry on failed hosts, playbook stats not available.`;
* no host failed: `Cannot relaunch because previous job had 0 failed hosts.`

For example, if a GET yielded:

```json
{
    "passwords_needed_to_start": [],
    "retry_counts": {
        "all": 30,
        "failed": 0
    }
}
```

...then a POST of `{"hosts": "failed"}` returns the last of these errors.

Not providing the `hosts` key in a POST to the relaunch endpoint relaunches
the same way as a basic relaunch. The relaunched job otherwise reuses the
original's prompts (see
[Job Relaunch and Re-scheduling](./prompting.md#job-relaunch-and-re-scheduling)),
and relaunching is not allowed when `prevent_relaunch` is set on its job
template (`Relaunch is disabled on the job template of this job.`).

If a playbook adds a host that is not in the inventory (with `add_host`, for
example), that host is neither counted in `retry_counts` nor targeted by a
relaunch on failed hosts, since only hosts of the inventory are.

When a playbook contains a task `meta: clear_host_errors`, the retry subset
behavior is the same as Ansible's for this case.
