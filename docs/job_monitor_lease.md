# Surviving a controller restart: the job monitor lease

A running job's output is read by exactly one dispatcher task, on one control node, for the
job's whole life. Until now, losing that task meant losing the job: on a graceful stop the
task cancelled the receptor work unit (which, for a container group, deletes the job pod),
and on a crash the next heartbeat reaped the job as failed and the pod reaper deleted its
pod. On Kubernetes, where control pods are replaced on every upgrade, every settings change
and every eviction, that made task-pod restarts fail whatever happened to be running.

The job pod, and a work unit on an execution node, outlive the control node. This change
makes reading their output something any control node can pick up.

## How it works

**The lease.** When a job is handed to receptor, the task that launched it takes out a
`JobMonitorLease` on the job (one row per monitored job, `main_jobmonitorlease`) and renews it
every `JOB_MONITOR_RENEW_SECONDS` while it reads the output. The lease row also records which
pod a container group job runs in and whether `ansible-runner worker` has reported `starting`,
which means the execution environment received its payload. The lease covers reading the
output and nothing after it: it is removed as soon as the output has been read, before the
post-run hooks, which can take longer than a lease lasts without renewal.

**Detach, never cancel, on shutdown.** A SIGTERM to a task reading a job used to be treated
as a cancel. Now the job row's `cancel_flag`, which `UnifiedJob.cancel()` commits before it
signals the dispatcher, is what tells a cancel from a shutdown. On a shutdown:

- if the worker has its payload, the task closes its stream, leaves the work unit and pod
  running, and expires its lease at once;
- if it has not, the task cancels the work unit and re-queues the job to `pending`, since
  nothing has run yet;
- a project update is cancelled and re-queued even when it has started. It works in the
  project's directory under an exclusive lock held by its task, and is not left running
  without that lock. An inline project sync is only cancelled: the job that runs it is
  stopping too, and fails as it did before.

System jobs run inside the dispatcher itself rather than through receptor. They are not
covered by any of this and end on a shutdown as they did before, and so does a job that has
not been handed to receptor yet.

**The sweep.** `sweep_job_monitors` runs every 30 seconds on every ready control node. It
claims each expired lease of a running job with one compare-and-set on the job's
`celery_task_id` (so two nodes cannot both take a job), sets itself as the job's
`controller_node`, and dispatches `resume_job` under the new task id. Which node may claim:

- Work that ran locally on a hybrid node, or a project update on a control node, can only be
  read through that node's own receptor. While that node is ready, only it claims the job, and
  so it does for as long after it went unavailable as its peers would wait before declaring it
  lost: a node marks itself unavailable as its dispatcher stops, before that dispatcher's tasks
  detach, and its receptor runs the unit on while the dispatcher restarts.
- A node always takes back its own jobs: they already count against its capacity.
- Any other job is taken only by an enabled node with control capacity to spare, because a
  resumed job occupies a dispatcher worker for the rest of its run. The rest is left to a
  peer or a later sweep.

Instance heartbeats only answer the first question. An expired lease is the one reason to
read a job elsewhere. The sweep also deletes expired leases of jobs that are no longer
running, such as a job cancelled while nobody was reading it.

**Resuming.** `BaseTask.resume()` reads the rest of the output from wherever it survived
(`ascender.main.tasks.monitor.plan_resume`):

| The job ran | Where the output is | How it is read |
|---|---|---|
| in a container group pod | the pod's log, during and after the run | `PodLogStream`: the Kubernetes log API with timestamps, reconnecting from the last timestamp when a connection drops or stays silent for `JOB_MONITOR_STREAM_IDLE_SECONDS`; a finished pod is harvested once |
| through a work unit this node's receptor still has (only the dispatcher restarted) | the unit's stdout | `ReceptorUnitStream`: `work results` from the start |
| on an execution node, or in a container group behind a mesh hop node | the unit on that node | `ReceptorUnitStream` after `work adopt`, which makes this receptor track the unit (receptor devel; the JSON command is sent directly) |
| through a unit in a control node that is gone | nowhere | re-queued if nothing ran or the job repeats safely (project and inventory updates); failed otherwise |

