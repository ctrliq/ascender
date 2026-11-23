# Subsystem Metrics

Subsystem metrics are per-node operational counters of Ascender's own
machinery, as opposed to the database gauges (counts of objects, jobs by
status, instance capacity) that are read from the database on every request.
Both are served in Prometheus format at `/api/v2/metrics/`.

In the Go implementation the only subsystem that reports metrics is the event
writer in `ascender-task`, the part that stores job events and that the old
implementation called the callback receiver. The metric names are unchanged
so existing dashboards and alerts keep working.

The code is in three places:

- `src/internal/tasks/subsystem_metrics.go`: the counters and the loop that
  publishes them from `ascender-task`;
- `src/internal/api/subsystem_metrics.go`: publishing, and what each
  `ascender-web` keeps of what it receives;
- `src/internal/api/metrics.go`: the endpoint, which renders the database
  gauges and the subsystem metrics.

## How the numbers travel

```
ascender-task                          PostgreSQL               every ascender-web
callbackMetrics (in memory)
  -- every 3 s, if changed -->  NOTIFY ascender_websocket  -->  latest snapshot per instance (in memory)
     group "metrics"                                              --> GET /api/v2/metrics/
```

1. **Counting.** `ascender-task` keeps one set of counters in memory
   (`callbackMetrics`). The code that takes in and stores events updates
   it: `jobEventSink` in `src/internal/tasks/job_events.go` for jobs, ad hoc
   commands and project updates, `src/internal/tasks/inventory_update.go` for
   inventory updates, and `src/internal/tasks/system_job.go` for system jobs.
   An update takes a mutex, changes a value in a map, and marks the counters
   changed. It does no I/O.
2. **Publishing.** Every three seconds `Dispatcher.publishMetrics` takes a
   snapshot of the counters, if anything changed since the last one, and
   publishes it with `Server.PublishSubsystemMetrics`. The snapshot goes
   through the same PostgreSQL `NOTIFY` channel as websocket messages
   (`ascender_websocket`, see [Websockets](websockets.md)), in the group
   `metrics`, as
   `{"instance": "<node>", "metrics": "<JSON of the counters>", "metrics_namespace": "callback_receiver"}`.
   `<node>` is the task process's `ASCENDER_CLUSTER_HOST_ID` (by default its
   host name).
3. **Keeping.** Every `ascender-web` process listens on that channel. It does
   not pass the `metrics` group on to websocket clients. Instead
   `storeSubsystemMetrics` replaces whatever it held for that instance with
   the new snapshot.
4. **Serving.** `/api/v2/metrics/` renders what the web process holds, one
   sample per node, labelled `node="<instance>"`.

The counters are cumulative from the start of the `ascender-task` process, so
a lost snapshot loses nothing that the next one does not carry. Every web
replica receives every snapshot, so all replicas serve the same values,
whichever one a scraper reaches.

Consequences an operator may notice:

- Restarting `ascender-task` resets its counters to zero. The old
  implementation kept them in Valkey.
- The node list starts with the serving `ascender-web`'s own
  `ASCENDER_CLUSTER_HOST_ID`, which is always present and reads zero if no
  task process with that name has published. A web-only node therefore
  appears with zeros. The other instances follow, sorted by name.
- A snapshot is sent only when something changed. A web process that has just
  started does not list another node until that node next stores an event.
- A node that stops publishing (scaled down or deprovisioned) keeps its last
  values on the endpoint until the web process restarts.

## The endpoint

`GET /api/v2/metrics/` is open to superusers and system auditors. With the
`ALLOW_METRICS_FOR_ANONYMOUS_USERS` setting on, anyone can read it, without
logging in.

By default the response is Prometheus text exposition (`text/plain`), the
database gauges first and then the subsystem metrics. A browser asking for
HTML gets the same text in the browsable API page.

| Query parameter | Effect |
| --- | --- |
| `subsystemonly=1` | Only the subsystem metrics. |
| `dbonly=1` | Only the database gauges. |
| `node=<hostname>` | Subsystem samples of that node only. |
| `metric=<name>` | Only that subsystem metric family. |
| `format=json` | The same data as JSON (below). |

`node` and `metric` apply only to the subsystem metrics. Each takes one value.
The old implementation accepted a parameter repeated to select several nodes
or metrics; Go uses the first value.

With `format=json`, each family becomes a key holding its help text, type and
samples:

```json
{
  "callback_receiver_events_insert_db": {
    "help_text": "Number of events batch inserted into database",
    "type": "gauge",
    "samples": [{"labels": {"node": "ascender-task-1"}, "value": 1532}]
  }
}
```

Histogram samples also carry `"sample_type"`: `bucket`, `count` or `sum`.

### Database gauges

These are computed on each request (`Server.dbMetrics`) and are not
subsystem metrics: `ascender_system_info`, the `*_total` counts of
organizations, users, teams, inventories, projects, job templates,
workflow job templates, hosts (all and active), schedules and sessions,
running and pending jobs, job wait and run times over the last hour
(`ascender_job_wait_seconds_*`, `ascender_job_run_seconds_*`,
`ascender_job_timing_sample_total`), jobs by status, per-instance capacity,
CPU, memory, info, launch types, job statuses, consumed and remaining
capacity, and `ascender_database_connections_total`. Every family is also
served under its former `awx_` name.

