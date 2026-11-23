### Constructed inventory in Ascender

Constructed inventory is a separate kind of inventory (`kind` `constructed`),
alongside regular, smart and federated inventories. It takes one or more input
inventories and runs them through Ansible's `constructed` inventory plugin, so
it can filter hosts, add groups and compose variables with Jinja2 expressions.
It covers what [smart inventories](./README.md#smart-inventories) do and more.

#### Example

Consider two input inventories named "East" and "West".

```
# East inventory contents
host1 account_alias=product_dev
host2 account_alias=product_dev state=shutdown
host3 account_alias=sustaining
```

```
# West inventory contents
host4 account_alias=product_dev
host6 account_alias=product_dev state=shutdown
host5 account_alias=sustaining state=shutdown
```

The goal is to operate on the _shutdown_ hosts in _product_dev_: two
conditions that must both hold.

To do that, create a constructed inventory with East and West as its input
inventories and these settings:

`source_vars` =

```yaml
plugin: constructed
strict: true
use_vars_plugins: true
groups:
  shutdown: resolved_state == "shutdown"
  shutdown_in_product_dev: resolved_state == "shutdown" and account_alias == "product_dev"
compose:
  resolved_state: state | default("running")
```

`limit` = `shutdown_in_product_dev`

A job template that runs against the constructed inventory then acts on host2
and host6, the two hosts that fit both conditions.

#### Creating one

In the UI, choose **Add → Add constructed inventory** on the Inventories
list, and pick the **Input Inventories** in the order they should be read.

Through the API, `POST /api/v2/constructed_inventories/` takes the usual
inventory fields (`name`, `organization`, `description`, `variables`,
`prevent_instance_group_fallback`, `allow_jobs_while_syncing`) and these
fields of the inventory's source:

| Field | Meaning |
|-------|---------|
| `source_vars` | The `constructed` plugin's configuration, as YAML or JSON. |
| `limit` | A host pattern passed to `ansible-inventory --limit`: only the hosts it matches are kept. |
| `update_cache_timeout` | Seconds during which a successful update is reused instead of running a new one before a job. |
| `verbosity` | `0` to `2`, the verbosity of the update. |

The input inventories are attached afterwards, in order, with
`POST /api/v2/inventories/N/input_inventories/` and `{"id": <inventory id>}`
(`{"id": ..., "disassociate": true}` removes one). An input can be a regular
or a smart inventory; constructed and federated inventories are refused
("You cannot add a constructed or federated inventory as a source
inventory."). Attaching an input takes admin of the constructed inventory and
`use` of the input inventory, since its hosts become targets of every job run
on the constructed inventory.

`/api/v2/constructed_inventories/` lists and edits constructed inventories
only; they also appear in `/api/v2/inventories/`.

#### How it is built

The contents of a constructed inventory are materialized by an inventory
update, like any other inventory source sync.

Creating a constructed inventory also creates its one inventory source, with
`source` `constructed` and `update_on_launch` always on
(`EnsureConstructedSource` in `src/internal/models/inventory_source.go`). The
four fields above are edited through the constructed inventory; the source's
other fields cannot be changed ("Cannot change field 'update_on_launch' on a
constructed inventory source."), and a source of type `constructed` cannot be
created by hand.

The update (`runInventoryUpdate` in `src/internal/tasks/inventory_update.go`)
runs in the control plane execution environment
(`CONTROL_PLANE_EXECUTION_ENVIRONMENT`). It writes each input inventory as an
inventory script, in the input order, and runs:

```
ansible-inventory --list --export -i <input 1> ... -i <input n> -i constructed.yml [--limit <limit>]
```

where `constructed.yml` holds `source_vars`. For each input inventory the
script has its enabled hosts with their variables, its groups with their
variables and members, and its inventory variables as the `all` group's
variables. Each host also gets `remote_host_id` and `remote_host_enabled`
(and the same values as `remote_tower_id` and `remote_tower_enabled`), the id
and enabled state of the host in its input inventory.

The facts stored for the hosts of the input inventories are made available to
the plugin through the fact cache, as they are for a job (see
[Fact Caching](../fact_cache.md)), so `groups`, `keyed_groups` and `compose`
can use them.

The output is imported into the constructed inventory, replacing its hosts
and groups. Those hosts and groups belong to the constructed inventory and
are read only: hosts, groups and inventory sources cannot be added to it.

Because the source updates on launch, every job against a constructed
inventory first brings it up to date, unless the last successful update is
newer than `update_cache_timeout`. The update runs on the instance groups of
its source, inventory and organization (see
[Instance Groups on Inventory Sources](../inventory_source_instance_groups.md)),
and [Allow jobs while syncing](./allow_jobs_while_syncing.md) describes how
jobs wait for it.

#### Best practices

Set `strict: true` in `source_vars` so that mistakes in the templates show up:
a template that fails to render then fails the inventory update, with the
error in the update's output.

When an update does not give the result you expect, raise `verbosity` to see
more of what `ansible-inventory` did.
