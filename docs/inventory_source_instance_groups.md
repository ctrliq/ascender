# Instance Groups on Inventory Sources

An inventory update (source sync) is a real job: an execution node spawns an execution
environment and runs the inventory plugin inside it. That means the node that executes the
sync is the node that needs network access to the inventory source, not the control plane.

Before this feature, the instance groups used for a sync were always taken from the
inventory (falling back to the organization and then the global default). The
`instance_groups` field on the inventory was doing double duty: it controlled both where
playbooks that use the inventory run and where the syncs of that inventory run. If your
hosts live in a remote network segment and you pin the inventory to an execution node
registered there, the syncs also land on that node, which may have no route back to the
system the inventory source pulls from.

Now instance groups can be assigned directly to an inventory source, and they take
precedence over the inventory's. The full resolution order for an inventory update is:

1. `inventory_source.instance_groups`
2. `inventory.instance_groups`
3. `organization.instance_groups` (skipped when the inventory sets
   `prevent_instance_group_fallback`)
4. the global default instance group

A source with no instance groups behaves exactly as before, so existing deployments are
unaffected. A single inventory with several sources in different network segments can pin
each source to the instance group that can actually reach it.

## API

`GET /api/v2/inventory_sources/N/instance_groups/` lists the instance groups of a source.
POST `{"id": X}` to associate, `{"id": X, "disassociate": true}` to remove. The order of
association is preserved and is the order the scheduler uses. Associating requires use
permission on the instance group plus admin permission on the inventory, the same rule
that applies to job templates and inventories.

Container groups are valid targets, just as they are for the inventory level routing.

Playbook jobs that use the inventory ignore this field entirely; it only affects inventory
updates.
