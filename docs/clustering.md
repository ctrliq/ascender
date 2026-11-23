# Ascender Clustering Overview

Ascender runs as two programs that share one PostgreSQL database:

- `ascender-web` serves the REST API, the UI and the websocket. It keeps no
  state of its own, so any number of copies can run behind a load balancer.
- `ascender-task` does the background work: it registers its node as an
  instance, claims and runs jobs, runs the cluster heartbeat, launches
  schedules and runs the periodic cleanups. Each `ascender-task` process is
  one control plane node (an `Instance`), named by `ASCENDER_CLUSTER_HOST_ID`
  (the host name when unset).

Execution and hop nodes run no Ascender process. They run
[receptor](https://github.com/ansible/receptor) and `ansible-runner`, and the
control plane reaches them through a receptor node beside `ascender-task`.

```
            ┌──────────────────────────┐
            │      Load balancer       │
            │ (configured separately)  │
            └────┬────────────────┬────┘
                 │  API, UI and   │
                 ▼  websockets    ▼
          ┌──────────────┐  ┌──────────────┐
          │ ascender-web │  │ ascender-web │
          └──────┬───────┘  └──────┬───────┘
                 │                 │
               ┌─▼─────────────────▼─┐
               │     PostgreSQL      │
               └─▲─────────────────▲─┘
                 │                 │
       ┌─────────┴────────┐ ┌──────┴───────────┐
       │  ascender-task   │ │  ascender-task   │
       │  (node A)        │ │  (node B)        │
       │  receptor        │ │  receptor        │
       └─────────┬────────┘ └──────┬───────────┘
                 │  receptor mesh  │
                 ▼                 ▼
         execution and hop nodes, container group pods
```

On Kubernetes the operator runs `ascender-web` and `ascender-task` as
separate containers and sets `IS_K8S` in the settings file
(`ASCENDER_SETTINGS_FILE`). Elsewhere (docker compose, a VM) the two binaries
run as they are; see `deploy/README.md`. In both cases a cluster grows by
running more `ascender-task` processes, each with its own
`ASCENDER_CLUSTER_HOST_ID`, against the same database (on Kubernetes, by
raising the replica count).

## Instance types

| Type | Runs | Registered by |
| --- | --- | --- |
| `hybrid` | `ascender-task`; controls jobs and runs them on this node with podman or docker | `ascender-task` at startup (`ASCENDER_NODE_TYPE=hybrid`, the default) |
| `control` | `ascender-task`; controls jobs but runs none on this node | `ascender-task` at startup (`ASCENDER_NODE_TYPE=control`; the Kubernetes operator uses this) |
| `execution` | receptor and `ansible-runner`; runs jobs sent over the mesh | the API on Kubernetes, or `ascender-web provision_instance` |
| `hop` | receptor only; routes mesh traffic, and can run the pods of a container group (see [Container Groups](./container_groups/README.md)) | the API on Kubernetes, or `ascender-web provision_instance` |

`ascender-task` refuses to start with any `ASCENDER_NODE_TYPE` other than
`hybrid` or `control`. A `control` node has all the machinery to run jobs,
but the capacity rules never place execution work on it, so control nodes can
be sized for control work alone while execution nodes, or container groups,
run the jobs.

### Registration

At startup, before it claims any work, `ascender-task` registers its node
(`src/internal/tasks/provision.go`, `src/internal/models/instance_register.go`):
a new node is created in the `installed` state with no capacity, and a node
that already has a row goes back to `installed` with the type it is started
as. It then applies the instance group membership policies (see below). On
Kubernetes it also registers the two default instance groups:
`DEFAULT_CONTROL_PLANE_QUEUE_NAME` (`controlplane`) taking every control node,
and `DEFAULT_EXECUTION_QUEUE_NAME` (`default`) as a container group, with the
pod spec override and limits the settings file gives in
`DEFAULT_EXECUTION_QUEUE_POD_SPEC_OVERRIDE`,
`DEFAULT_EXECUTION_QUEUE_MAX_FORKS` and
`DEFAULT_EXECUTION_QUEUE_MAX_CONCURRENT_JOBS`. The first heartbeat health
check then makes the node `ready` and gives it capacity.

`ascender-task check_instance_ready` exits 0 when this node's instance is
`ready`, for a readiness probe.

Outside Kubernetes the first task process of a new installation, finding no
instance group at all, creates the same two groups (`registerFirstQueues`),
each with `policy_instance_percentage` 100: `controlplane` takes every
control and hybrid node, and `default`, an ordinary instance group, every
hybrid and execution node. Once any instance group exists they are left to
the administrator: a group deleted later is not created again.

Groups are also created or updated with `ascender-web register_queue`, the
old installer's command:

```
ascender-web register_queue --queuename NAME [--instance_percent N] [--instance_minimum N] [--hostnames NODE,...]
```

It creates the group when it is missing and sets its policy percentage and
minimum; `--hostnames` adds those instances (not hop nodes) to the group and
to its policy instance list, and never removes one. It fails, naming the
host, when a hostname is not an instance that can run jobs.

Execution and hop nodes are added through `POST /api/v2/instances/` (only when
`IS_K8S` is set, as before) or with the management commands of
`ascender-web` (`src/cmd/ascender-web/commands.go`):

```
ascender-web provision_instance --hostname NAME --node_type execution|hop
ascender-web add_receptor_address --instance NAME --address ADDRESS [--port N] \
    [--protocol tcp|ws|wss] [--websocket_path PATH] [--is_internal] [--canonical] [--peers_from_control_nodes]
ascender-web deprovision_instance --hostname NAME
```

`GET /api/v2/instances/N/install_bundle/` returns a tarball for an execution
or hop node: a receptor certificate and key signed by the mesh CA, the CA,
the work signing public key, and the `ansible.receptor` playbook and
inventory that set the node up. The CA and its key and the work signing key
are read from `ASCENDER_RECEPTOR_DIR` (default `/etc/receptor`). Only a
superuser can download a bundle; the old application also let a system
auditor.

## Communication between nodes

| Between | Connection | Purpose |
| --- | --- | --- |
| every process and PostgreSQL | PostgreSQL protocol | queries, `LISTEN`/`NOTIFY`, advisory locks |
| `ascender-task` and its receptor | receptor's control socket | mesh status, work units, health checks |
| receptor nodes | receptor mesh (TCP, or websockets) | routing work to execution nodes, advertisements |
| `ascender-task` and a container group's cluster | Kubernetes API (HTTPS) | creating and reading job pods |

Ascender processes never connect to each other. There is no websocket
backplane between control nodes and no Redis: everything one process tells
the others goes through PostgreSQL.

### PostgreSQL

The database is the only shared state. Besides ordinary queries the processes
use two `NOTIFY` channels:

- `ascender_dispatch`: the API wakes the task processes with it when a job is
  created, canceled or asked for a health check, or when an execution
  environment image is no longer used
  (`src/internal/api/project_updates.go`, `src/internal/tasks/dispatcher.go`).
- `ascender_websocket`: job status changes, job events and the other
  websocket messages, published by whichever process produced them and
  relayed by every `ascender-web` to the browsers subscribed to them
  (`src/internal/api/websocket.go`). A browser therefore sees the events of a
  job controlled by any node, whichever `ascender-web` it is connected to.
  Job events travel as references and are read back from the database only
  when someone is subscribed to the job.

Advisory locks keep cluster-wide passes to one process at a time:
claiming and placing tasks (the old task manager's lock), the schedule pass,
the mesh inspection, and changes to instance group membership.

### Receptor

Receptor provides an overlay network that connects control, execution and hop
nodes. Nodes on the mesh are connected by persistent TCP or websocket
connections, and a node can reach any other node on the mesh even when they
are not directly connected:

```
node A <---TCP---> node B <---TCP---> node C
```

Node A reaches node C (and the other way round) through the receptor process
on node B.

`ascender-task` talks to its local receptor node over its control socket
(`src/internal/receptor/receptor.go`). The socket, the TLS client and whether
work is signed are read from the receptor configuration file
(`ASCENDER_RECEPTOR_CONFIG`, default `/etc/receptor/receptor.conf`);
`ASCENDER_RECEPTOR_SOCKET` overrides the socket's path when it is mounted
elsewhere. A node with no receptor configuration, or whose socket does not
exist, runs no mesh work: it cannot use execution nodes or container groups
behind a hop node.

On Kubernetes (`IS_K8S`) each `ascender-task` keeps its receptor's
configuration in step with the database (`src/internal/tasks/receptor_config.go`):
at startup and every heartbeat period it adds a peer for every receptor
address with `peers_from_control_nodes`, rewrites the file when it differs,
and tells receptor to reload it. Outside Kubernetes the deployment provides
the receptor configuration and its peers; `ascender-task` does not write it.

## Node health

Every `ascender-task` runs the cluster heartbeat every 60 seconds
(`src/internal/tasks/heartbeat.go`). The heartbeat period and the number of
missed heartbeats tolerated are fixed in the code
(`src/internal/models/instance_health.go`); they are not settings.

1. **This node checks itself first**, so that a slow receptor never delays its
   check-in. It records its CPU count (`runtime.NumCPU`), total memory
   (`MemTotal` from `/proc/meminfo`) and version (`ASCENDER_VERSION`), sets
   `last_seen`, recomputes its capacity and, if it was `installed` or
   `unavailable`, becomes `ready`. If its own row is missing it logs an error,
   unless `ASCENDER_AUTO_DEPROVISION_INSTANCES` is set, in which case it
   registers itself again.
2. **The mesh is inspected** by one control node at a time (an advisory lock):
   - the mesh status (what `receptorctl status` shows) is read from the local
     receptor; instance links in the `adding` state become `established` once
     the mesh shows the connection;
   - each execution or hop node's advertisement time becomes its `last_seen`;
   - an execution node advertising while `installed` or `unavailable` gets a
     health check, and so does an enabled execution node with no capacity,
     at most every 30 minutes;
   - a hop node advertising while `installed` or `unavailable` becomes `ready`.
3. **Lost nodes are handled.** A control or hybrid node is lost when its
   `last_seen` is more than two heartbeat periods (120 seconds) old; an
   execution or hop node gets one receptor advertisement period more (180
   seconds). For every lost node other than this one:
   - its running jobs (as execution or controller node) and the waiting jobs
     it controls are failed with "Job reaped due to instance shutdown". Jobs
     that hold a job monitor lease are left to the job monitor instead (see
     "Job runtime behaviour");
   - a lost control node is removed when `ASCENDER_AUTO_DEPROVISION_INSTANCES`
     is set (the operator sets it: a pod that is gone does not come back
     under its name); any other lost node that was `ready` is marked
     `unavailable` with no capacity.
4. **This node's own leftovers are reaped**: a task it controls that is
   running, or has been waiting for six minutes, without a goroutine in this
   process running it is failed.

A health check of an execution node (`execution_node_health_check`) runs
`ansible-runner worker --worker-info` on the node as a receptor work unit. Its
answer (CPU count, memory, `ansible-runner` version) is saved and the node's
capacity recomputed from it; errors mark the node `unavailable`. An
administrator can start one with `POST /api/v2/instances/N/health_check/`
(execution nodes only).

> **Note:** the old heartbeat compared this node's `ansible-runner` version
> with the other nodes' and shut its own services down when it was older.
> `ascender-task` does not.

### Removing nodes

Setting an instance's `node_state` to `deprovisioning` through the API is
allowed on Kubernetes, as before, for nodes that are not managed (those added
through the API). Nodes registered by `ascender-task` or `provision_instance`
are managed. Beyond the old rules, any node, managed or not and on any
platform, can be set to `deprovisioning` once the heartbeat has marked it
`unavailable` and it has not checked in since. Every minute `ascender-task`
removes the deprovisioning nodes that no job runs on, waits on or is
controlled by any more, with their links and receptor addresses.

`ascender-web deprovision_instance --hostname NAME` removes a node at once.

A hop node that runs the pods of a container group cannot be deprovisioned
until it is removed from those groups.

## Instance groups

Instances are grouped into instance groups, which jobs are assigned to.

Instance groups are created by a system administrator with
`POST /api/v2/instance_groups/`. An instance is associated with a group with:

```
POST /api/v2/instance_groups/N/instances/ {"id": X}
```

or from the instance's side with `POST /api/v2/instances/X/instance_groups/`.
`{"id": X, "disassociate": true}` removes it. The membership of control and
hop nodes cannot be changed this way, and a hybrid node cannot be removed
from the control plane group.

The groups named by `DEFAULT_CONTROL_PLANE_QUEUE_NAME` and
`DEFAULT_EXECUTION_QUEUE_NAME` cannot be deleted, renamed, turned into or out
of container groups, or have their `policy_instance_percentage` or
`policy_instance_list` changed.

### Instance group policies

Instances join instance groups automatically through the policies of the
groups. The policies are applied when `ascender-task` starts, when an
instance is registered or deprovisioned, and after any API change to a group
or a membership (`src/internal/models/cluster_policy.go`). Three optional
fields of an instance group control them:

- `policy_instance_list`: a fixed list of instance host names that always
  belong to the group.
- `policy_instance_minimum`: the group keeps at least this many instances. If
  fewer instances are available, all of them are placed in the group.
- `policy_instance_percentage` (0 to 100): at least this percentage of the
  instances belong to the group.

The list is applied first, then the minimums, then the percentages, each time
giving instances to the groups with the fewest instances and taking the
instances that belong to the fewest groups. Only instances with
`managed_by_policy` set count for the minimum and the percentage.

- Control nodes never join a group other than the control plane group, and
  execution nodes never join the control plane group. Hop nodes join no
  group. Container groups have no instances, and their policy fields cannot
  be set.
- An instance associated with a group through the API
  (`/api/v2/instance_groups/N/instances/` or
  `/api/v2/instances/X/instance_groups/`) is added to the group's
  `policy_instance_list`, and removed from it when disassociated, so it is
  subject to the same rules as any other listed instance.
- `policy_instance_percentage` and `policy_instance_minimum` work together.
  With a percentage of 50, a minimum of 2 and 6 instances, 3 of them are in
  the group. With 2 instances, both are, to satisfy the minimum.
- Policies do not stop an instance from belonging to several groups, but
  percentages that sum to 100 have that effect: with four groups at 25 each,
  the instances are spread among them without overlap.

### Pinning an instance to specific groups

To keep an instance in chosen groups only, without the minimum and
percentage policies adding it to others:

1. Add the instance to the groups' `policy_instance_list`.
2. Set the instance's `managed_by_policy` to `false`.

```
PATCH /api/v2/instance_groups/N/
{
    "policy_instance_list": ["special-instance"]
}

PATCH /api/v2/instances/X/
{
    "managed_by_policy": false
}
```

## Status and monitoring

`GET /api/v2/ping/` reports:

- `active_node`: the `ASCENDER_CLUSTER_HOST_ID` of the `ascender-web` process
  that answered;
- every instance but the hop nodes, with its type, capacity, version and
  last heartbeat;
- every instance group with its capacity and member instances.

`/api/v2/instances/` and `/api/v2/instance_groups/` give the details,
including consumed capacity, running jobs and membership.
`/api/v2/mesh_visualizer/` lists the nodes and the links between them.

## Job runtime behaviour

When a job is created, the API notifies `ascender_dispatch`. Every
`ascender-task` listens on that channel and also polls every 15 seconds. To
claim a task, a process moves the oldest pending task that is not blocked to
`waiting` and places it, under the task manager's advisory lock, so that two
processes never see the same capacity or start two jobs that block each
other (`src/internal/tasks/dispatcher.go`, `src/internal/tasks/capacity.go`).
A task is blocked while another job of the same template runs (unless the
template allows simultaneous runs), while its project or (unless the
inventory allows jobs while syncing) its inventory is updating. A task that
does not fit anywhere goes back to `pending` and is tried again when a job
finishes, or after 15 seconds. `ASCENDER_TASK_WORKERS` (default 4) limits
how many tasks one process runs at once; capacity still decides what fits.

The node that claims a task is its controller: each `ascender-task` controls
the work it claims, and executes it on its own node (a hybrid node), on an
execution node reached through its receptor, or in a container group's pod.
Within an instance group the task goes to the instance it can reach that has
the most capacity left. The old task manager could make any control node the
controller; here the controller is always the claiming node.

As instances come online they add capacity to the cluster and to the groups
they belong to. An instance in several groups gives capacity to all of them,
and a job running on it consumes capacity in all of them. Instances need not
have equal capacity. See [Capacity](./capacity.md).

If every instance of the groups a job may use is offline or full, the job
stays `pending` until one has room. Provision fallback capacity for this
case.

What happens to running work when its controller stops depends on where it
runs. A job running in a container group pod or on an execution node holds a
job monitor lease: when its controller shuts down or is lost, another control
node takes the lease over and goes on reading the job's output (see
[the job monitor lease](./job_monitor_lease.md)). A job running on a hybrid
node's own container runtime fails when that node shuts down; a project or
inventory update stopped by a shutdown is re-queued instead, unless it is the
inline sync of a job.

### Project synchronization

A job needs the project's source tree on the node that prepares its private
data directory, which is the controller. Before the job runs, the controller
syncs the project if its checkout is missing, is not at the project's
revision, or the job overrides the branch, or if the roles and collections
cache is incomplete (`src/internal/tasks/project_sync.go`). The sync is a
project update with `launch_type` `sync` and `job_type` `run`, run on the
controller as part of the job, and the synced tree is then copied into the
job's private data directory. Only `check` updates change the project's
revision and its lists of playbooks and inventories.

A sync does not change the project's status or last job, unless it is the
project's first update (`templateRunning` and `templateFinished` in
`src/internal/tasks/run_base.go`), so a job's failed sync of another branch
does not mark the project failed.

