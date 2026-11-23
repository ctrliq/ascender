# Surviving a controller restart: the job monitor lease

A running job's output is read by one task in one `ascender-task` process.
When the job runs somewhere else (a work unit on an execution node, or a pod
in a container group), the work outlives that process. The job monitor lease
lets any control node pick up reading the output when the process that
started the job stops or dies, so restarting or replacing a control node
(on Kubernetes, every upgrade, settings change and eviction) does not fail
the jobs it was reading.

The implementation is in `src/internal/tasks/monitor.go` (the lease, the
sweep, the claim), `src/internal/tasks/monitor_hold.go` (reading with a
lease, shutdown handling) and `src/internal/tasks/monitor_resume.go`
(resuming). Pod logs are read by `src/internal/tasks/pod_log.go`.

## Which runs are covered

| Run | Lease |
|---|---|
| Job, ad hoc command or inventory update on an execution node | yes |
| Job, ad hoc command or inventory update in a container group (directly, or behind a mesh node) | yes |
| Project update as a `local` work unit (on Kubernetes) | yes, but it is never resumed: on shutdown it is stopped and re-queued |
| Any run on the `ascender-task`'s own node through the container runtime | no |
| System jobs (run inside `ascender-task`) and workflow jobs | no |

A local container run cannot outlive the process that started it. When
`ascender-task` stops, the container is killed: a playbook job or ad hoc
command fails with "Task was canceled due to receiving a shutdown signal.",
and an inventory or project update is re-queued (unless it is a project sync
run inline for a job, or it was launched with passwords; see below). A run
interrupted before its container or worker started (during an image pull,
the callback plugin probe, or a credential lookup) is re-queued as well.

> **Difference from the old application.** The old application ran local
> work on a hybrid node as a receptor `local` work unit and could leave it
> running across a restart. Ascender does not, so local playbook jobs fail
> on a restart.

## How it works

**The lease.** One row per monitored job in `main_jobmonitorlease`. The task
takes the lease (`leaseStart`) as soon as the work is handed over: for a pod,
right after the pod is created, with the pod's name and namespace; for a work
unit, right after it is submitted and its id stored in `work_unit_id`. The
task renews the lease every `JOB_MONITOR_RENEW_SECONDS` while the pod starts
and while the output is read. When the worker reports `starting`, which
means it has received its payload, `worker_started` is set on the row. The
lease covers reading the output and nothing after it: it is removed as soon
as the output has been read, before the post-run hooks (fact cache,
inventory import), which can take longer than a lease lasts without
renewal. The job's lifecycle log records `monitor_leased` and, for a pod,
`pod_recorded`.

**Detach, never cancel, on shutdown.** When `ascender-task` receives SIGTERM,
each task's context ends, as it does on a cancel. The job row's
`cancel_flag`, which the API commits before it notifies the task, tells the
two apart. On a shutdown (`onShutdown` in `monitor_hold.go`):

- if the worker has its payload, or the read is itself a resume, the task
  closes its stream, leaves the work unit or pod running, and expires its
  lease at once (`monitor_detached` in the lifecycle log);
- if it has not, the task stops the work (cancels the unit, deletes the pod)
  and re-queues the job to `pending`, since nothing has run yet; if the work
  cannot be stopped, the task detaches instead, and if the job cannot be
  re-queued (see below) it fails;
- a project update is stopped and re-queued even when it has started. It
  works in the project's directory under an exclusive lock held by its task,
  and is not left running without that lock. A project sync run inline for a
  job is only stopped: the job that runs it is stopping too.

`ascender-task` waits up to `ASCENDER_SHUTDOWN_TIMEOUT` seconds for its tasks
to detach, re-queue or stop before it exits.

**Re-queueing.** A re-queued job (`requeueJob`) goes back to `pending` with
its controller, execution node, `work_unit_id`, task id and start time
cleared, and the explanation "The job was re-queued because ...". It keeps
its id and runs again from the start, numbering its events from 1. The
events its abandoned attempt saved are deleted when it is re-queued, and
again when the new attempt starts running, in case some were still on their
way. A job launched with passwords typed in at launch is failed instead of
re-queued: those passwords are removed from the job as it starts, and it
could not start again without them (`canRequeue`).

**The sweep.** `sweepJobMonitors` runs in every `ascender-task` at startup
and every 30 seconds after. It first deletes expired leases of jobs that are
no longer running. Then, only on an instance that is `ready` and of type
`control` or `hybrid`, it looks at up to `JOB_MONITOR_SWEEP_BATCH` expired
leases of running jobs, this node's own first, and decides which to claim:

- A unit that runs in a control or hybrid node's own receptor (the
  Kubernetes `local` work of a project update) can only be read through that
  node. While that node is `ready`, or `unavailable` but not yet declared
  lost, only it claims the job.
- A node always takes back the jobs it controls: they already count against
  its capacity.
- Any other job is taken only by an enabled node with control capacity to
  spare, because a resumed job occupies the node for the rest of its run. The
  rest is left to a peer or a later sweep.

