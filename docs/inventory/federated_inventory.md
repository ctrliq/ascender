### Federated Inventory in Ascender

Federated inventory is a separate kind of inventory (`kind` `federated`),
alongside regular, smart and constructed inventories.

It solves a job routing problem: when several inventories are each assigned to
a different instance group (for example an "East" instance group for the East
inventory and a "West" instance group for the West inventory), a job against
an inventory that combines them runs on one instance group only, whatever the
assignments of the inventories it was built from. A federated inventory
instead runs a separate child job for each input inventory, each on that
inventory's own instance groups.

#### Example

Consider two inventories, each pinned to a regional instance group:

| Inventory | Hosts          | Instance Group |
|-----------|----------------|----------------|
| East      | host1, host2   | ig-east        |
| West      | host3, host4   | ig-west        |

If you run a job template against a constructed (or regular) inventory that
merges both, the whole job runs on the instance groups of that combined
inventory. Hosts of the East inventory do not necessarily run on `ig-east`,
and vice versa.

A job launched against a federated inventory with East and West as its input
inventories produces two child jobs that run at the same time: one against
the East inventory on `ig-east`, and one against the West inventory on
`ig-west`.

#### How it works

When a job template is launched against a federated inventory, Ascender
creates a workflow job (with `is_sliced_job` set) instead of a single job,
with one node for each input inventory that has hosts the launch targets
(`createJobFromTemplate` in `src/internal/api/job_launch.go`). The nodes
follow the order of the input inventories (their `position`, the order they
were attached in). Each node's job runs against its input inventory in place
of the federated one (`src/internal/api/workflow_spawn.go`), so it picks up
that inventory's instance groups.

* Child jobs run at the same time (`allow_simultaneous` is set on them).
* Child jobs are neither sliced nor federated again: a child job is a single
  job with a `job_slice_count` of 1, whatever the job template's
  `job_slice_count`. Federation comes before slicing: a job template with a
  `job_slice_count` above 1 launched against a federated inventory makes one
  child job per input inventory, not slices.
* Relaunching a child job makes a single job against the same input
  inventory.
* Instance groups are chosen as for any job: the job template's instance
  groups (or those given at launch) come first, then the input inventory's,
  then the organization's. For the routing to follow the input inventories,
  leave the job template without instance groups. The federated inventory
  itself has no instance groups.
* The job's `limit` (given at launch, or else the job template's) is passed
  to each child job and applied by Ansible against that child's inventory.
  It is also used to leave out input inventories it would match nothing in
  (see below).
* The federated inventory holds no hosts or groups of its own. Its hosts,
  groups and root groups lists (`/api/v2/inventories/N/hosts/` and so on)
  show those of its input inventories, and so do its Hosts and Groups tabs in
  the UI.

#### Which input inventories get a child job

An input inventory without hosts never gets a child job. With a `limit`,
an input inventory gets a child job only when the limit can target some of
its hosts. The limit is read as a comma-separated list of patterns, as in
Ansible, and the input inventory is included when any pattern matches:

* `all` or `*`: any host.
* A name: a host or a group of that name.
* A shell-style pattern (`web*`, `db??`, `web[ab]`, `[!x]*`): a host name, or
  else a group name, matching it (Python's `fnmatch` rules, case-sensitive).
* `ungrouped`: a host in no group.
* A subscript (`webservers[0]`, `webservers[0:2]`, `webservers[1:]`,
  `webservers[0-1]`, `webservers[-1]`): its base pattern (`webservers`);
  Ansible picks the hosts by position at run time. A trailing numeric
  bracket is always a subscript (`web0[12]` is `web0`), other brackets are a
  character class (`web0[a1]`).
* A pattern Ascender cannot evaluate before the run (one containing `:`, `&`
  or `!`, a `~` regular expression, or an `@` limit file): every input
  inventory with hosts is included, and Ansible resolves the limit at run
  time.

When no input inventory matches, the workflow job has no nodes and finishes
as `successful` without running anything.

#### Creating a federated inventory

1. On the **Inventories** list, choose **Add → Add federated inventory**.
2. Give it a **Name** and an **Organization**.
3. Under **Input Inventories**, select one or more inventories. Only regular
   inventories can be selected.
4. Save. The federated inventory can now be used as the inventory of a job
   template.

Through the API, `POST /api/v2/federated_inventories/` creates one (it has no
`host_filter` or `prevent_instance_group_fallback` field), and the inputs are
attached with `POST /api/v2/inventories/N/input_inventories/` and
`{"id": <inventory id>}`. An input that is not a regular inventory is refused
with "Federated inventories only accept plain inventories as input
inventories." Attaching an input takes admin of the federated inventory and
`use` of the input inventory.

A federated inventory is not synced: it has no `source_vars`, `limit`,
`verbosity` or cache timeout. The `limit` is the job template's.

#### Capabilities

- Works with any job template that uses an inventory, including one that
  prompts for the inventory at launch.
- The workflow job appears in the Jobs list and shows the child jobs, like a
  sliced job.
- Launching takes what any launch of the job template takes. The input
  inventories were checked when they were attached.

#### Limitations

- **No ad hoc commands**: an ad hoc command runs against the federated
  inventory itself, which has no hosts, so it targets nothing. Use a job
  template instead.
- **No hosts or groups of its own**: hosts and groups cannot be created in
  or associated with a federated inventory ("Cannot create or associate
  hosts directly to a federated inventory.").
- **Only regular inputs**: smart, constructed and federated inventories
  cannot be inputs.
- **Complex limit patterns**: patterns with `:`, `&` or `!`, `~` regular
  expressions and `@` limit files are not evaluated at launch, so every
  input inventory with hosts gets a child job, which may then target no
  hosts once Ansible applies the limit.

#### Comparison with constructed inventory

| Feature                             | Constructed inventory              | Federated inventory                     |
|-------------------------------------|------------------------------------|-----------------------------------------|
| Combines several inventories        | Yes (input inventories, read by the `constructed` plugin) | Yes (input inventories) |
| Follows each input's instance groups | No: uses the constructed inventory's | Yes: each input runs on its own        |
| Needs an inventory sync             | Yes (updates on launch)            | No                                      |
| Host and group filtering            | Yes (`limit`, `groups` in `source_vars`) | Through the job template's `limit` only |
| Composes host variables             | Yes (`compose`, `groups`, `keyed_groups`) | No                                |
| Job output                          | One job                            | A workflow job with one child job per input |
| Use case                            | Filtering and grouping             | Routing jobs to each region's instance groups |