A pod that is still pending is waited for, up to `ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT`,
after which the job fails as receptor would have failed it. A running pod that has written
nothing for `JOB_MONITOR_WEDGE_SECONDS` never received its payload: it is deleted and the job
re-queued. A project update is never resumed: its unit is cancelled and it is re-queued, or
failed if it is an inline sync.

A re-queued job keeps its id and runs again from the start, numbering its events from 1. The
events its abandoned attempt saved are deleted when it is re-queued, and again just before the
new attempt is handed to receptor, in case some were still on their way; the job's output is
the attempt that produced its result. A job launched with passwords typed in at launch is
failed instead of re-queued: those passwords are removed from the job as it starts, and it
could not start again without them.

Either stream is fed to ansible-runner's process streamer unchanged, so events are parsed,
saved and broadcast exactly as during the launch. Events are replayed from the beginning:
`RunnerCallback` skips the counters that are already saved (read with their count in one
query, as ranges, of which there are as many as there are gaps between saved events), and
the database has a unique constraint on `(job, job_created, counter)` for every
event table as the guarantee, with the callback receiver dropping a duplicate rather than
retrying it. The constraint's index replaces the plain index on the same columns, so event
inserts maintain no more indexes than before. Host summaries and the stats wrapup are written
once as well. Replaying from the start is deliberate: it also recovers the events that were
sitting in the lost control pod's own valkey queue, which nothing else can.

The replayed `starting` status does not overwrite the job's stored environment. The launch
stored it with the values its credentials injected masked, and a resumed read cannot
reproduce that masking; it only points `AWX_PRIVATE_DATA_DIR` at its own directory. If the
launch never stored an environment, the resumed read stores one with every value hidden that
a credential could have set.

What a resume cannot settle now, a later sweep settles. The lease is put off by
`JOB_MONITOR_RETRY_SECONDS`, up to `JOB_MONITOR_MAX_DEFERRALS` times before the job is failed,
when the output is not reachable yet (an execution node that is unavailable but not yet
declared lost may still be running the unit), when reading it fails (the Kubernetes API or
receptor is unreachable), and when the stream ends without a result while the pod or unit is
still running. A stream that ends without a result once the work is done takes the job's status
from the pod's exit code or the unit's state.

Once the output has been read, the lease is removed and the pod or unit released, as at the
end of a launch. The job then finishes the way the launch would have: the type's post-run hook
(fact cache, inventory import) runs against the resumed run's artifacts, the final status is
written and notifications are sent. `finished` is taken from the wrapup event's own
timestamp, so a job that was done while nobody was watching is not stamped minutes late.

**Fencing.** The final status is written by `update_model(owner_task_id=...)`, which locks the
row and refuses the write with `NotOwner` if the job's `celery_task_id` has moved on. A
launch whose lease was taken over (say its node was partitioned from the database) finds
this out at its next renewal, drops its stream, and neither finalizes nor releases anything;
if it only finds out at the final write, the write is refused. A project update also stops
its work as it drops the stream, since it is never left running without its task's lock on
the project, and the job whose inline sync it was fails with it. The result of a job is
written once, by whoever holds the lease.

The lease row is what a claim and a reader that is done with the job serialize on. A claim
takes the row's lock and checks under it that the lease is still expired before it moves the
task id; retiring the lease takes the same lock before it checks that its task still owns the
job, and the pod or work unit is released only once the retirement succeeded. So a reader
finishing just as a claim lands can neither remove the claimer's lease nor release the work
from under it, and a claim cannot take a job whose reader has just finished with it.
Expiring a lease on detach and putting it off are fenced by the owner's task id as well.

## What is left alone

