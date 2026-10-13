### Allow Jobs While Syncing

By default, while an inventory is being synced, every job and ad hoc command launched
against it stays `pending` until the sync is over. The job explanation says why:

```
waiting for inventoryupdate-1234 to finish
```

That is the safe choice when the job needs what the sync brings in, but plenty of jobs
would run just as well on the hosts the inventory already has. A long cloud sync, or a
constructed inventory that gets rebuilt often, can then hold back work that had no
reason to wait.

The `allow_jobs_while_syncing` flag on the inventory lets those jobs start anyway:

```bash
curl -X PATCH -H 'Content-Type: application/json' \
     -d '{"allow_jobs_while_syncing": true}' \
     https://ascender.example.com/api/v2/inventories/5/
```

Constructed inventories take the same field on their own endpoint,
`/api/v2/constructed_inventories/<id>/`.

In the UI the flag is a checkbox under `Options` in the inventory form and in the
constructed inventory form, and it shows up under `Enabled Options` in their details.

The field defaults to `false`, so nothing changes for existing inventories, and it is
editable by inventory admins only, like any other inventory field.

#### What the job sees

The sync writes its hosts and groups inside a single database transaction, so a job
that starts while the sync is running reads the inventory as it was before the sync.
Once the sync commits, jobs that start from then on get the new data. A job that is
already running is not affected by the sync finishing, because Ansible reads the
inventory once when the job starts.

The window where a job could see a mix of old and new data is the moment the sync
commits while that job is building its inventory. It is short, but if a job cannot live
with it, leave the flag off for that inventory.

#### Update on launch

When an inventory source has `update_on_launch` set, launching a job either starts a new
sync of that source or, if one is already going, picks that one up as a dependency of
the job. The flag changes only the second case:

* **A sync started for the job** is always waited for. The job asked for fresh data, for
  example because the last sync is older than the source's `update_cache_timeout`.
* **A sync that was already running** when the job was launched is not waited for if the
  flag is on. The job runs on the hosts from the last successful sync of that source, the
  same as it would for a source without `update_on_launch`.
* **If the source has never synced successfully**, there is nothing to fall back on, so
  the job still waits for the running sync.

This matters most for constructed inventories, because their source always has
`update_on_launch` set and it cannot be turned off. It also matters for the many cloud
sources that are set to update on launch.

#### What still waits

Besides the cases above, the flag does not change:

* **Ad hoc commands.** A running ad hoc command still blocks jobs and other ad hoc
  commands on the same inventory, with or without the flag. Ad hoc commands themselves
  do follow the flag when what is running is a sync.
* **The sync itself.** A sync still waits for another sync of the same source, and jobs
  never block a sync.

#### Kinds of inventory

* **Regular inventories** and **constructed inventories** both take the flag. For a
  constructed inventory it refers to the sync of the constructed inventory itself; syncs
  of its input inventories never held back jobs on the constructed one.
* **Federated inventories** run each child job against one of the input inventories, so
  it is the flag on each input inventory that counts.
* **Smart inventories** are never synced, so the flag makes no difference there.

#### Sliced jobs

Each slice of a sliced job is scheduled on its own and works out its share of the hosts
when it starts. With the flag on, some slices can start before a sync commits and others
after it, and if the sync added or removed hosts the split no longer lines up: a host
can end up in two slices or in none. For sliced job templates on inventories that change
often, leave the flag off.

#### Fact caching

A job that uses fact caching writes the facts it gathered back to the host rows when it
finishes. A sync holds locks on the host rows it updates or deletes until it commits, so
if the job finishes while the sync is still running, the fact write waits for the sync to
commit. In the worst case the two deadlock and the database rolls one of them back. A job
that was already running when a sync started could always run into this, but with the
flag on the overlap becomes routine. If an inventory has long syncs and jobs that cache
facts, keep that in mind before turning the flag on.
