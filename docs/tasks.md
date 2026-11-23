Background Tasks in Ascender
============================

This document describes how and when Ascender does work _in the background_,
outside the HTTP request that asked for it:

* Every job Ascender runs (a job template's job, an ad hoc command, a project
  update, an inventory update, a system job) is picked up by a background
  process, which reads the job from the database, prepares its private data
  directory and runs it, usually as `ansible-playbook`, `ansible` or
  `ansible-inventory` in an execution environment.
* Workflow jobs are advanced in the background: the jobs of their nodes are
  created as their parents finish.
* Periodic work runs on a timer: launching scheduled jobs, the cluster
  heartbeat and capacity checks, reaping jobs that were lost, and cleaning up
  files, images, receptor work units, container group pods, host metrics and
  expired sessions.

The task manager (which pending job starts, where, and when) is described in
[Task Manager System Overview](./task_manager_system.md).


Processes
---------

Ascender has two processes:

* `ascender-web` serves the API and the UI. Launching a job through the API
  inserts a `pending` row in `main_unifiedjob` and wakes the task processes.
  Work that a request leaves running after it has answered (sending
  notifications, reporting a job's status to a webhook's forge, applying
  instance group policies) runs in goroutines tracked by
  `api.Server.Background` (`src/internal/api/background.go`), which are
  given time to finish when the process stops.
* `ascender-task` (`src/cmd/ascender-task/main.go`) does everything else.
  One runs on every control or hybrid node. Its core is the dispatcher,
  `tasks.Dispatcher` in `src/internal/tasks/dispatcher.go`.

There is no message broker, no Celery-style task queue, no Redis or Valkey,
and no separate callback receiver. PostgreSQL is the only state the
processes share:

* The rows of `main_unifiedjob` are the queue. A task process claims a
  `pending` row by moving it to `waiting` (see the
  [task manager](./task_manager_system.md#claiming-a-task)).
* `LISTEN`/`NOTIFY` on the channel `ascender_dispatch` wakes the task
  processes (see [Notifications](#notifications)).
* Session-level advisory locks make sure that cluster-wide passes (the
  schedule pass, the workflow manager, the claim of a task) run in one task
  process at a time.

Job events are written to the database by the task process that runs the job
(`src/internal/tasks/job_events.go`, see [Job Events](./job_events.md)).


Startup
-------

When `ascender-task` starts it:

1. Reads its configuration from the environment and, when
   `ASCENDER_SETTINGS_FILE` is set, the settings file; connects to the
   database, creates the schema in an empty database or checks the level of
   an existing one, and loads the settings.
2. Registers its node in `main_instance` (`provision` in
   `src/internal/tasks/provision.go`). The node's name is
   `ASCENDER_CLUSTER_HOST_ID` (the host name by default) and its type
   `ASCENDER_NODE_TYPE`, which must be `hybrid` (the default) or `control`;
   any other type stops the process with an error. On Kubernetes (the
   `IS_K8S` setting) it also registers the control plane instance group and
   the default container group. The instance group membership policies are
   applied on every start. If the database is unavailable, registration is
   retried every 10 seconds.
3. Brings the schedules' computed fields up to date (`SyncSchedules`, under
   the schedule pass's lock).
4. Reaps what this node left behind when it stopped (`startupReaping`):
   tasks still `running` with this node as their controller fail with
   "Task was marked as running at system start up. The system must have not
   shut down properly, so it has been marked as failed.", unless a
   [job monitor lease](./job_monitor_lease.md) shows their work may still be
   running elsewhere; tasks this node had claimed but not started (`waiting`)
   fail with "Task was marked as running but was not present in the job
   queue, so it has been marked as failed.", as do claimed tasks that never
   got a controller node and have been `waiting` for over two minutes.
   Workflow jobs and workflow approvals are not reaped; the workflow manager
   carries on with them.
5. Starts the dispatcher's main loop and its periodic loops.

`ascender-task check_instance_ready` is a readiness probe: it exits 0 when
this node's `main_instance` row is in the `ready` state, and 1 otherwise.


Notifications
-------------

The API wakes the task processes with `pg_notify` on `ascender_dispatch`
(`api.Server.Notify` in `src/internal/api/project_updates.go`). The payload is
a JSON object with a `type` and an `id`:

| `type` | Sent when | What a task process does |
|:-------|:----------|:-------------------------|
| `job`, `project_update`, `inventory_update`, `ad_hoc_command`, `workflow_job` | a task was created | runs its main loop now |
| `cancel` | a running task was canceled | cancels the task if it runs it |
| `health_check` | a health check of an instance was requested | runs the execution node health check |
| `remove_images` | no execution environment uses an image any more | removes the image from this node and, on the node chosen to clean them, from the execution nodes |

Every task process listens on the channel, so every notification reaches
every task process: there are no per-node queues, and no distinction between
direct and fanout messages. Each process acts on what concerns it, and a task
process only ever claims work for its own node. Notifications are only
hints: the main loop also runs every 15 seconds, and the cancel flags of
running tasks are read every 5 seconds, so a notification sent while a
process was reconnecting is not lost.


Running tasks
-------------

The main loop (`Dispatcher.Run`) runs the workflow manager, then claims
pending tasks until nothing more can be claimed or every worker slot is
busy. `ASCENDER_TASK_WORKERS` (default 4) is the number of tasks one task
process runs at once; the instances' capacity still decides what fits (see
[Capacity and placement](./task_manager_system.md#capacity-and-placement)).

Each claimed task runs in its own goroutine with a context that ends when
the task is canceled or the process shuts down. The run functions are:

| Task | Function | File |
|:-----|:---------|:-----|
| Job | `runJob` | `src/internal/tasks/job.go` |
| Ad hoc command | `runAdHocCommand` | `src/internal/tasks/ad_hoc.go` |
| Project update | `runProjectUpdate` | `src/internal/tasks/project_update.go` |
| Inventory update | `runInventoryUpdate` | `src/internal/tasks/inventory_update.go` |
| System job | `runSystemJob` | `src/internal/tasks/system_job.go` |

Jobs, ad hoc commands, project updates and inventory updates share the
sequence in `baseRun.runTask` (`src/internal/tasks/run_base.go`): run the
task's dependencies, choose where it executes, mark it `running` (and its template
with it), run it, then write the final status, the template's last job, and
send the notifications. A panic in a run is recovered and the task is
finished as `error` with the stack as its traceback; the process carries on.

When a task finishes, its worker slot is freed and the main loop runs again
at once, so a workflow node waiting for it, or a task it was blocking,
starts without waiting for the next poll.

Canceling a task (`POST .../cancel/`) sets its `cancel_flag`. A task that has
not started yet (`new`, `pending` or `waiting`) is marked `canceled` by the
API directly; a running one is stopped by the task process that runs it,
either on the `cancel` notification or at the next cancel-flag poll.

### Shutdown

On `SIGTERM` or `SIGINT`, `ascender-task` stops claiming work and ends the
context of every task it runs:

* Work that runs elsewhere and has already started (on an execution node, in
  a container group pod, or on Kubernetes in the node's own receptor) is
  detached from and left running; the
  [job monitor sweep](./job_monitor_lease.md) of another task process, or of
  this one after it restarts, takes it over. Work that had not received its
  payload yet is stopped and the task re-queued to `pending`, unless it was
  launched with passwords typed in at launch.
* Project updates and inventory updates that run on this node are stopped
  and re-queued.
* Jobs and ad hoc commands that run on this node, and system jobs, are
  stopped and fail with "Task was canceled due to receiving a shutdown
  signal."

The process waits up to `ASCENDER_SHUTDOWN_TIMEOUT` seconds (default 30) for
its tasks to wrap up, then up to 10 seconds for the notifications they sent.


Unified Jobs
------------

"Unified jobs" is the name for all the kinds of jobs Ascender runs. A job's
_task impact_ is the capacity it consumes on the instances it runs on: for a
job or an ad hoc command, the number of hosts it can run on at once (its
host count, at most its forks, 5 when forks is 0) plus one; a system job's is
5. See [Capacity](./capacity.md).

Jobs, ad hoc commands and inventory updates run in an execution environment
in one of these ways (`baseRun.placeOnGroup`):

* On this node, with the container runtime `ASCENDER_CONTAINER_RUNTIME`
  (`podman` when it is installed, otherwise `docker`). The task process runs
  the container itself on a pseudo-terminal (`src/internal/tasks/runner.go`,
  a port of the parts of ansible-runner the old task system used) and
  answers password prompts the way ansible-runner did.
* On an execution node, as a receptor work unit that runs
  `ansible-runner worker` there (`src/internal/tasks/receptor_run.go`).
* In a pod of a container group (`src/internal/tasks/container_group.go`).
  See [Container Groups](./container_groups/README.md).
* On Kubernetes (`IS_K8S`), work for this node goes to the node's own
  receptor as `local` work, because the task container has no container
  runtime of its own.

The private data directory of a run is made under
`ASCENDER_ISOLATION_BASE_PATH` as `ascender_<id>_<random>` and removed when the
run ends if `ASCENDER_CLEANUP_PATHS` is on. Local runs bind-mount it into the
container, so the task process and the container runtime must see it at the
same path.

### Jobs

`runJob` runs a job template's job with `ansible-playbook`. Before the run it
runs the job's [dependencies](./task_manager_system.md#dependencies-update-on-launch),
then syncs its project when needed and copies it into the private data
directory (`syncAndCopyProject`, `src/internal/tasks/project_sync.go`): when
the local checkout under `ASCENDER_PROJECTS_ROOT` lacks the revision or
branch the job needs, or its roles and collections are not installed, a
project update with `launch_type` `sync` runs first, inside the job, while
the job holds the project's lock in this task process. It then writes the
inventory, extra variables, credentials and passwords, and runs the playbook.

For more information, see the [Jobs page](https://docs.ansible.com/ansible-tower/latest/html/userguide/jobs.html)
of the Ansible Tower User Guide.

### Ad hoc commands

`runAdHocCommand` runs a module with `ansible` against the command's
inventory, through the same private data directory, execution environment
and event handling as a job. The SSH user, become method and become user
come from the machine credential; a private key is added to an `ssh-agent`
for the run. Like jobs, ad hoc commands first update the inventory sources
of their inventory that update on launch.

For more information, see the [Running Ad Hoc Commands section](https://docs.ansible.com/ansible-tower/latest/html/userguide/inventories.html#running-ad-hoc-commands)
of the Inventories page of the Ansible Tower User Guide.

### Project updates

`runProjectUpdate` runs the `project_update.yml` playbook (embedded from
`src/internal/tasks/playbooks/`) in the control plane execution environment,
on the control plane instance group. It checks out the project into
`ASCENDER_PROJECTS_ROOT`, installs roles and collections from the project's
requirements files into the project's cache, and records the revision. A
project update holds its project's lock in this task process while it runs. Its output is stored as project update events.

To read more, see the [Projects page](https://docs.ansible.com/ansible-tower/latest/html/userguide/projects.html)
of the Ansible Tower User Guide.

### Inventory updates

`runInventoryUpdate` runs `ansible-inventory` with the source's inventory
plugin in the execution environment and imports the JSON it prints into the
`Host` and `Group` records of the inventory (`src/internal/tasks/inventory_import.go`,
a port of the old `inventory_import` command, run inside the task process).
Credentials are injected as environment variables and files, and the
plugin's configuration is written as a YAML file. An update from a project
(source `scm`) runs that project's update first when the project updates on
launch. The `netbox` source is fetched by the task process itself, with no
execution environment, placed on the control plane like a project update,
and only the import is shared (`src/internal/tasks/inventory_native.go`).

To read more, see the [Inventories documentation](./inventory/README.md).

### System jobs

`runSystemJob` runs a management job inside the task process; there is no
`awx-manage` and no container. The four management commands
(`src/internal/api/system_job_commands.go`) are implemented in Go:

* `cleanup_jobs`: removes jobs, project updates, inventory updates,
  management jobs, ad hoc commands, workflow jobs and notifications older
  than `days` (default 90);
* `cleanup_activitystream`: removes activity stream entries older than
  `days` (default 30);
* `cleanup_sessions`: removes expired browser sessions;
* `cleanup_tokens`: removes expired OAuth 2 access and refresh tokens.

`dry_run` is honored; `batch_size` is accepted and ignored. Each line the
command logs becomes an event of the job. A system job has a task impact of 5
and is placed on the control plane instance group. Only one system job of a
given system job template runs at a time; system jobs of different templates
may run at the same time (see
[Blocking rules](./task_manager_system.md#blocking-rules)).

### Workflow jobs and approvals

Workflow jobs have no process of their own and consume no capacity: the
[workflow manager](./task_manager_system.md#workflow-manager) starts them,
creates the jobs of their nodes and finishes them. Approval nodes create a
`pending` workflow approval that is settled by votes, a denial or its
timeout. See [Workflows](./workflow.md).


Periodic tasks
--------------

| Task | When | Where | Code |
|:-----|:-----|:------|:-----|
| Workflow manager, approval timeouts | every main loop: on a notification, when a task finishes, and at least every 15 seconds | one task process at a time | `processWorkflows` in `workflow.go`, `timeoutApprovals` in `workflow_approvals.go` |
| Claiming pending tasks | every main loop | every task process, one claim at a time | `claimAndRun` in `dispatcher.go` |
| Schedule pass | every 30 seconds | one task process at a time | `runScheduler` in `dispatcher.go`, `SchedulerPass` in `src/internal/api/schedule_write.go` |
| Container group pod reaper | with the schedule pass, at most once a minute | the task process that ran the pass | `reapPods` in `container_group.go` |
| Receptor work unit reaper | with the schedule pass, at most once a minute | the task process that ran the pass | `reapWorkUnits` in `receptor_run.go` |
| Cluster heartbeat | every 60 seconds | every task process | `runHeartbeat` in `heartbeat.go` |
| Cancel flag poll | every 5 seconds | every task process, for the tasks it runs | `runCancelPoll` in `dispatcher.go` |
| Job monitor sweep | every 30 seconds | every task process | `runMonitorSweep` in `monitor.go` |
| Removal of deprovisioned instances | every minute | every task process | `runDeprovisionReaper` in `dispatcher.go` |
| Cleanup of job folders and images | 2 minutes after start, then every 3 hours; not on Kubernetes | every task process for its node; one for the execution nodes | `runCleanupPaths` in `cleanup_paths.go`, `cleanup_images.go`, `cleanup_remote.go` |
| Host metric cleanup and monthly summary | offered a minute after start, then every 3.5 and 4 hours | every task process | `runHostMetricTasks` in `host_metrics.go` |
| Receptor configuration | every 60 seconds, on Kubernetes only | every task process | `runReceptorConfig` in `receptor_config.go` |
| Subsystem metrics | every 3 seconds | every task process | `publishMetrics` in `subsystem_metrics.go` |
| Expired session purge | every 5 minutes | every task process | `src/cmd/ascender-task/main.go` |

Files without a directory are in `src/internal/tasks/`.

### Schedules

Jobs can be launched automatically on a schedule (such as daily, or every
Monday at 9AM). Every 30 seconds one task process, holding the scheduler's
advisory lock, recomputes the schedules that fell behind and launches the
ones that came due since the previous pass with `launch_type` `scheduled`.
Schedules of job templates, workflow job templates, projects, inventory
sources and system job templates are launched. `DISABLE_ALL_SCHEDULES` (set
in the settings file) turns the launches off. See [Schedules](./schedules.md).

### Heartbeats, capacity and job reaping

Every 60 seconds each task process runs the cluster heartbeat
(`clusterNodeHeartbeat` in `src/internal/tasks/heartbeat.go`):

1. It health checks its own node: CPU count, memory and version, from which
   the node's capacity is computed, and `last_seen`.
2. If its node has a receptor, it reads the mesh (one task process at a
   time): execution and hop nodes get their `last_seen` from their receptor
   advertisements, links being added become established, and an execution
   node that rejoins the mesh, or that has no capacity and was last checked
   30 minutes ago or more, gets a health check (`worker_info` over the
   mesh). A health check requested through the API arrives as a
   `health_check` notification.
3. It looks for lost nodes: a node whose `last_seen` is older than two
   heartbeats (120 seconds; an execution or hop node gets 60 seconds more).
   The tasks running on a lost node, and the waiting tasks it controls, fail
   with "Job reaped due to instance shutdown". When the lost node is a
   control or hybrid node, its running tasks that hold a job monitor lease
   are left to the job monitor sweep instead, since their work may still be
   running elsewhere. A lost node is marked
   `unavailable` with no capacity, so no new work is placed on it; with
   `ASCENDER_AUTO_DEPROVISION_INSTANCES` (set in the settings file) a lost
   control node is removed instead.
4. It reaps its own orphans (`reapOrphans`): tasks this node runs or
   controls that are `running`, or `waiting` and untouched for six minutes,
   but that no goroutine of this process is running, fail with "Task was
   marked as running but was not present in the job queue, so it has been
   marked as failed."

A node that finds its own record gone (removed while it was out of reach)
registers again when `ASCENDER_AUTO_DEPROVISION_INSTANCES` is set.

### Reaping receptor work units and pods

Every job that runs on an execution node, or on Kubernetes, is a receptor
work unit. Receptor keeps the unit's `stdin`, `stdout` and `status` files in a
directory named after its randomly generated ID (_e.g._ `qLL2JFNT`), which is
also stored on the job as `work_unit_id`. The task releases the unit
(`work release`) when the job ends. If the release fails, or the task
process stopped while the job ran, the unit stays.

The work unit reaper (`reapWorkUnits`) lists the units of this node's
receptor and cancels and releases those that belong to tasks that are no
longer active, along with finished health check and cleanup units.

The pod reaper (`reapPods`) deletes the pods of container group jobs that
finished more than `K8S_POD_REAPER_GRACE_PERIOD` seconds ago (an environment
variable, default 60). It only considers pods Ascender created.

Turning off the `RECEPTOR_RELEASE_WORK` setting (Settings > Troubleshooting) keeps
finished work units and the pods of container group jobs for debugging:
units are not released, pods of jobs that ran to the end are not deleted,
and both reapers do nothing until it is turned back on.

### Cleanup of job folders and images

A private data directory is removed when its run ends, but one left by a
crash or a kill stays until the periodic cleanup (`cleanupImagesAndFiles` in
`src/internal/tasks/cleanup_paths.go`): `ascender_*_*` (and the former
`awx_*_*`) folders under `ASCENDER_ISOLATION_BASE_PATH` older than 60 minutes
are removed, except those of tasks this node still runs. Dangling images are
pruned with the container runtime. One control node also has each execution
node run the same cleanup with `ansible-runner worker cleanup` over the mesh.
No folders are removed when `ASCENDER_CLEANUP_PATHS` is off, and nothing is
cleaned on Kubernetes.

When no execution environment uses an image any more, the API sends a
`remove_images` notification and every task process removes the image from
its node; the execution nodes are told to remove it too.

### Host metrics

`cleanup_host_metrics` soft-deletes the host metrics of hosts not automated
for 12 months and removes those soft-deleted more than 36 months ago; it runs
when 30 days have passed since its last run (`CLEANUP_HOST_METRICS_LAST_TS`).
The monthly host metric summary is rebuilt when 7 days have passed since its
last run (`HOST_METRIC_SUMMARY_TASK_LAST_TS`). The intervals and thresholds
are fixed.


Work done in the request
------------------------

Some work the old implementation sent to a background task is done by
Ascender inside the request, before it answers:

* **Inventory computed fields.** The counters of an inventory (`total_hosts`,
  `hosts_with_active_failures` and the rest) are recomputed in the same
  transaction as the change to its hosts, groups or sources
  (`models.UpdateInventoryComputedFields`), and by the task process after an
  inventory import and after a playbook's final statistics.
* **Inventory deletion.** The inventory is deleted in the request. The API
  still answers `202 Accepted`, and the websocket still sees the
  `pending_deletion` and `deleted` statuses.
* **Copies.** `POST .../copy/` copies the object and its related objects in
  the request; an inventory's hosts and groups are copied in the same
  transaction.
* **Notifications.** Sent in a background goroutine of whichever process
  saw the status change (`SendJobNotifications` in
  `src/internal/api/notifications_send.go`): `running` for start
  notifications, then `succeeded` or `failed` when the job finishes. See
  [Notification System Overview](./notification_system.md).

Other old background tasks have no counterpart:

* **Setting changes.** Each process keeps the settings from `conf_setting`
  in memory and reloads them when they are more than 15 seconds old
  (`src/internal/settings/settings.go`). A change made through
  `/api/v2/settings/` reaches the other processes within that time; nothing
  is broadcast.
* **Rebuilding smart inventory memberships.** A job that starts against a
  smart inventory records the hosts its `host_filter` selects in
  `main_smartinventorymembership`, as the old job run did
  (`updateSmartMemberships` in `src/internal/tasks/smart_membership.go`);
  `/api/v2/hosts/N/smart_inventories/` reads that record. The old rebuild of
  every smart inventory's record on each host or smart inventory save, which
  `ASCENDER_REBUILD_SMART_MEMBERSHIP` turned on, has no counterpart, and the
  setting is not read.
* **Deleting project files.** Not implemented: deleting a project leaves its
  checkout under `ASCENDER_PROJECTS_ROOT` on disk.
* **Purging stdout files.** Not needed: stdout downloads are streamed from
  the database and leave no files behind.
* **SQL profiling.** Not implemented. `ASCENDER_SQL_DEBUG` reports the number
  of statements and their time for each API request in `ascender-web`.


Debugging
---------

The task process logs to standard output; `ASCENDER_LOG_LEVEL` sets the
level (`debug`, `info`, `warn` or `error`). Each task logs when it starts and
finishes, with its ID. The steps of a run (claimed, waiting, the nodes
chosen, the work unit) are recorded on the `job_lifecycle` logger, which is
written to the same output (at `info`) and which an
external logging destination can take (see
[Logging Integration](./logging_integration.md#in-the-process-output)).

There are no commands to list a dispatcher's workers or running tasks. The
tasks a node runs are the ones whose `controller_node` is that node:

```
GET /api/v2/unified_jobs/?status__in=waiting,running&controller_node=<hostname>
```
