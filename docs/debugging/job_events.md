# Job Event Delays

> Live job output in the UI lags behind the playbook, or a finished job's
> output fills in late.

## The path of a job event

An event is created in the execution environment and travels through
`ascender-task`, PostgreSQL and `ascender-web` before the browser shows it.
[Ansible Callback and Job Events](../job_events.md) describes each step in
full; in short:

1. Ansible calls a hook of ansible-runner's `awx_display` callback plugin,
   which writes the event as JSON. The event's `created` time is set here,
   on the clock of the machine the execution environment runs on.
2. `ascender-task`, on the job's controller node, reads the event: from the
   output of a local run (`outputEventFilter` in
   `src/internal/tasks/runner.go`), or from the `ansible-runner worker`
   stream that receptor carries back from an execution node or a container
   group pod (`processWorkerStream` in
   `src/internal/tasks/container_group.go`). See
   [Ansible Runner Integration](../ansible_runner_integration.md).
3. The job's event sink (`jobEventSink` in `src/internal/tasks/job_events.go`)
   turns the event into a row and keeps it in memory. Inventory updates and
   system jobs have their own, simpler writers
   (`src/internal/tasks/inventory_update.go`, `src/internal/tasks/system_job.go`).
4. Every 500 milliseconds the sink writes what it holds: one pipelined batch
   of `INSERT`s per job, sent in one round trip and run as one transaction
   (`saveEvents` in `src/internal/tasks/event_save.go`). The rows'
   `modified` time is the time of this write.
5. For each row written, the sink publishes a reference to it with
   `pg_notify` on the `ascender_websocket` channel, unless the
   `MAX_WEBSOCKET_EVENT_RATE` limit held the event back when it arrived. The notifications are
   sent one after another, each its own round trip, before the next write.
6. Each `ascender-web` process that has a websocket subscribed to the job's
   events reads the row back and sends it to those sockets (see
   [Websockets](../websockets.md)).