Instance heartbeats only decide the first rule. An expired lease is the one
reason to read a job elsewhere.

A claim (`claimJob`) locks the lease row, checks that the lease is still
expired, and moves the job's `celery_task_id` to a new task id with a
compare-and-set (so two nodes cannot both take a job), setting this node as
the job's `controller_node`. It then extends the lease and starts
`resumeJob` under the new task id.

**Resuming.** `planResume` decides what to do with a claimed job from where
its output survived:

| The job ran | Plan |
|---|---|
| in a container group pod | Look the pod up by the name on the lease, or by the labels `ansible-awx=<INSTALL_UUID>,ansible-awx-job-id=<id>` (the newest pod wins). A finished pod's log is read once; a running pod's log is followed when the worker had started or the log has output. |
| through a work unit this node's receptor knows | Read the unit with `work results` from the start. |
| through a unit on an execution node or a mesh hop node | `work adopt` the unit from that node, which makes this node's receptor track it, then read it. The JSON form of the command is sent directly (`Adopt` in `src/internal/receptor/receptor.go`). |
| through a unit on a control or hybrid node that is gone | The output is lost: the job is re-queued if nothing ran, or if it is an inventory or project update, which repeat safely; failed otherwise. |

The pod log is read with the Kubernetes log API with timestamps. A
connection that drops, or stays silent for `JOB_MONITOR_STREAM_IDLE_SECONDS`,
is reopened from the last line's timestamp, skipping the lines it repeats.

Other outcomes of the plan:

- A pod that is still `Pending` is waited for, up to
  `ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT` from its creation, after
  which it is deleted and the job fails. These waits do not count as
  deferrals.
- A running pod that has written nothing, and whose container started more
  than `JOB_MONITOR_WEDGE_SECONDS` ago, never received its payload: it is
  deleted and the job re-queued.
- A pod that no longer exists fails the job if the worker had started, and
  re-queues it otherwise.
- A job with no `work_unit_id` (never handed to receptor) is re-queued.
- A project update is never resumed: its unit is cancelled and released and
  the update re-queued, or failed if it is an inline sync.

Only jobs, ad hoc commands and inventory updates are resumed
(`prepareResume`).

**Reading the output again.** A resumed read builds a new private data
directory for the worker's artifacts and points `AWX_PRIVATE_DATA_DIR` in
the job's stored environment at it. It loads the counters of the events
already saved and replays the stream from the beginning through the same
event sink as a launch, skipping those counters. As a second guard, every
event table has a unique constraint on `(<job>, job_created, counter)` and
events are inserted with `ON CONFLICT DO NOTHING`, so a duplicate is dropped.
Host summaries and the stats wrap-up are written only when the
`playbook_on_stats` event is saved for the first time. Replaying from the
start is deliberate: it also recovers events the lost task had received but
not yet written.

The replayed `starting` status does not overwrite the job's stored `job_env`:
the launch stored it with the values its credentials injected masked, and a
resumed read cannot reproduce that masking. If the launch never stored an
environment, the resumed read stores one with every value a credential could
have set hidden. The job's explanation gets "Output monitoring was resumed on
<node> after the node reading it stopped."

**Deferring.** What a resume cannot settle now, a later sweep settles. The
lease is put off by `JOB_MONITOR_RETRY_SECONDS` (`leaseDefer`), and the job
is failed once it has been put off `JOB_MONITOR_MAX_DEFERRALS` times. A
resume defers when:

- the output is not reachable yet (an execution node that is unavailable but
  not yet declared lost may still be running the unit; a pod that has not
  written output yet);
- reading fails (the Kubernetes API or receptor is unreachable, or `work
  adopt` is refused);
- getting ready fails;
- the stream ends without a result while the pod or unit is still running;
- work that should be stopped before a re-queue or failure could not be
  stopped.

A stream that ends without a result once the work is done takes the job's
status from the pod's exit code or the unit's state, and says so in the
explanation. A unit whose output stops arriving after it finished, short of
the unit's stdout size, is abandoned after `JOB_MONITOR_STREAM_IDLE_SECONDS`
and the job's status taken from the unit.

**Finishing.** Once the output has been read, the lease is removed and the
unit released or the pod deleted (unless the `RECEPTOR_RELEASE_WORK`
setting is off). The job then finishes as the launch would
have: the post-run hooks run against the resumed run's artifacts (the fact
cache only if the worker's artifacts arrived; artifacts; the inventory
import), the final status is written and notifications are sent. `finished`
is taken from the `playbook_on_stats` event's timestamp, clamped between the
job's start and now, so a job that ended while nobody was watching is not
stamped minutes late.

**Fencing.** The final status is written with
`WHERE celery_task_id = <owner>` (`finishUnified` in
`src/internal/tasks/run_base.go`); a task whose job was taken over writes
nothing and logs "owned by another task now". A launch whose lease was taken
over (say its node was partitioned from the database) finds out at its next
renewal (`errLeaseLost`), drops its stream, and neither finalizes nor
releases anything; a project update also stops its work as it drops the
stream, since it is never left running without its task's lock on the
project.

