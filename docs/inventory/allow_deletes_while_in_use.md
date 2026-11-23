### Allow Deletes While In Use

Ascender refuses to delete a host while its inventory is in use. The
inventory is in use while one of its jobs, inventory updates or ad hoc
commands is `new`, `pending`, `waiting` or `running`, and the API answers
`DELETE /api/v2/hosts/N/` with a `409 Conflict` that lists them:

```json
{
    "error": "Resource is being used by running jobs.",
    "active_jobs": [
        {"id": 42, "type": "job"},
        {"id": 43, "type": "inventory_update"},
        {"id": 44, "type": "ad_hoc_command"}
    ]
}
```

A job that finished less than a minute ago but has not saved all of its
events yet blocks the deletion too, with a `403`:

```json
{
    "detail": "Related job job 42 (successful) is still processing events."
}
```

The `allow_deletes_while_in_use` flag on the inventory turns both checks off
for its hosts, so a host is deleted even while jobs use the inventory:

```bash
curl -X PATCH -H 'Content-Type: application/json' \
     -d '{"allow_deletes_while_in_use": true}' \
     https://ascender.example.com/api/v2/inventories/5/
```

Two refusals come before the check and the flag does not lift them: a host
of an inventory that is already being deleted ("The inventory for this host
is already being deleted.") and a host of a constructed inventory ("Delete
constructed inventory hosts from input inventory."), both `400` with an
`error` key. The code is `hostDelete` in `src/internal/api/hosts.go` and
`checkRelatedActiveJobs` in `src/internal/api/related_jobs.go`.

The flag is for hosts only. Deleting the inventory itself
(`DELETE /api/v2/inventories/N/`, or the constructed or federated endpoint)
always runs the same check, whatever the flag says: the inventory's active
jobs, inventory updates and ad hoc commands are a `409` with `active_jobs`,
and a recently finished one still processing events is a `403`. An
inventory that is already being deleted answers `400` with
`{"error": "Inventory is already pending deletion."}`.

Groups and `POST /api/v2/bulk/host_delete/` are not checked against running
jobs: a group or a list of hosts can be deleted while jobs run against the
inventory, whether or not the flag is set.

In the UI the flag is a checkbox under `Options` in the form of a regular
inventory, and it shows up under `Enabled Options` in the inventory details.
The API takes it for every kind of inventory.

The field defaults to `false`, so nothing changes for existing inventories, and
it is editable by inventory admins only, like any other inventory field.

#### What happens to a running job

Ansible reads the inventory once, when the job starts, so a host removed mid
run keeps being targeted by the job that is already in flight. Deleting it
does not interrupt or alter that job, and the results are still recorded:

* Job events keep their `host_name`, and their host reference is not enforced
  at database level, so event processing is unaffected.
* Host summaries created at the end of the job keep the host name and leave
  the host link empty when the host no longer exists.

What you lose is the per host link between that job and the deleted machine,
which is expected, since the host itself is gone.

Two more things are worth knowing:

* Jobs that are queued but have not started yet simply do not see a deleted
  host.
* On a sliced job, each slice builds its own host list when it starts, so
  removing a host while earlier slices already ran can shift the distribution
  for the slices that are still pending.