7. The job output page of a running job takes each message as a signal:
   150 milliseconds later it fetches the lines of the events it has not shown
   yet from `ascender-web` (`/jobs/<type>/<id>/output/live?after=<counter>`,
   which reads them through the job's events API) and draws them. It makes
   one fetch at a time. Without messages it fetches every 5 seconds while its
   websocket is subscribed, and every 1.5 seconds without one
   (`src/web/static/js/templates.js`).

There is no Valkey, no callback receiver process and no relay between web
nodes: steps 3 to 5 happen in the task process that runs the job, and
PostgreSQL carries step 6 to every web process.


## Measuring the delay

### In the database

`modified - created` on an event row is the time from the callback plugin to
the database (steps 1 to 4):

```sql
SELECT counter, event, modified - created AS delay
FROM main_jobevent
WHERE job_id = 42
  AND job_created = (SELECT created FROM main_unifiedjob WHERE id = 42)
ORDER BY counter;
```

Ad hoc commands and project updates have their own tables
(`main_adhoccommandevent` with `ad_hoc_command_id`, `main_projectupdateevent`
with `project_update_id`), as do inventory updates
(`main_inventoryupdateevent`, `inventory_update_id`) and system jobs
(`main_systemjobevent`, `system_job_id`). An inventory update's events are
written in half-second batches like a playbook job's. A system job's lines
are written one at a time as the command prints them, so for them the
difference is only the time of the `INSERT`. An event that came without a
`created` time (none of Ansible's do) takes the time the task process
received it. Since `created` comes from the execution node's clock, a clock that differs
from the controller's shifts every value by the same amount.

### Event writer metrics

`/api/v2/metrics/?subsystemonly=1` serves the event writer's counters per
task node (see [Subsystem Metrics](../subsystem_metrics.md)); the Metrics
screen in the UI charts them every three seconds. The ones that point at a
delay:

| Metric | What to look for |
| --- | --- |
| `callback_receiver_events_in_memory` | Events received and not yet written. A value that keeps growing means the writes fall behind. |
| `callback_receiver_event_processing_avg_seconds` | The average `modified - created` of the latest write. |
| `callback_receiver_events_insert_db_seconds`, `callback_receiver_events_insert_db` | Total write time and events written; their change over a minute gives the time per event. |
| `callback_receiver_batch_events_insert_db` | The batch size histogram. Large batches mean many events arrive between writes. |
| `callback_receiver_batch_events_errors` | Batches that failed and were written one event at a time, which is much slower. |

### In the browser

This snippet, pasted into the browser's console on any Ascender page while
logged in, subscribes to one job's events and logs how far behind each
arrives (steps 1 to 6). Pass the CSRF cookie's name as the second argument
when it is not `csrftoken` (`ASCENDER_CSRF_COOKIE_NAME`).

```javascript
function eventDelay(jobId, csrfCookie = 'csrftoken') {
  const token = document.cookie.split('; ')
    .find((c) => c.startsWith(csrfCookie + '='))?.split('=')[1];
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${scheme}//${location.host}/websocket/`);
  let max = 0;
  ws.onopen = () => ws.send(JSON.stringify({ xrftoken: token, groups: { job_events: [jobId] } }));
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (!e.created) return;
    const delay = (Date.now() - Date.parse(e.created)) / 1000;
    max = Math.max(max, delay);
    console.log(`event ${e.counter} (${e.event}): ${delay.toFixed(2)}s behind, max ${max.toFixed(2)}s`);
  };
  return ws; // ws.close() stops it
}
```

What the output page shows trails these messages by its fetch (step 7),
which is an ordinary UI request: `ASCENDER_SQL_DEBUG` times it like any page
(see [Slow API Requests and Pages](slow_api.md)).

### On the channel

`LISTEN ascender_websocket;` in `psql` shows every reference as it is
published (step 5). `SELECT pg_notification_queue_usage();` gives the share
of PostgreSQL's notification queue in use. It stays near zero unless a
listening session stops reading.


## Where it slows down

**Getting the output back.** For a job on an execution node or in a
container group, events arrive only as fast as the worker stream crosses the
receptor mesh. A local run reads the container's output directly.

**Writing the rows.** Each job's events are written in one batch per half
second, so a job that produces events faster than its batches can be
written falls behind, and `callback_receiver_events_in_memory` grows. The
time goes into the database's write path: storage latency, large
`event_data` (the plugin keeps task results up to 25,000,000 characters for
playbook jobs), and lock waits. When a batch fails, its events are written
one at a time, and the log says `Error in events bulk_create, will try
indiviually`. When the database cannot be reached the log says `the
database is unavailable; will try again`, and the events wait in memory for
the next write.

**Partitions.** Event tables are partitioned by hour of the job's `created`
time. The partition is created before the job starts, so no event waits for
it. Every read of a job's events filters on `job_created` and touches one
partition. A query written by hand that leaves `job_created` out reads every
partition, which grows slow as they accumulate; the `cleanup_jobs` system
job drops the partitions older than the days it keeps.

**The stats wrap-up.** The write that stores `playbook_on_stats` also writes
the host summaries, updates the host metrics and the inventory's computed
fields, and marks changed and failed parents. On a large inventory this
takes a while; the events after it in the same write, the `jobs-summary`
message and the job's final status wait for it.

**Publishing.** Each stored event costs one more round trip to PostgreSQL
(`pg_notify`), made in turn after the write. A job that writes thousands of
events a second spends much of its time here. Turning the
`UI_LIVE_UPDATES_ENABLED` setting off
(`PATCH /api/v2/settings/ui/ {"UI_LIVE_UPDATES_ENABLED": false}`) limits
publishing to `playbook_on_play_start`, `playbook_on_task_start` and
`playbook_on_stats`. The output page still shows every line, since it reads
them from the API; it fetches them when a play or task starts and otherwise
every 5 seconds. Short of that, the `MAX_WEBSOCKET_EVENT_RATE` setting
(default 30) caps each job at that many messages a second, besides the play,
task and stats events, which always go; events with no output are never
published while it is set. The events held back are stored as usual and the
page fetches them with the next ones. `0` publishes every event. See
[Websockets](../websockets.md#event-rate-limit).

**Fan-out.** A web process with no subscriber for a job does no work for its
events. One with subscribers runs one `SELECT` per event and queues the
message for each socket. A browser that stops reading is disconnected once
more than 8 MiB or 512 messages wait for it; the output page then falls back
to fetching every 1.5 seconds.

**The output page.** Each fetch reads the new events through the API, 200
per request, and renders them on the server; the browser then adds them to
the page. A burst of events makes the fetches larger rather than more
frequent, since the page makes one at a time.
