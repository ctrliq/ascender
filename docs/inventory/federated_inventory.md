### Federated Inventory in Ascender

Federated inventory is a separate "kind" of inventory, alongside normal (manual),
smart, and constructed inventories.

Its purpose is to solve a specific job routing problem: when multiple source inventories
are each assigned to different Instance Groups (for example, an "East" instance group
for the East inventory and a "West" instance group for the West inventory), running a
job against a combined inventory will execute on only one instance group — ignoring the
per-source assignments. Federated inventory fixes this by automatically dispatching
a separate job slice for each source inventory, each running on that inventory's own instance
groups.

#### Demo Problem

Consider two inventories, each pinned to a regional instance group:

| Inventory | Hosts          | Instance Group |
|-----------|----------------|----------------|
| East      | host1, host2   | ig-east        |
| West      | host3, host4   | ig-west        |

If you run a job template against a constructed (or plain) inventory that merges both,
the job runs entirely on whichever instance group is assigned to that combined inventory.
Hosts in the "East" inventory will not necessarily run on `ig-east`, and vice versa.

Federated inventory solves this: a job launched against a federated inventory containing
both "East" and "West" as input inventories will produce two child jobs — one running
on `ig-east` against the East inventory, and one running on `ig-west` against the
West inventory — simultaneously.

#### How It Works

When a job template is launched against a federated inventory, Ascender intercepts
the launch and creates a **WorkflowJob** (with `is_sliced_job=True`) in place of a
single job. One `WorkflowJobNode` is created for each input inventory that has
matching hosts (taking the effective `limit` into account). Each node overrides the
inventory for its child job to be the corresponding source inventory, so the child
job naturally inherits that inventory's instance group assignments.

**Key behaviors:**

- Child jobs run **simultaneously** (`allow_simultaneous=True`).
- Each child job uses the source inventory's instance groups, not the federated
  inventory's (the federated inventory itself has no instance group assignment).
- If a `limit` is specified (either on the job template or at launch time), source
  inventories that contribute no matching hosts or groups are **skipped** — no child
  job is created for them.
- Complex limit patterns containing `:`, `&`, or `!` are passed through to all
  source inventories and let Ansible resolve them at run time.
- The federated inventory itself holds no hosts or groups directly. The Hosts and
  Groups tabs in the UI aggregate data from all input inventories for visibility.

#### Creating a Federated Inventory

1. Navigate to **Inventories** and click **Add → Add federated inventory**.
2. Provide a **Name** and **Organization**.
3. Under **Input Inventories**, select one or more source inventories.
   - Smart, constructed, and other federated inventories are excluded from selection.
   - An inventory cannot be added as an input to itself.
4. Save. The federated inventory is ready to use as the inventory on a job template.

**Note:** Federated inventories have no inventory source and do not require or
support syncing. There is no `source_vars`, `limit`, `verbosity`, or cache timeout
field on the federated inventory itself — those are on the job template.

#### Capabilities

- Works with any job template that accepts an inventory.
- Supports `limit` specified at the job template level or as a launch-time prompt.
- The resulting WorkflowJob appears in the Jobs list and shows per-source child jobs,
  exactly like a sliced job.
- RBAC is enforced normally: the user launching the job needs `use_role` on all
  involved source inventories (via the job template's inventory permission).

#### Limitations

- **No ad hoc commands**: ad hoc commands do not go through `create_unified_job` on
  the job template, so they run against the federated inventory directly (which has
  no hosts) and will produce no results. Use a job template instead.
- **No inventory sync**: the federated inventory has no inventory source. Hosts and
  group data come entirely from the input inventories.
- **Constructed/smart inputs not supported**: input inventories must be plain
  (kind `''`) inventories. Smart and constructed inventories are excluded from the
  input inventory picker.
- **Complex limit patterns**: patterns using `:`, `&`, or `!` operators are passed
  through to all input inventories without pre-filtering, since Ansible resolves
  them at run time. This means child jobs may be created for inventories that end
  up matching no hosts after Ansible applies the limit.

#### Comparison with Constructed Inventory

| Feature                        | Constructed Inventory         | Federated Inventory               |
|-------------------------------|-------------------------------|-----------------------------------|
| Combines multiple inventories | Yes (via `source_vars` plugin) | Yes (direct input inventory list) |
| Respects per-source Instance Groups | No — uses combined IG  | Yes — routes each source to its own IG |
| Requires inventory sync       | Yes (update-on-launch)        | No                                |
| Supports host/group filtering | Yes (`limit`, `host_filter`)  | Via job template `limit` only     |
| Supports hostvars composition | Yes (`compose`, `groups`)     | No                                |
| Job output                    | Single job                    | WorkflowJob with per-source nodes |
| Use case                      | Dynamic filtering/grouping    | Multi-region IG routing           |
