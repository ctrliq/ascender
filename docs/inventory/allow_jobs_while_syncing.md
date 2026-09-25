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

#### What still waits

The flag only lets a job past syncs it did not ask for. It does not change:

* **Update on launch.** When an inventory source has `update_on_launch` set, the update
  it starts for a job is a dependency of that job, and the job waits for it as before.
  The same goes for a sync that is already running when such a job is launched and
  that the job picks up as its dependency instead of starting a new one.
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
