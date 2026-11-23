# Task Manager System Overview

The task manager decides when a launched task starts and where it runs.
In Ascender it is part of the dispatcher of every `ascender-task` process
(`src/internal/tasks/dispatcher.go`), and does three things:

1. **Claiming** pending tasks: a task process takes the oldest pending task
   that is not blocked, chooses the instance group and nodes it runs on, and
   starts it if there is capacity.
2. **Dependencies**: a task whose project or inventory sources update on
   launch runs those updates first. This is done by the task's own run once
   it has been claimed, not by a separate dependency manager.
3. **The workflow manager** starts workflow jobs, creates the jobs of their
   nodes as their parents finish, and finishes them.

How the dispatcher runs the tasks it claims, and the other background work
of `ascender-task`, is described in [Background Tasks](./tasks.md).

When choosing a task to start, the considerations are:

1. Creation order: pending tasks are considered oldest first (by ID).
2. Blocking: a task does not start while certain other tasks are active
   (see [Blocking rules](#blocking-rules)).
3. Capacity: of the instances and instance groups the task can run on (see
   [Capacity and placement](#capacity-and-placement)).
4. Worker slots: a task process runs at most `ASCENDER_TASK_WORKERS` tasks
   at once (default 4).


## The main loop

Each task process runs a loop (`Dispatcher.Run`) that, on every turn:

1. runs the workflow manager (`processWorkflows`), then
2. claims pending tasks (`claimAndRun`) until none can be claimed or every
   worker slot is busy.

A turn starts when:

* the API creates a task and notifies the `ascender_dispatch` channel;
* a task this process ran finishes, which may unblock another task, free
  capacity, or let a workflow node run;
* the schedule pass has launched its due schedules;
* 15 seconds have passed since the last turn.

Each trigger alone would be enough for the system to work. The notifications
make tasks start without delay; the periodic turn is the fail-safe for
anything that changes the scheduling considerations without a notification
(a node added to the cluster, a task finished by another task process).


## Claiming a task

A claim (`claimAndPlace`) is one `UPDATE` that moves the oldest claimable
`pending` row of `main_unifiedjob` to `waiting`, selecting it with
`FOR UPDATE SKIP LOCKED`. Jobs, ad hoc commands, project updates, inventory
updates and system jobs are claimed; workflow jobs and workflow approvals are
handled by the workflow manager.

A claimable task:

* is not blocked by an active task (see [Blocking rules](#blocking-rules));
* was not found to lack capacity since the last time a task of this process
  finished, or in the last 15 seconds.

The claimed task is then placed: its instance group, execution node and
controller node are chosen (see [Capacity and placement](#capacity-and-placement)).
A task that does not fit goes back to `pending`, and the claim moves on to
the next one, so a large task waiting for room does not hold back smaller
ones behind it.

A placed task goes through the pre-start check (`preStartCheck` in
`src/internal/tasks/prestart.go`): every credential must provide its
credential type's required fields (an input source counts), and the
passwords its credentials prompt for must have been given at launch.
A task that fails the check fails at once with the explanation, followed by
"Task failed pre-start check."

The task is then started in a goroutine of the task process. It stays
`waiting` while its [dependencies](#dependencies-update-on-launch) run, and
becomes `running` when its own work starts.

### Several task processes

Every task process claims tasks, and only for its own node. The claim and
the placement run under the PostgreSQL advisory lock `task_manager_lock`, so
that two task processes see each other's claims: without it, both could
start a job of the same template, or both could fill the last room in an
instance group. The lock is waited for and held only for the few statements
of one claim, each committed on its own.

A task that one task process returns to `pending` because it does not fit
there (its instance groups contain no node this process can use, say) is
claimed by a task process whose node it fits.


## Blocking rules

The rules are those of the old task manager's dependency graph. They are
part of the claim's `UPDATE` (`blockerSQL` and `claimAndPlace` in
`src/internal/tasks/dispatcher.go`), read from the database on every claim.
A pending task is not claimed while a task that blocks it is `waiting` or
`running`:

| Pending task | Blocked by |
|:-------------|:-----------|
| Project update | an update of the same project |
| Inventory update | an update of the same inventory source |
| System job | any other system job, of whatever system job template |
| Job | an update of the job's project; an ad hoc command on the job's inventory; an inventory update of the job's inventory, unless the inventory allows jobs while syncing (`allow_jobs_while_syncing`, see [Allow jobs while syncing](./inventory/allow_jobs_while_syncing.md)); a job of the same job template, unless the job allows simultaneous runs (`allow_simultaneous`) |
| Ad hoc command | another ad hoc command on its inventory; an inventory update of its inventory, unless the inventory allows jobs while syncing |

An inventory update counts for the inventory it was run for, or for its
source's inventory when it has none. Project updates of `launch_type`
`sync` (a job bringing its project checkout up to date, see
[Jobs](./tasks.md#jobs)) block nothing, and are never claimed: they run
inside the job that needs them. A sliced or federated workflow job does not
block the jobs of its job template; its own jobs, which allow simultaneous
runs, block the other jobs of the template while they run.

A blocked task that is at least 30 seconds old gets the explanation
"waiting for `<type>`-`<id>` to finish", naming the task that blocks it
(`explainBlocked`), for example "waiting for adhoccommand-12 to finish" or
"waiting for inventoryupdate-40 to finish". The types are `projectupdate`,
`inventoryupdate`, `job`, `systemjob`, `adhoccommand` and `workflowjob`.
When several tasks block it, the one named is chosen in the order of the
table (for a job: its project's update, then an ad hoc command, then an
inventory update, then a job of its template), and the oldest of that kind.
The explanation is written on every turn of the main loop while the task is
blocked. A task that is claimed and placed drops it, like the capacity
explanation below, so a running or finished task does not still say why it
waited; a task that then fails its pre-start check gets that check's
explanation instead.

Workflow jobs are not claimed; the workflow manager starts them
(`startWorkflowJob` in `src/internal/tasks/workflow.go`). A pending workflow
job whose `allow_simultaneous` is off stays pending while another job of its
template is `waiting` or `running`; for a sliced or federated workflow job,
whose template is a job template, a job of that template blocks it too. It
gets the same explanation, naming a workflow job of its template, or else a
job of its job template (`explainBlockedWorkflow` in
`src/internal/tasks/workflow_blocked.go`), which it drops when it starts.
Pending workflow jobs are taken in id order, so the oldest starts first.

Groups of blocked tasks therefore run in the order they were created.

The old task manager also blocked a task while one of its `dependent_jobs`
was active. In Ascender a task's dependencies are created and waited for by
the task's own run once it has been claimed (see below), so a pending task
has none to wait for.


## Dependencies (update on launch)

Projects and inventory sources marked **update on launch** are updated when a
task that uses them runs. The rules, with the cache feature
(`scm_update_cache_timeout`, `update_cache_timeout`), are:

* A job's project, when it updates on launch, gets a `check` project update
  first (`projectUpdateDependency` in `src/internal/tasks/run_base.go`),
  unless the project's latest `check` update succeeded and finished within
  the project's cache timeout.
* Each inventory source of a job's or an ad hoc command's inventory that
  updates on launch gets an inventory update first
  (`runInventoryDependencies` in `src/internal/tasks/job.go`), unless the
  source's latest update succeeded and finished within the source's cache
  timeout.
* An inventory update from a project (source `scm`) runs the project's
  update first when that project updates on launch
  (`invUpdateRun.runDependencies` in `src/internal/tasks/inventory_update.go`).
* A latest update that failed, errored or was canceled is never reused.
* A latest update that is still active is waited for instead of starting
  another. An inventory sync under way is not waited for when the inventory
  allows jobs while syncing and the source has synced successfully before.

Dependencies are run by the task that needs them, after it has been claimed
and while it is `waiting` (`runTask` in `src/internal/tasks/run_base.go`):

1. The dependency is created with `launch_type` `dependency` and linked to
   the task through `dependent_jobs`. A project update is run inline, in the
   task's worker slot, with this node as its controller (project updates
   always run on the controller in the control plane). An inventory update
   is created `pending`, with the source's preferred instance groups (see
   [Instance Groups on Inventory Sources](./inventory_source_instance_groups.md)),
   like any other update of the source.
2. A dependency that already exists is linked through `dependent_jobs` too.
   While a dependency is `pending`, the waiting task tries to take it and run
   it inline itself, since every worker slot could be held by tasks waiting
   for pending dependencies; otherwise its status is checked every 2 seconds.
   An inventory update is taken only once it is placed, under the task
   manager lock, as a claim would place it (`claimPlacedDependency`): in its
   preferred groups with room, or else in the waiting task's own place when
   that task's group is one of its preferred groups, as the task holds that
   capacity without using it until its dependencies are done. Otherwise it
   stays `pending`, and is tried again or claimed by a free worker.
3. The task's `dependencies_processed` is set, so a task that is re-queued
   does not run its dependencies again.
4. If a dependency does not succeed, the task fails with the explanation
   `Previous Task Failed: {"job_type": "project_update", "job_name": "...", "job_id": "..."}`
   (or `inventory_update`). A canceled project update dependency cancels the
   task; a canceled inventory update dependency fails it unless the task was
   itself canceled.

> **Note.** In the previous implementation a task stayed `pending` while its
> dependencies ran. In Ascender it is `waiting`, it has been placed, and it
> holds a worker slot of its task process for the duration.

Separately from update on launch, a job whose project checkout lacks the
revision it needs syncs the project during its run with a project update of
`launch_type` `sync` (see [Jobs](./tasks.md#jobs)). That update is not a
dependency.

For an inventory source of a source control project, see
[SCM inventory](./inventory/scm_inventory.md).


## Capacity and placement

The placement (`placeTask` in `src/internal/tasks/capacity.go`) is the port of
the old task manager's capacity rules. It reads, for every claim, the ready
and enabled instances, the instance groups, and the capacity that the
`waiting` and `running` tasks consume. A task consumes its task impact on its
execution node, and a control impact of 1 on its controller node. See
[Capacity](./capacity.md) for how instance capacity and task impact are
computed.

1. **Controller.** A task needs a control or hybrid instance of the control
   plane instance group (`DEFAULT_CONTROL_PLANE_QUEUE_NAME`, `controlplane`
   by default) with room for the control impact. The task process controls
   work on its own node only, so this is the claiming node. If it has no
   room, the task stays pending.
2. **Project updates and system jobs** run on the controller itself: they
   need room for their impact plus the control impact there, and the control
   plane group must be within its limits.
3. **Other tasks** go through the task's preferred instance groups in order
   (recorded at launch in `preferred_instance_groups_cache`, from the
   template, inventory and organization; see [Clustering](./clustering.md)),
   or the `default` group if none were recorded. The first group that can
   take the task wins:
   * The group's limits must allow one more task: `max_concurrent_jobs` and
     `max_forks` (0 for no limit).
   * For a container group, the task runs in a pod; for a container group
     behind a mesh node, the mesh node must be ready and this node must have
     a receptor to reach it.
   * Otherwise the execution node is the group's instance with the most
     capacity left after the task's impact (fewer running tasks on a tie),
     among the instances this task process can use: its own node when it is
     a hybrid node, and execution nodes when this node has a receptor to
     reach the mesh. A hybrid instance also needs room for the control
     impact. If no instance has room, the largest idle instance is chosen,
     whatever the task's impact, so that a task larger than any instance can
     still run. A task on a hybrid execution node is controlled by that node.
4. A task that fits nowhere returns to `pending`. From 30 seconds after it
   was created, its explanation becomes "This job is not ready to start
   because there is not enough available capacity." A task that is placed
   drops any explanation it got while pending.

The chosen group, nodes and a new task ID (`celery_task_id`, which fences the
task's [monitor lease](./job_monitor_lease.md) and its final write) are
stored on the task.

> **Note.** In the previous implementation one task manager placed tasks for
> the whole cluster, and could make any control node the controller. In
> Ascender a task is controlled by the node whose task process claimed it.


## Workflow manager

The workflow manager (`processWorkflows` in `src/internal/tasks/workflow.go`,
a port of `dag_workflow.py` and the old `WorkflowManager`) runs at the start
of every turn of the main loop, in one task process at a time: it takes the
advisory lock `workflow_manager_lock` without waiting, and a task process
that cannot get it skips the pass. On each pass it:

1. settles workflow approvals whose timeout has expired, approving or
   failing them according to their `on_timeout` (`timeoutApprovals` in
   `src/internal/tasks/workflow_approvals.go`);
2. moves every `pending` workflow job to `running`; workflow jobs consume no
   capacity and have no execution node;
3. for every `running` workflow job, builds its graph from its nodes, their
   edges and the state of their jobs, then:
   * if the workflow job is being canceled, marks its unstarted nodes as do
     not run, cancels its nodes' jobs, and finishes it as `canceled` once
     they have all ended;
   * marks the nodes that can no longer run as do not run;
   * when every node has settled, finishes the workflow job as `successful`,
     or `failed` with "No error handling paths found, marking workflow as
     failed" when a failed node has no error handling path;
   * otherwise creates the jobs of the nodes that are ready: their relevant
     parents have finished, following the success, failure and always edges
     and their conditions, the convergence rules, and retries (see
     [Automatic node retries](./workflow.md#automatic-node-retries)).

The jobs of job template nodes are created through
`api.Server.SpawnWorkflowNodeJob` (`src/internal/api/workflow_spawn.go`),
which applies the node's and the workflow's prompts with the same rules as a
launch. Project, inventory source, nested workflow and approval nodes create
their job directly. The jobs, project updates and inventory updates created
for nodes are then claimed like any other pending task; nested workflow jobs
are picked up by the next pass. See [Workflows](./workflow.md).


## Locks

The cluster-wide passes use PostgreSQL session advisory locks, taken on a
dedicated connection (`advisoryLocked` in `src/internal/tasks/dispatcher.go`):

| Lock | Taken by | When held |
|:-----|:---------|:----------|
| `task_manager_lock` | the claim and placement of a task | waited for |
| `workflow_manager_lock` | the workflow manager | the pass is skipped |
| `awx_periodic_scheduler_lock` | the schedule pass, and the schedule sync at startup | the pass is skipped; the sync waits |
| `inspect_execution_and_hop_nodes_lock` | the heartbeat's reading of the mesh | skipped |

The lock keys are derived from the same names the previous Python
implementation used, so its task processes and Ascender's do not both run a
pass against the same database at the same time.

There is no time limit on a pass. The old managers ran each pass in one
database transaction and were killed after a few minutes; Ascender's passes
commit each step as they go, so a pass that stops halfway keeps the
progress it committed. A task left `waiting` by a task process that stopped
between a claim and its start is failed by the reapers (see
[Heartbeats, capacity and job reaping](./tasks.md#heartbeats-capacity-and-job-reaping)).


## Job lifecycle

| Status | Meaning |
|:-------|:--------|
| `pending` | The task has been launched and not claimed: no task process has looked at it yet, it is blocked by another task, or there is not enough capacity. |
| `waiting` | A task process has claimed and placed the task. Its dependencies run while it is waiting. |
| `running` | The task's work is running. |
| `successful` | The task finished, with return code 0 for `ansible-playbook`. |
| `failed` | The task finished with another return code, or timed out ("Job terminated due to timeout"), failed its pre-start check, had a dependency fail, was stopped by a shutdown, or was reaped. |
| `error` | The task could not run: a system failure, with the explanation or traceback on the job. |
| `canceled` | The task was canceled. |
