# Instance Groups on Inventory Sources

An inventory update (source sync) is a real job: an execution environment is started on an
execution node, a hybrid node or in a container group's pod, and the inventory plugin runs
inside it. So the node that executes the sync is the one that needs network access to the
inventory source, not the control plane.

Without this feature, the instance groups used for a sync were always taken from the
inventory (falling back to the organization and then the global default). The
`instance_groups` field on the inventory was doing double duty: it controlled both where
playbooks that use the inventory run and where the syncs of that inventory run. If your
hosts live in a remote network segment and you pin the inventory to an execution node
registered there, the syncs also land on that node, which may have no route back to the
system the inventory source pulls from.

Instance groups can be assigned directly to an inventory source, and they take precedence
over the inventory's. The full resolution order for an inventory update
(`InventoryUpdatePreferredInstanceGroups` in `src/internal/models/inventory_update.go`) is:

1. `inventory_source.instance_groups`
2. `inventory.instance_groups`
3. `organization.instance_groups`, the inventory's organization (skipped when the inventory
   sets `prevent_instance_group_fallback`)
4. only when none of the above has any group: the global groups, the
   `DEFAULT_EXECUTION_QUEUE_NAME` group (`default`), and outside Kubernetes also the
   `DEFAULT_CONTROL_PLANE_QUEUE_NAME` group (`controlplane`)

The list is worked out when the update is created (launched by hand, by a schedule, from a
workflow, by a provisioning callback, or by a job whose inventory updates on launch) and
stored with it. `ascender-task` then places the
update in the first group of the list with room for it (see [Capacity](./capacity.md)); if
none has room, the update stays `pending`.

An update that a job starts because its source has `update_on_launch` follows the same
order. While the job waits for it, the job's own worker takes the update if no other worker
has, and places it the same way. The update then runs in this task process's worker slot,
on an instance of its preferred groups (`claimPlacedDependency` in
`src/internal/tasks/run_base.go`). When none of its groups has room, but the job itself was
placed in one of them, the update takes the job's place: the job holds that capacity and
uses none of it until its dependencies are done.

A source with no instance groups behaves exactly as before, so existing deployments are
unaffected. A single inventory with several sources in different network segments can pin
each source to the instance group that can actually reach it.

## API

`GET /api/v2/inventory_sources/N/instance_groups/` lists the instance groups of a source.
POST `{"id": X}` to associate, `{"id": X, "disassociate": true}` to remove. The order of
association is preserved and is the order the groups are tried in. Associating requires use
permission on the instance group plus admin permission on the inventory, the same rule
that applies to job templates and inventories.

Container groups are valid targets, just as they are for the inventory-level routing.

Playbook jobs that use the inventory ignore this field entirely; it only affects inventory
updates.