Project updates run in the control plane execution environment. On
Kubernetes they run as `local` work of the receptor beside `ascender-task`,
which mounts the projects directory at the same path; elsewhere they run in
a container started with podman or docker on the controller.

### Controlling where a job runs

Project updates and system jobs always run in the control plane group
(`DEFAULT_CONTROL_PLANE_QUEUE_NAME`, `controlplane`). System jobs run inside
`ascender-task` itself.

Every other job is placed in the first of its preferred instance groups with
room. The preferred groups are computed when the job is created and stored
with it:

1. the instance groups given when it was launched, if the template prompts
   for them; otherwise
2. the job template's instance groups, then the inventory's, then the
   organization's (the job's organization), stopping after the job template
   or the inventory when it sets `prevent_instance_group_fallback`;
3. if none of these has any, the global groups: the
   `DEFAULT_EXECUTION_QUEUE_NAME` group (`default`), and outside Kubernetes
   also the `DEFAULT_CONTROL_PLANE_QUEUE_NAME` group (`controlplane`).

Inventory updates use the inventory source's groups first; see
[Instance Groups on Inventory Sources](./inventory_source_instance_groups.md).
Ad hoc commands use the instance groups given when they are launched, else the
inventory's groups, then its organization's.

If a job template, inventory or organization has instance groups, its jobs
do not fall back to the global groups: when all of the listed groups are
full the job stays `pending`. To prefer a group but still allow any capacity,
add `default` to the list after it.

### Enabling and disabling an instance

Each instance has an `enabled` flag. A disabled instance has no capacity and
is given no new work; jobs already running on it finish.
