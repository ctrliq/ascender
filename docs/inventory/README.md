# Inventories

This folder documents how Ascender handles inventories. The API is in
`src/internal/api` (`inventories.go`, `hosts.go`, `groups.go`,
`inventory_sources.go`, `inventory_source_write.go`), and inventory updates run
in `ascender-task` (`src/internal/tasks/inventory_update.go` and
`src/internal/tasks/inventory_import.go`).

| Document | What it covers |
|----------|----------------|
| [Constructed inventory](./constructed_inventory.md) | An inventory built from other inventories by the `constructed` inventory plugin. |
| [Federated inventory](./federated_inventory.md) | An inventory that runs one child job per input inventory, each on that inventory's instance groups. |
| [SCM inventory](./scm_inventory.md) | Inventory sources that read an inventory file, directory or script from a project. |
| [Inventory plugins](./inventory_plugins.md) | How cloud sources map to inventory plugins, and writing your own plugin configuration. |
| [Allow jobs while syncing](./allow_jobs_while_syncing.md) | The `allow_jobs_while_syncing` flag: letting jobs start while the inventory syncs. |
| [Allow deletes while in use](./allow_deletes_while_in_use.md) | The `allow_deletes_while_in_use` flag, and what blocks deleting a host or an inventory. |

Related documents elsewhere: [Instance Groups on Inventory Sources](../inventory_source_instance_groups.md)
(where inventory updates run), [Background Tasks](../tasks.md#inventory-updates)
(how an update runs), [Fact Caching](../fact_cache.md) and [Bulk API](../bulk_api.md).


## Kinds of inventory

The `kind` field is set when the inventory is created:

* `""` (a regular inventory): hosts and groups are added by hand, through the
  API, or by inventory sources.
* `smart`: the hosts are whatever the `host_filter` matches (see
  [Smart inventories](#smart-inventories) below).
* `constructed`: built from input inventories by an inventory update, with its
  own endpoint, `/api/v2/constructed_inventories/`.
* `federated`: routes each input inventory's part of a job to that
  inventory's instance groups, with its own endpoint,
  `/api/v2/federated_inventories/`.

A `PUT` or `PATCH` that names another kind is refused with
`405 Method Not Allowed`, whatever the inventory's kind is and through any of
the three endpoints:

```json
{
    "error": "You cannot turn a regular inventory into a \"smart\", \"constructed\", or \"federated\" inventory."
}
```

Naming the inventory's own kind is accepted. An empty kind (`""`) is not
refused either: it is saved, and turns a smart, constructed or federated
inventory into a regular one (it keeps its `host_filter`, and a constructed
inventory its source), as it did in the old application.


## Inventory sources and updates

An inventory source (`/api/v2/inventory_sources/`) belongs to one regular
inventory. Smart and constructed inventories refuse new sources
("Cannot create Inventory Source for Smart or Constructed Inventories"); a
constructed inventory has the one source that is created with it.

An inventory update runs `ansible-inventory` with the source's inventory
plugin or file in an execution environment and imports the JSON it prints
into the inventory's hosts and groups, in one database transaction. See
[Inventory plugins](./inventory_plugins.md) for the details, and
[Instance Groups on Inventory Sources](../inventory_source_instance_groups.md)
for where it runs.

`/api/v2/inventories/N/update_inventory_sources/` starts an update of every
source of an inventory at once. Sources with `source` set to `""` are
ignored. It takes the inventory's `update` role.

* `GET` lists each source with whether it can be updated:
  `[{"inventory_source": 1, "can_update": true}, ...]`.
* `POST` starts an update of every source that can be updated. Each entry of
  the response has `"status": "started"`, the `inventory_update` id and the
  update's fields, or `"status": "Could not start because `can_update`
  returned False"`. The response is `200` when every update started, `202`
  when only some did, and `400` when none did. An inventory with no sources
  answers `400` with `{"detail": "No inventory sources to update."}`.

A source of type `file` cannot be updated; an `scm` source can only be
updated when it has a project.


## Importing an inventory

Ascender has no command-line inventory import: there is no
`inventory_import` management command, and `ascender-web`'s subcommands
(`ascender-web help`) do not include one. The import code is the second half
of every inventory update and runs inside `ascender-task`.

To load an existing inventory into Ascender:

* put the inventory file, directory or script in a source control repository
  and add an [SCM inventory source](./scm_inventory.md) that points at it, then
  sync the source; or
* create the hosts through the API, many at a time with
  `POST /api/v2/bulk/host_create/` (see [Bulk API](../bulk_api.md)), or one by
  one with `POST /api/v2/inventories/N/hosts/`.


## Smart inventories

A smart inventory has `kind` set to `smart` and a `host_filter`, which is
required ("Smart inventories must specify host_filter"):

```
POST /api/v2/inventories/

{
    "name": "Web servers",
    "organization": 1,
    "kind": "smart",
    "host_filter": "name__startswith=web and groups__name=production"
}
```

Its hosts are the hosts that match the filter in all the inventories of the
smart inventory's organization, one per name: when hosts of different
inventories share a name, the one with the lowest id stands for them all.
The hosts are not stored with the inventory: the filter is applied every
time they are read, by the API, the inventory script and a job that runs
against the inventory (`InventoryHostRows` in
`src/internal/api/inventories.go`).

`/api/v2/inventories/N/hosts/` lists them, with its count and pages, to
anyone who can read the smart inventory, whether or not they can read the
inventories the hosts are in. The list's own filters are applied before the
one host per name is chosen, so `?enabled=false` finds a disabled host even
when an enabled one of the same name comes first. A job uses every matching
enabled host. The inventory's variables are applied to all of its hosts, and
it has no groups.

`/api/v2/hosts/N/smart_inventories/` lists the smart inventories the host is
recorded in (`main_smartinventorymembership`), of those the user can read.
The record is made when a job starts against a smart inventory, after the
checks for an inventory, a project and an execution environment and before
the playbook runs: the hosts the filter selects at that moment, disabled
ones included, replace the inventory's earlier record, in one transaction
(`updateSmartMemberships` in `src/internal/tasks/smart_membership.go`). A
failure there fails the job with `error`. Ad hoc commands record nothing.
So the list shows the smart inventories that held the host when each last
ran a job, not what their filters match now. Deleting a host or an inventory
removes its rows.

The old application's file-based setting `ASCENDER_REBUILD_SMART_MEMBERSHIP`
(default `False`), which rebuilt every smart inventory's record whenever a
host or a smart inventory was saved or deleted, is not read.

You cannot add hosts, groups or inventory sources to a smart inventory. The
API answers "Cannot create Host for Smart, Constructed, or Federated
Inventories", "Cannot create Group for Smart or Constructed Inventories" and
"Cannot create Inventory Source for Smart or Constructed Inventories".

Changing the `host_filter` of an existing smart inventory takes the
organization's `inventory_admin` role, not only admin of the inventory,
because the filter decides which of the organization's hosts the inventory
exposes.

In the UI, the smart inventory form builds the filter in a host filter
lookup, and the **Hosts** list can start a new smart inventory from its
current search.

### The host filter

The same filter language is accepted by `/api/v2/hosts/?host_filter=...`,
which is a convenient way to try a filter before saving it. It is parsed in
`src/internal/api/smartfilter.go` and checked against the old grammar in
`src/internal/api/smartfilter_validate.go`.

* A term is `field=value`, where `field` is a host field or a related field
  with Django-style lookups, as the list filters take them: `name`,
  `name__icontains`, `enabled`, `variables__icontains`, `groups__name`,
  `inventory__name`, `inventory__organization__name` and so on.
* Terms are combined with `and` and `or` (lower case) and grouped with
  parentheses. `and` binds tighter than `or`. There is no `not`.
* A value with spaces goes in double quotes: `groups__name="west coast"`.
  Single quotes are ordinary characters: `name='web'` matches a host whose
  name is `'web'`, quotes included.
* An unquoted value is typed first: `null` compares as `IS NULL` (with
  `__exact` and `__iexact`; other lookups refuse it with "Cannot use None as
  a query value"), and numbers and `true`/`false` are compared in the form
  Python printed them (`007` as `7`, `1.50` as `1.5`, `true` as `True`). A
  quoted value is taken as it is.
* `ansible_facts__` searches the facts stored for the host (see
  [Fact Caching](../fact_cache.md)). `__` separates the keys of the JSON
  path and `[]` after a key means the key holds a list. The match is JSON
  containment, so `ansible_facts__ansible_lo__ipv6[]__scope="host"` matches a
  host whose `ansible_lo.ipv6` list holds an object with `scope` `host`.
  Unquoted numbers, `true`, `false` and `null` are compared as JSON values;
  a quoted value is a string. Lookups such as `__icontains` are not supported
  on facts ("ansible_facts does not support searching with __icontains").
* `search=foo` matches hosts whose name or description contains `foo`
  (case-insensitive), and `inventory__search=foo` hosts whose inventory's
  name or description does. Other `<relation>__search` terms are not
  supported: a name that is not a model (`groups__search`) is
  `Invalid query`, and the name of a model hosts have no relation called
  that way (`group__search`) is "Cannot resolve keyword 'group' into field.
  Choices are: ...".

A filter that does not parse, or names a field hosts do not have, is
rejected with `Invalid query <filter>`: as a `400` with `{"error": ...}` on
`/api/v2/hosts/`, and as an error on the `host_filter` field when an
inventory is saved. The other errors above ("Cannot resolve keyword ...",
"Cannot use None as a query value", "'int' object is not iterable" for an
`__in` lookup given a number) come back the same way with their own message.
The old application answered those with a server error when an inventory was
saved.

Examples:

```
/api/v2/hosts/?host_filter=name=localhost
/api/v2/hosts/?host_filter=ansible_facts__ansible_date_time__weekday_number="3"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor[]="GenuineIntel"
/api/v2/hosts/?host_filter=ansible_facts__ansible_lo__ipv6[]__scope="host"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor_vcpus=8
/api/v2/hosts/?host_filter=(name=localhost or name=database) and (groups__name=east or groups__name="west coast") and ansible_facts__ansible_processor_vcpus=8
/api/v2/hosts/?host_filter=inventory__name="US-East" and name__icontains=nyc
/api/v2/hosts/?host_filter=search=web or inventory__search=staging
```

[Constructed inventories](./constructed_inventory.md) cover what smart
inventories do and more: they can also group hosts and compose variables.


## Deleting an inventory

`DELETE /api/v2/inventories/N/` (or the constructed or federated endpoint)
deletes the inventory with its hosts, groups and sources within the request.
It still answers `202 Accepted`, and the websocket still sees the
`pending_deletion` and `deleted` statuses (see
[Background Tasks](../tasks.md#work-done-in-the-request)). Job templates
that used the inventory are left without one.

Deleting an inventory is refused while one of its jobs, inventory updates or
ad hoc commands is active (`409`, with the list in `active_jobs`) or has
finished in the last minute without saving all of its events (`403`), and
while the inventory is already being deleted (`400`). The
`allow_deletes_while_in_use` flag does not change that: it lets hosts be
deleted while the inventory is in use. See
[Allow deletes while in use](./allow_deletes_while_in_use.md).


## Host sub-resources

Besides its groups, variables and facts, a host links to lists of what
concerns it, as the old API did:

* `/api/v2/hosts/N/job_events/`: the job events about the host, oldest
  first, as `/api/v2/jobs/N/job_events/` shows them (`stdout` truncated
  unless `?no_truncate=1`).
* `/api/v2/hosts/N/job_host_summaries/`: its job host summaries, newest
  first; for a host of a constructed inventory, the summaries recorded for
  it as `constructed_host`.
* `/api/v2/hosts/N/inventory_sources/`: the inventory sources that created or
  updated the host, of those the user can read.
* `/api/v2/hosts/N/smart_inventories/`: see
  [Smart inventories](#smart-inventories).
* `/api/v2/hosts/N/ad_hoc_commands/`, `/api/v2/hosts/N/ad_hoc_command_events/`
  and `/api/v2/hosts/N/activity_stream/`.

Reading any of them takes read access to the host's inventory.


## Group sub-resources

A group links to the same kind of lists, over all of its hosts: those of the
group and of every group below it, within the group's inventory (what
`/api/v2/groups/N/all_hosts/` lists):

* `/api/v2/groups/N/job_events/`: the job events about those hosts, oldest
  first, as the host's list shows them (`stdout` truncated unless
  `?no_truncate=1`).
* `/api/v2/groups/N/job_host_summaries/`: their job host summaries, newest
  first; for a group of a constructed inventory, the summaries recorded for
  its hosts as `constructed_host`.
* `/api/v2/groups/N/inventory_sources/`: the inventory sources that created or
  updated the group, of those the user can read.
* `/api/v2/groups/N/hosts/`, `/api/v2/groups/N/children/`,
  `/api/v2/groups/N/potential_children/`, `/api/v2/groups/N/ad_hoc_commands/`
  and `/api/v2/groups/N/activity_stream/`.

Reading any of them takes read access to the group's inventory. The code is
in `src/internal/api/host_relations.go`.