### Subsystem metrics

All are labelled `node`; the last three also carry
`subsystem="callback_receiver"`. All are reported as gauges, except the
histogram.

| Metric | Meaning in Go |
| --- | --- |
| `callback_receiver_events_queue_size_redis` | Always 0. Events go straight from a running job to the writer, with no queue in between. Kept for compatibility. |
| `callback_receiver_events_popped_redis` | Events received from running jobs. |
| `callback_receiver_events_in_memory` | Events received and not yet stored or discarded. An event is discarded when it duplicates one already stored, or when it is given up after failing its retries. |
| `callback_receiver_batch_events_errors` | Batch inserts that failed. The events of a failed batch are then saved one by one. |
| `callback_receiver_events_insert_db_seconds` | Total time spent saving events. |
| `callback_receiver_events_insert_db` | Events stored, in batches or one by one. |
| `callback_receiver_events_broadcast` | Stored events handed to the websocket publisher. Events the `MAX_WEBSOCKET_EVENT_RATE` limit held back are not counted; events that `UI_LIVE_UPDATES_ENABLED` being off keeps from going out are. |
| `callback_receiver_batch_events_insert_db` | Histogram of the number of events in each batch insert, buckets 10, 50, 150, 350, 650, 2000 and +Inf. One observation per save that stored anything. |
| `callback_receiver_event_processing_avg_seconds` | For the latest save, the average time from an event's creation to its storage, over the events that carried a creation time. |
| `subsystem_metrics_pipe_execute_calls` | Snapshots published. |
| `subsystem_metrics_pipe_execute_seconds` | Total time spent publishing snapshots. The help text still says "saving metrics to valkey". |
| `subsystem_metrics_send_metrics_seconds` | The same value as `subsystem_metrics_pipe_execute_seconds`: in Go, saving and sending are one step. |

The histogram is cumulative: each bucket includes the observations of the
buckets before it. Given

```
callback_receiver_batch_events_insert_db_bucket{le="10",node="ascender_1"} 1
callback_receiver_batch_events_insert_db_bucket{le="50",node="ascender_1"} 5
...
callback_receiver_batch_events_insert_db_bucket{le="+Inf",node="ascender_1"} 5
callback_receiver_batch_events_insert_db_count{node="ascender_1"} 5
callback_receiver_batch_events_insert_db_sum{node="ascender_1"} 112
```

one save inserted 10 events or fewer in its batch, and four (5 - 1) inserted
between 11 and 50.

Values whose name ends in `_seconds` are rendered as floats. All other values
are rendered as integers.

> **Not implemented:** the old dispatcher and task manager metrics
> (`task_manager_*`, `dependency_manager_*`, `workflow_manager_*`,
> `dispatcher_pool_*`, `dispatcher_availability`) do not exist in Go. The
> `SUBSYSTEM_METRICS_*` settings are not read: the three-second interval
> and the histogram buckets are fixed in the code.

## The Metrics screen

The UI's Metrics page (`/metrics`, `src/internal/web/metrics.go` and
`src/web/static/js/metrics.js`) offers the non-execution instances and the
metric names returned by `/api/v2/metrics/?subsystemonly=1&format=json`. Once
an instance and a metric are chosen, it reads that metric every three seconds
and charts the last fifty readings. With more than one instance it also
offers "All", which charts every node.

## Adding a metric

1. **Count it in `ascender-task`.** Add a method on `subsystemCounters` in
   `src/internal/tasks/subsystem_metrics.go` that takes `c.mu`, updates
   `c.vals["<name>"]`, and sets `c.changed = true`, then call it on
   `callbackMetrics` where the thing happens. Values are `float64`. Add to the
   value for a running total, or assign it for a last-value gauge; the
   snapshot sends the current value either way. Keep it to this in-memory
   update: publishing is already batched.
2. **Render it.** In `Server.subsystemMetrics` (`src/internal/api/metrics.go`)
   add the name and help text to the `gauges` list, or write its family
   alongside the others. Read values with `val(n, name)`, which renders zero
   for a node that has not published, and test `want(name)` so the `metric`
   filter works. Name a value `..._seconds` if it is fractional: other names
   are rendered as integers.
3. **Mind the size.** The whole snapshot travels in one `NOTIFY`, inside a
   JSON string, so its quotes are escaped. An envelope over 7900 bytes is
   dropped and a warning logged (`publishNotice` in
   `src/internal/api/websocket.go`). Today's snapshot is a small fraction of
   that.
4. **Histogram buckets** are listed twice: `SubsystemMetricBuckets` in
   `src/internal/tasks/subsystem_metrics.go` counts the observations, and the
   `le` labels in `Server.subsystemMetrics` render them. Change both together.
5. **A new subsystem**, such as metrics from another part of `ascender-task`,
   needs more than a new name. `storeSubsystemMetrics` accepts only the
   `callback_receiver` namespace and keeps a single snapshot per instance, so
   a second namespace has to be keyed separately there and published under
   its own namespace.

The Metrics screen picks up a new metric on its own, since it lists whatever
the endpoint returns.