- Jobs without a lease are reaped exactly as before: those never handed to receptor,
  those launched before this change, and those whose output has been read and whose task
  dies during the post-run hooks. The reapers step around a leased job when the node they
  reap is its controller, or, for the heartbeat's reaper, the control or hybrid node whose
  own receptor runs its unit: a peer that claimed such a job re-queues or fails it within
  moments. A leased job whose execution or hop node is lost, or whose execution node is no
  longer registered, is reaped as before: its controller is still reading it, and receptor
  would wait for that node indefinitely.
- Cancelling reaches the task that holds the lease, through the job's `controller_node` and
  `celery_task_id`, which the claim keeps current. A job cancelled while nobody holds its
  lease is marked canceled at once; the existing reapers then delete its pod, or cancel its
  work unit when a control node's receptor still tracks it. A cancel that reaches a resume which then has to wait is
  carried out by the next resume, which stops the work where it finds it.
- Workflow jobs never have a lease.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `JOB_MONITOR_LEASE_SECONDS` | 60 | How long a lease holds without a renewal; a crash is noticed within this |
| `JOB_MONITOR_RENEW_SECONDS` | 10 | How often a reading task renews, and the interval at which it checks for signals |
| `JOB_MONITOR_SWEEP_BATCH` | 50 | How many expired leases one sweep looks at, at most |
| `JOB_MONITOR_RETRY_SECONDS` | 30 | How long a resume puts a job off when its output is not reachable yet or could not be read |
| `JOB_MONITOR_MAX_DEFERRALS` | 120 | How many such waits before the job is failed |
| `JOB_MONITOR_WEDGE_SECONDS` | 60 | A silent, running pod older than this never received its payload: it is deleted and its job re-queued |
| `JOB_MONITOR_STREAM_IDLE_SECONDS` | 120 | A receptor stream that waits this long for bytes after its unit finished, short of the unit's stdout size, is abandoned and the job's result taken from the unit; a pod log connection silent this long is reopened |

## Recovery times

- Graceful stop of a control node: the next sweep on a live node, at most 30 seconds. Work
  that ran locally on that node waits for the node itself to come back.
- Crash of a control node: lease expiry plus the next sweep, about 60 to 90 seconds.
- During the gap the automation keeps running; only the saving of its events waits.

## Kubernetes deployment notes

A task pod no longer has to stay up until its jobs finish to keep them alive across a
rollout: it detaches from them within seconds of being asked to stop, so a long termination
grace period for that purpose is no longer needed. An upgrade that changes the database
schema still has to stop old task pods before new ones run jobs, as before.

Reading a pod's log takes `get` on `pods/log`. receptor needs the same permission to stream
the log during the launch, so any container group that runs jobs today already has it, with
the service account or with the container group's credential.

## Upgrading

Migration `0232_event_counter_unique` builds a unique index on each event table, one per
partition, and drops the plain index it replaces. On a deployment with large event tables
this takes about as long as reindexing them, under a lock on each table. It first checks each
table for duplicates through the existing index and deletes the later copies, which on a
healthy database finds none.

## Limits

- The kubelet serves only the current log file of a container through the API. A job that
  writes more than the node's `containerLogMaxSize` (10 MiB by default) while nobody is reading
  loses the events in between that were not saved before its controller was lost; the final
  artifacts are written last and are in the current file. A gap shows up as missing counters
  in the job's events.
- A job that ran through a work unit in a control node's own receptor (project updates,
  playbooks on a hybrid node) cannot be read once that node is gone; it is re-queued when
  that is safe and failed otherwise.
- The post-run hooks are not resumed. If the task running them dies, the job fails as it did
  before this change.
- `work adopt` for execution nodes and mesh hop nodes needs a receptor built after
  ansible/receptor PR 1564 (devel at the time of writing; not in 1.6.9). This path is covered
  by tests with a fake receptor only; it has not been exercised against real execution nodes.
