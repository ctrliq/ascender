# Instance Group Routing

Instance group routing lets a single job template fan out over the instance groups
that can actually reach each host, using data that already lives in the inventory.

The typical setup: several isolated network zones (datacenters, security zones),
each one with its own execution nodes collected in an instance group, because the
firewalls only allow the execution nodes of a zone to reach the hosts of that zone.
The playbooks are the same everywhere, but a job runs on a single instance group,
so without routing every job template has to be duplicated per zone with a
different `limit` and instance group.

## How it works

Set `instance_group_routing_var` on a job template to the name of an inventory
variable, usually defined as a group variable:

```yaml
# group_vars for datacenter1
dc_instance_group: dc1-nodes

# group_vars for datacenter2
dc_instance_group: dc2-nodes
```

At launch, hosts are grouped by the value that the variable resolves to for each
of them. The launch then creates the same kind of implicit workflow job that
sliced jobs create, with one node per distinct value:

- Each node runs a job restricted to the hosts of its bucket (the rest of the
  inventory is filtered out, the same way slicing filters each slice), assigned
  to the instance group named by the value.
- Hosts that do not resolve the variable run in one extra job that keeps the
  normal instance group selection (job template, then inventory, then
  organization, then the default).
- If every host ends up in the same bucket, a plain job is launched instead of a
  workflow, on the routed instance group.
- If no host resolves the variable at all, the launch behaves as if routing were
  not configured.

Variable resolution follows a simplified version of the Ansible precedence
rules: host variables win over group variables, and group values are merged
sorted by depth, then `ansible_group_priority`, then group name, with later
groups overriding earlier ones. Values must be non empty strings; anything
else is treated as unset and the host goes to the fallback bucket. Disabled
hosts are ignored, so they neither create buckets nor count for the fallback.

## Security

Instance groups are global objects protected by RBAC. The routing variable is
inventory data, which can be edited by people with no permission at all on the
instance groups, so it is not trusted blindly:

- Routing only happens when the job template explicitly opts in by setting
  `instance_group_routing_var`.
- At launch, every instance group referenced by the inventory is checked against
  the launching user's use permission, the same rule applied to instance groups
  prompted at launch. If any referenced group fails the check, or does not
  exist, the launch is rejected with an error naming the group. There is no
  silent fallback.
- Relaunching a routed workflow re-resolves the buckets and applies the same
  checks against the relaunching user.

Launches that do not go through the API launch endpoint (schedules, webhooks,
workflow nodes) skip the per-user check, since there is no requesting user;
they still fail loudly if a value does not name an existing instance group: a
webhook launch answers with a 400, a workflow containing the routed template
is marked failed with the reason in its explanation, and a scheduled launch
is skipped with the error in the dispatcher log.

## Interactions and limitations

- Routing cannot be combined with job slicing: setting both
  `instance_group_routing_var` and a `job_slice_count` greater than 1 is a
  validation error, and prompting a slice count above 1 at launch time is
  rejected by the launch endpoint. On launch paths without that check
  (schedules, workflow nodes) slicing wins and routing is skipped.
- Provisioning callbacks never route: a callback runs against the single
  calling host, so the job uses the normal instance group selection, the same
  way callbacks never slice.
- Passing instance groups explicitly at launch (with
  `ask_instance_groups_on_launch`) is treated as an override: the launch runs a
  single job on the given instance groups and routing is skipped.
- The buckets are computed from the whole inventory; a `limit` still applies
  within each routed job, so a restrictive limit can leave some routed jobs
  with no matching hosts, the same way it can with sliced jobs.
- Relaunching a routed job (a single bucket) reruns the same bucket on the same
  instance group. Relaunching the routed workflow recomputes the buckets from
  the current inventory data.
