### Allow Deletes While In Use

By default, Ascender refuses to delete a host while any job is running against the
inventory that host belongs to. The API answers with a `409 Conflict`:

```json
{
    "error": "Resource is being used by running jobs.",
    "active_jobs": [{"id": 42, "type": "job"}]
}
```

The same protection covers jobs that finished less than a minute ago and are still
saving their events, which answer with a `403 Forbidden` instead.

On a busy inventory with schedules or long running plays this can leave no practical
window to remove a decommissioned machine. The `allow_deletes_while_in_use` flag on the
inventory opts out of that protection for the hosts of that inventory:

```bash
curl -X PATCH -H 'Content-Type: application/json' \
     -d '{"allow_deletes_while_in_use": true}' \
     https://ascender.example.com/api/v2/inventories/5/
```

In the UI the flag is a checkbox under `Options` in the inventory form, and it shows up
under `Enabled Options` in the inventory details.

The field defaults to `false`, so nothing changes for existing inventories, and it is
editable by inventory admins only, like any other inventory field.

#### What happens to a running job

Ansible reads the inventory once, when the job starts, so a host removed mid run keeps
being targeted by the job that is already in flight. Deleting it does not interrupt or
alter that job, and the results are still recorded:

* Job events keep their `host_name` and their host reference is not enforced at database
  level, so event processing is unaffected.
* Host summaries created at the end of the job keep the host name and simply leave the
  host link empty when the host no longer exists.

What you lose is the per host link between that job and the deleted machine, which is
expected, since the host itself is gone.

Adding hosts to an inventory while a job runs was always allowed, so this only brings
deletion in line with the rest of the inventory editing.

Two things are worth knowing before turning the flag on:

* Jobs that are queued but have not started yet will simply not see the deleted host.
* On a sliced job, each slice builds its own host list when it starts, so removing a
  host while earlier slices already ran can shift the distribution for the slices that
  are still pending.

Every deletion that goes through because of this flag is logged by `awx.api.views` with
the host, the inventory and the active jobs it was allowed against.

#### Groups

Group deletion is not blocked by running jobs today, in this or any other inventory:
`GroupDetail` deletes the group recursively without going through the related jobs
check, and the same is true of the bulk host delete endpoint. So the flag changes
nothing for groups, it only lines up the single host endpoint with what the rest of the
API already allows.
