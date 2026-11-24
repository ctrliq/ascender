### Allow Jobs While Ad Hoc Commands Run

By default, while an ad hoc command is running against an inventory, every job and every
other ad hoc command launched against that inventory stays `pending` until it is over.
The job explanation says why:

```
waiting for adhoccommand-1234 to finish
```

That makes sense when the ad hoc command changes the hosts under the feet of whatever
comes next, a reboot for example. But a lot of ad hoc commands are long and harmless for
other work, like a `dnf update` across many hosts or a quick `ping` that happens to start
first, and they end up holding back jobs that have nothing to do with them.

The `allow_jobs_while_ad_hoc` flag on the inventory lets those jobs and ad hoc commands
start anyway:

```bash
curl -X PATCH -H 'Content-Type: application/json' \
     -d '{"allow_jobs_while_ad_hoc": true}' \
     https://ascender.example.com/api/v2/inventories/5/
```

Constructed inventories take the same field on their own endpoint,
`/api/v2/constructed_inventories/<id>/`.

In the UI the flag is a checkbox under `Options` in the inventory form and in the
constructed inventory form, and it shows up under `Enabled Options` in their details.

The field defaults to `false`, so nothing changes for existing inventories, and it is
editable by inventory admins only, like any other inventory field. It is a setting of the
inventory, not something a job or its variables can turn on for itself.

#### What it lets through

With the flag on, a running ad hoc command no longer blocks:

* **jobs** launched against the same inventory, and
* **other ad hoc commands** against the same inventory.

Both are let through because the reason to block them is the same: the tasks would act
on the same hosts at the same time. If two tasks really must not overlap, leave the flag
off for that inventory, or keep them apart some other way (a workflow, for example).

#### What does not change

* **Syncs.** An ad hoc command never held back a sync of its inventory, and it still
  does not. A sync still waits for another sync of the same source.
* **Syncs blocking jobs.** A running sync still blocks jobs and ad hoc commands unless
  the inventory also has `allow_jobs_while_syncing` set. The two flags are independent:
  each one only lifts its own kind of block.
* **Jobs never blocked ad hoc commands**, and they still do not. Only the ad hoc command
  was blocking, so that is the only thing the flag touches.
* **Job templates** that do not allow simultaneous runs still wait for their own previous
  job, and project updates still block jobs that need them.

#### Kinds of inventory

The flag lives on the inventory, so it counts for whatever inventory the ad hoc command
and the job were launched against. Regular, constructed and smart inventories all take it.
For a federated inventory, each child job runs against one of the input inventories, so
it is the flag on that input inventory that counts.