The lease row is what a claim and a reader that is done with the job
serialize on. A claim locks the row and checks under the lock that the lease
is still expired before it moves the task id. Retiring the lease
(`leaseRetire`) locks the same row before it checks that its task still owns
the job, and the pod or work unit is released only after the retirement
succeeded. So a reader finishing just as a claim lands can neither remove the
claimer's lease nor release the work from under it, and a claim cannot take a
job whose reader has just finished with it. Renewing, expiring a lease on
detach, and deferring are limited to the task that owns the job as well.

## Cancelling and reaping

- A cancel sets `cancel_flag` and notifies every `ascender-task` on the
  `ascender_dispatch` channel; the process running or resuming the job stops
  it. Each process also checks the cancel flags of its running tasks every
  5 seconds.
- A job cancelled while nobody holds its lease keeps `running` with
  `cancel_flag` set until a sweep claims it. The resume then stops the work
  where the plan found it (cancels and releases the unit, deletes the pod)
  and marks the job canceled, without post-run hooks (`cancelUnmonitored`).
  The old application marked such a job canceled at once.
- Jobs without a lease are reaped as before. At startup, `ascender-task`
  fails the running jobs it controlled, except those with a lease, which it
  leaves to the sweep. The heartbeat's reapers leave a leased job to the
  sweep when the node being reaped is a control or hybrid node. A leased job
  whose execution or hop node is lost is reaped unless that node was also
  its controller.
- Workflow jobs never have a lease.

## Settings

These are environment variables of `ascender-task`, read when used; they are
not API settings. Values must be positive integers (the two counts may be
0); anything else falls back to the default.

| Variable | Default | Meaning |
|---|---|---|
| `JOB_MONITOR_LEASE_SECONDS` | 60 | How long a lease holds without a renewal; a crash is noticed within this |
| `JOB_MONITOR_RENEW_SECONDS` | 10 | How often a reading task renews its lease |
| `JOB_MONITOR_SWEEP_BATCH` | 50 | How many expired leases one sweep looks at, at most |
| `JOB_MONITOR_RETRY_SECONDS` | 30 | How long a resume puts a job off when its output is not reachable yet or could not be read |
| `JOB_MONITOR_MAX_DEFERRALS` | 120 | How many such waits before the job is failed |
| `JOB_MONITOR_WEDGE_SECONDS` | 60 | A silent, running pod whose container started longer ago than this never received its payload: it is deleted and its job re-queued |
| `JOB_MONITOR_STREAM_IDLE_SECONDS` | 120 | A work unit stream that waits this long for bytes after its unit finished, short of the unit's stdout size, is abandoned and the job's result taken from the unit; a pod log connection silent this long is reopened |
| `ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT` | `2h` | How long a resume waits for a pending pod (a Go duration such as `90m`); also passed to receptor as `pod_pending_timeout` for pods behind a mesh node |
| `ASCENDER_SHUTDOWN_TIMEOUT` | 30 | How many seconds a stopping `ascender-task` waits for its tasks to detach, re-queue or stop |

## Recovery times

- Graceful stop of a control node: the next sweep on a live node, at most
  30 seconds.
- Crash of a control node: lease expiry plus the next sweep, about 60 to 90
  seconds.
- During the gap the automation keeps running; only the saving of its events
  waits.

## Kubernetes deployment notes

A task pod does not have to stay up until its jobs finish to keep them alive
across a rollout: it detaches from them within seconds of being asked to
stop, so a long termination grace period for that purpose is not needed.

`ascender-task` talks to the Kubernetes API itself for container group pods.
A launch creates the pod and attaches to it (`pods` create, `pods/attach`);
a resume reads the pod's log (`get` on `pods/log`), finds the pod by label
when its name was not recorded (`list` on `pods`), and deletes it. The service
account or the container group's credential needs all of these for resuming
to work.

## Database

The lease table (`main_jobmonitorlease`) and the unique event counter
constraints came with the old application's migrations `0232_event_counter_unique`
and `0233_job_monitor_lease`. Both are part of Ascender's schema baseline: a
new database gets them, and a database the old application migrated must
have reached `0233` before Ascender will use it.

## Limits

- The kubelet serves only the current log file of a container through the
  API. A job that writes more than the node's `containerLogMaxSize` (10 MiB
  by default) while nobody is reading loses the events in between that were
  not saved before its controller was lost; the final artifacts are written
  last and are in the current file. A gap shows up as missing counters in the
  job's events.
- Local container runs are not covered (see above).
- The post-run hooks are not resumed. If the task running them dies, the job
  no longer has a lease and is failed by the reapers.
- Resuming from an execution node or a mesh hop node depends on receptor's
  `work adopt` command (ansible/receptor PR 1564). If the node's receptor
  refuses it, the job is deferred until its deferrals run out and then
  failed.
- The sweep, claim and resume paths have no automated tests in this
  repository.
