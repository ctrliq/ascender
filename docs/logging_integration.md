# Integration With Third-Party Log Aggregators

Ascender can send a copy of its logs to an external log aggregator (Splunk,
an Elastic Stack behind Logstash, Sumo Logic, Loggly, or anything else that
takes JSON over HTTP, TCP, UDP or RELP). Each record is one JSON object with
the same structure as the data the API shows: job events, activity stream
entries, the steps a job goes through, and the service's own log messages.

Both processes, `ascender-web` and `ascender-task`, ship their own records
directly to the aggregator; there is no rsyslog or other relay. The shipper
(filtering, formatting, the queue and the connections) is
`src/internal/extlog`; the records are built in
`src/internal/api/extlog_records.go` (activity stream, job lifecycle,
performance) and `src/internal/tasks/extlog_records.go` (job events, facts),
and the destination is read from the settings by `LogDestinations` in
`src/internal/api/extlog_records.go`.


## Setting it up

External logging is configured in the logging settings
(`/api/v2/settings/logging/`, or Settings > Logging in the UI). A minimal
configuration names the aggregator, its type, and turns logging on:

```
PATCH /api/v2/settings/logging/

{
    "LOG_AGGREGATOR_ENABLED": true,
    "LOG_AGGREGATOR_HOST": "https://logs.example.com:8088/services/collector/event",
    "LOG_AGGREGATOR_TYPE": "splunk",
    "LOG_AGGREGATOR_PASSWORD": "<HEC token>"
}
```

Logging cannot be enabled without a host and a type: the request gets `400`
with `{"non_field_errors": ["Cannot enable log aggregator without providing
host."]}` (or `type.`, or both on two lines).

The settings can also be given in the deployment's settings file
(`ASCENDER_SETTINGS_FILE`, see [deploy/README.md](../deploy/README.md)); a
setting given there cannot be changed through the API.


## Protocols

`LOG_AGGREGATOR_PROTOCOL` (default `https`) chooses how records travel. Every
protocol sends one record at a time, keeps its connection open between
records, and waits up to `LOG_AGGREGATOR_TCP_TIMEOUT` seconds (default 5) to
connect or send.

| Protocol | How a record is sent | Needs |
|:---------|:---------------------|:------|
| `https` | One `POST` per record, `Content-Type: application/json; charset=utf-8`. | A host. |
| `tcp` | One record per line (the JSON followed by a newline) on a TCP stream. | A host and a port. |
| `udp` | One record per datagram; a record longer than 65,507 bytes, the most a datagram carries, is cut to that size. | A host and a port. |
| `relp` | A RELP session (the `syslog` command): the aggregator acknowledges each record, and one it does not acknowledge is sent again. | A host and a port. |

For `https`, `LOG_AGGREGATOR_HOST` may be a full URL, path and query string
included. A host without a scheme means `https://`; `http://` makes it plain
HTTP. The port is the URL's, else `LOG_AGGREGATOR_PORT`, else 443 (or 80 for
`http://`). `LOG_AGGREGATOR_VERIFY_CERT` (default on) checks the server's
certificate against the system's CA certificates; turning it off accepts any
certificate. The usual proxy variables (`HTTPS_PROXY`, `HTTP_PROXY`,
`NO_PROXY`) apply to HTTP destinations.

For `tcp`, `udp` and `relp`, `LOG_AGGREGATOR_HOST` is a host name or address
only, used as it is, and `LOG_AGGREGATOR_PORT` is required. While the port is
missing there is no destination: records are discarded, not queued, and
whatever an earlier destination left spooled stays on disk until there is
one again. These protocols have no TLS.

On TCP, keepalive probes find a connection that a firewall or load balancer
dropped while it was idle: `LOG_AGGREGATOR_TCP_KEEPALIVE` (default on) sends
the first probe after `LOG_AGGREGATOR_TCP_KEEPALIVE_TIME` seconds of idleness
(default 120), then every `LOG_AGGREGATOR_TCP_KEEPALIVE_INTERVAL` seconds
(default 30), and gives the connection up after
`LOG_AGGREGATOR_TCP_KEEPALIVE_PROBES` unanswered probes (default 3). The
other protocols ignore these settings.


## Aggregator types

`LOG_AGGREGATOR_TYPE` is one of `logstash`, `splunk`, `loggly`, `sumologic`,
`ledger` or `other`. Only two of them change anything:

- `splunk` wraps each record for Splunk's HTTP Event Collector (the
  `/services/collector/event` endpoint), which wants the record under
  `event` and the time, in seconds since the epoch, beside it:
  `{"time": 1795253412.345, "event": {...}}`. Over HTTP the password is sent
  as `Authorization: Splunk <password>`.
- `ledger` sends the password as `Authorization: Ledger <password>` over HTTP,
  and never uses the username.

For every type but `ledger`, a `LOG_AGGREGATOR_USERNAME` makes HTTP requests
use basic authentication with `LOG_AGGREGATOR_PASSWORD` (an empty password
when there is none). For `splunk` with a password, the `Splunk` header is
sent instead of the basic one, so the username only counts when the
password is empty. The username and password are used only over HTTP. The
password is stored encrypted and reads back as `$encrypted$`.


## Delivery and retries

Records are never sent from inside the request or the job that made them:
each process puts them in a queue for the destination (see
[Queueing and spooling](#queueing-and-spooling)), and a worker delivers the
queue in order.

- A record the aggregator took leaves the queue.
- When the aggregator cannot be reached, does not answer in time, answers an
  HTTP request with `5xx` or `429`, or a RELP server does not acknowledge,
  the same record is tried again every `LOG_AGGREGATOR_TCP_TIMEOUT` seconds,
  for as long as it takes. Records queue up behind it meanwhile.
- When an HTTP aggregator answers with any other status (a `400`, say, for a
  record it cannot parse), the record is dropped, since sending it again
  would fail the same way, and it is written to the error file: one JSON
  line per record with `request` (`url`, `postdata`) and `response`
  (`status`, `message`, the first 64 KiB of the answer). The file is
  `ASCENDER_LOG_AGGREGATOR_ERROR_LOG_FILE`, by default
  `/var/log/ascender/rsyslog.err` when `/var/log/ascender` exists; with
  neither, refused records are only counted and reported in the log.

The shipper reports its own problems on the process's standard error, as
`<time> ERROR external logging: <message>`, never through the external
logger itself. For example:

```
2026-11-21 09:30:12 ERROR external logging: destination default is unreachable, retrying every 5s: dial tcp 192.0.2.10:5140: connect: connection refused
2026-11-21 09:31:02 ERROR external logging: destination default resumed after 50s
2026-11-21 09:32:40 ERROR external logging: destination default refused a record: https://logs.example.com:443/ingest answered 400 Bad Request
```

A record larger than 25,000,000 bytes is cut to that size. Over UDP, a
record longer than 65,507 bytes is cut to that size and sent, and the cut
is reported:

```
2026-11-21 09:33:05 ERROR external logging: omfwd/udp: message is 100230 bytes long, but UDP can send at most 65507 bytes (by RFC limit) - truncating message
```

Should the system still refuse a datagram as too long, it is cut by another
1024 bytes and tried again; one it refuses even at 512 bytes is dropped as
refused. An oversized record is never retried for ever, so it cannot hold up
the records behind it.


## What is logged

`LOG_AGGREGATOR_LOGGERS` selects what is sent. Its default selects
everything below except `performance`:

| Selector | Logger | Level | What |
|:---------|:-------|:------|:-----|
| `ascender` | `ascender.*` | any | The service's own log messages. `ascender-web` logs as `ascender.api` and `ascender-task` as `ascender.main.tasks`; some messages carry a more specific name, such as `ascender.sso.views`, `ascender.main.tasks.facts` or `ascender.api.generics` (the [API's error responses](#api-error-records)). `awx`, as stored by older installations, selects the same records. |
| `activity_stream` | `ascender.analytics.activity_stream` | INFO | Every activity stream entry, once the change that wrote it commits; a change that rolls back sends nothing. |
| `job_events` | `ascender.analytics.job_events` | INFO | Every event of a job, a project update or an ad hoc command, as the task process takes it in. Inventory updates and system jobs send no events. |
| `job_lifecycle` | `ascender.analytics.job_lifecycle` | INFO | The steps a unified job goes through (below). |
| `broadcast_websocket` | `ascender.analytics.broadcast_websocket` | WARNING | Websocket messages that could not be passed to the other processes. |
| `performance` | `ascender.analytics.performance` | DEBUG | One record per API request, with its timing. Needs `LOG_AGGREGATOR_LEVEL` set to `DEBUG`. |
| `system_tracking` | `ascender.analytics.system_tracking` | | Nothing is logged on this logger. Facts gathered by jobs are sent by the service logger instead (`ascender.main.tasks.facts`, selected by `ascender`). |

`LOG_AGGREGATOR_LEVEL` (default `INFO`) is the least severe level sent, from
`DEBUG`, `INFO`, `WARNING`, `ERROR` and `CRITICAL`. It applies to every
record, the job events and activity stream entries too: with `WARNING`, only
service messages of that level or above and the websocket records are sent.


### Common fields

Every record starts with these fields:

| Field | Value |
|:------|:------|
| `@timestamp` | When the record was made, in UTC with milliseconds (`2026-11-21T09:30:12.345Z`; no fraction when it is zero). |
| `message` | The log message. |
| `host` | The host name of the machine or container that sent it. |
| `level` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL`. |
| `logger_name` | The logger, from the table above. |

and ends with:

| Field | Value |
|:------|:------|
| `cluster_host_id` | The node's name (`ASCENDER_CLUSTER_HOST_ID`). |
| `tower_uuid` | The installation's `INSTALL_UUID`. |
| `tower_url` | `ASCENDER_URL_BASE`. |

Keys come in this order, with `", "` and `": "` as separators and characters
outside ASCII escaped (`\u00e9`).


### Service records

Between the common fields, a service record has `stack_info` and `taskName`
(always `null`), the message's own attributes, and `guid`.

```json
{"@timestamp": "2026-11-21T09:30:12.345Z", "message": "User admin logged in", "host": "ascender-web", "level": "INFO", "logger_name": "ascender.sso.views", "stack_info": null, "taskName": null, "guid": null, "cluster_host_id": "ascender-web", "tower_uuid": "0b4c6f2e-9d3a-4e1b-8c7f-5a2d1e0f3b6c", "tower_url": "https://ascender.example.com"}
```

`guid` ties a record to what it was made for: the API request (the
`X-API-Request-Id` header of its response) or the job run (the job's task
id, without dashes). Every service record made while handling a request or
running a job carries it, the activity stream, job event and fact records
too; messages from the background (the heartbeat, the dispatcher's own
work) have `null`. Lifecycle and performance records have no `guid` field.

The fact records of a job that gathers facts are `New fact for inventory
<inventory> host <host>`, with `inventory_id`, `host_name`, `ansible_facts`,
`ansible_facts_modified` and `job_id`, and `Facts cleared for inventory
<inventory> host <host>`.


### Activity stream records

The message is `Activity Stream update entry for <object1>`, and the fields
are those of the entry in the API: `changes` (as an object), `relationship`,
`actor` (the username), `operation`, `object1`, `object2` and
`summary_fields`, followed by `guid`.

```
{"@timestamp": "2026-11-21T09:30:12.345Z", "message": "Activity Stream update entry for organization", "host": "ascender-web", "level": "INFO", "logger_name": "ascender.analytics.activity_stream", "stack_info": null, "taskName": null, "changes": {"name": "Engineering", ...}, "relationship": "", "actor": "admin", "operation": "create", "object1": "organization", "object2": "", "summary_fields": {"organization": [{"id": 2, "name": "Engineering", ...}], "actor": {"id": 1, "username": "admin", ...}}, "guid": "6f1c2a9e0b5d4c7e8a3f2b1d0c9e8f7a", "cluster_host_id": "ascender-web", "tower_uuid": "0b4c6f2e-9d3a-4e1b-8c7f-5a2d1e0f3b6c", "tower_url": "https://ascender.example.com"}
```


### Job event records

The message is `Event data saved.`, and the fields are the event's, in the
order of the event model, between the common fields. First comes `guid` (the
job's task id, taken out of `event_data`). For a job event the rest are `id`
(`null`), `event`, `event_data`, `failed`, `changed`, `uuid`, `playbook`,
`play`, `role`, `task`, `counter`, `stdout`, `verbosity`, `start_line`,
`end_line`, `created`, `modified` (`null`), `job`, `host` (the host's id),
`host_name`, `parent_uuid` and `job_created`. A project update event has
`project_update` and `job_created` in place of `job` through `job_created`.
An ad hoc command event has `id`, `event_data`, `uuid`, `counter`, `stdout`,
`verbosity`, `start_line`, `end_line`, `created`, `modified`, `event`,
`failed`, `changed`, `ad_hoc_command`, `host`, `host_name` and
`job_created`. All end with `event_display` and, for a job in a workflow,
`workflow_job_id`. `event_data` keeps the key order it was stored with,
which is the order the event arrived in, and its numbers as they were
written.


### Job lifecycle records

One record for each step of a unified job: `created`, `acknowledged`,
`blocked`, `waiting`, `needs_capacity`, `controller_node_chosen`,
`execution_node_chosen`, `pre_run`, `preparing_playbook`,
`running_playbook`, `work_unit_id_received`, `work_unit_id_assigned`,
`pod_recorded`, `start_job_fact_cache`, `finish_job_fact_cache`, `post_run`,
`finalize_run`, `stats_wrapup_finished`, `notifications_sent`, and the
[job monitor](./job_monitor_lease.md)'s `monitor_leased`, `monitor_detached`,
`monitor_resumed`, `monitor_resume_failed`, `monitor_resume_canceled` and
`monitor_requeued`. The message names the job and the step, followed by the
same data as JSON, which is also the `lifecycle_data` field; the job's
`organization_id` comes after it:

```json
{"@timestamp": "2026-11-21T09:30:14.020Z", "message": "job-42 controller node chosen {\"type\": \"job\", \"task_id\": 42, \"state\": \"controller_node_chosen\", \"work_unit_id\": null, \"task_name\": \"Deploy\", \"controller_node\": \"ascender-task\"}", "host": "ascender-task", "level": "INFO", "logger_name": "ascender.analytics.job_lifecycle", "lifecycle_data": {"type": "job", "task_id": 42, "state": "controller_node_chosen", "work_unit_id": null, "task_name": "Deploy", "controller_node": "ascender-task"}, "organization_id": 1, "cluster_host_id": "ascender-task", "tower_uuid": "0b4c6f2e-9d3a-4e1b-8c7f-5a2d1e0f3b6c", "tower_url": "https://ascender.example.com"}
```

`type` is the model (`job`, `projectupdate`, `inventoryupdate`,
`adhoccommand`, `systemjob`, `workflowjob`, `workflowapproval`);
`controller_node` and `execution_node` appear on their own steps (`NOT_SET`
when there is none).

`blocked` is sent each time the task dispatcher looks for work and finds a
pending task held back by another (see
[Task Manager System](task_manager_system.md)), whatever its age; its
message names the blocker, `job-43 blocked by job-42`, and its data adds
`"blocked_by": "job-42"`. `start_job_fact_cache` is also sent by an update
of a constructed inventory, which caches its input inventories' facts.

#### In the process output

The lifecycle records are also written to the output of the process that
makes them (`ascender-web` for `created` on a launch through the API,
`ascender-task` for the rest), whether or not an aggregator is configured,
as the old containers' console handler wrote the
`ascender.analytics.job_lifecycle` logger, in the same `log/slog` format as
the process's other lines: the message without its JSON, then the logger's
name, the lifecycle fields, the organization and the correlation id as
attributes (empty ones left out):

```
time=2026-11-21T09:30:14.020-06:00 level=INFO msg="job-42 controller node chosen" logger=ascender.analytics.job_lifecycle type=job task_id=42 state=controller_node_chosen task_name=Deploy controller_node=ascender-task organization_id=1 guid=8e1c6a0b2f4d4e7a9c3b5d1f0a2e4c6b
```

They are written at `INFO`, so they appear while `ASCENDER_LOG_LEVEL` is
`debug` or `info` (the default), and not at `warn` or `error`. The record an
aggregator receives keeps the old message, with the JSON, and is unaffected.
`LOG_AGGREGATOR_LOGGERS` and `LOG_AGGREGATOR_LEVEL` decide only what is sent
to the aggregator.

The old application could also write them to `/var/log/ascender/job_lifecycle.log`,
but only with `ASCENDER_LOGGING_MODE=file`, the mode of a traditional
installation on a VM. Its container images set `AWX_LOGGING_MODE=stdout`,
which turned that file (and every other log file) into a null handler, so a
container deployment only ever saw these lines in the process output. The Go
processes write no lifecycle file; a deployment that wants one keeps the
container output, as for every other log line.


### Performance records

The message is `request: <ASGIRequest: GET '/api/v2/ping/'>, response_time:
0.012s`, with `x_api` (the response's `X-API-Time`, `X-API-Total-Time`,
`X-API-Query-Count`, `X-API-Query-Time` and `X-API-Node` headers that are
present, times as numbers of seconds) and `request` (`method`, `path`,
`path_info`, `query_string`).


## Settings

All in the logging category:

| Setting | Default | Effect |
|:--------|:--------|:-------|
| `LOG_AGGREGATOR_ENABLED` | `false` | Sends records at all. |
| `LOG_AGGREGATOR_HOST` | `null` | The aggregator (see [Protocols](#protocols)). |
| `LOG_AGGREGATOR_PORT` | `null` | Its port, 1 to 65535. |
| `LOG_AGGREGATOR_TYPE` | `null` | See [Aggregator types](#aggregator-types). |
| `LOG_AGGREGATOR_USERNAME`, `LOG_AGGREGATOR_PASSWORD` | `""` | HTTP authentication. |
| `LOG_AGGREGATOR_LOGGERS` | `["ascender", "activity_stream", "job_events", "system_tracking", "broadcast_websocket", "job_lifecycle"]` | See [What is logged](#what-is-logged). An empty list sends nothing. |
| `LOG_AGGREGATOR_LEVEL` | `INFO` | The least severe level sent. |
| `LOG_AGGREGATOR_PROTOCOL` | `https` | `https`, `tcp`, `udp` or `relp`. |
| `LOG_AGGREGATOR_TCP_TIMEOUT` | `5` | Seconds to connect or send, and between retries. |
| `LOG_AGGREGATOR_VERIFY_CERT` | `true` | Checks an HTTPS aggregator's certificate. |
| `LOG_AGGREGATOR_TCP_KEEPALIVE`, `_TIME`, `_INTERVAL`, `_PROBES` | `true`, `120`, `30`, `3` | TCP keepalive probes. |
| `LOG_AGGREGATOR_ACTION_QUEUE_SIZE` | `131072` | Records the queue holds in memory. |
| `LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY` | `5` | Which records a nearly full queue discards. |
| `LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB` | `1` | Gigabytes the queue may spool to disk. |
| `LOG_AGGREGATOR_MAX_DISK_USAGE_PATH` | `/var/lib/ascender` | Where the queue spools. |
| `LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL` | `0` | Seconds between queue statistics; 0 turns them off. |
| `LOG_AGGREGATOR_RSYSLOGD_DEBUG` | `false` | Traces delivery (see [Debugging](#debugging)). |

`API_400_ERROR_LOG_FORMAT`, also in this category, words the
[API error records](#api-error-records).
`LOG_AGGREGATOR_INDIVIDUAL_FACTS` and `LOG_AGGREGATOR_ASCENDER_UUID` are
stored and shown but change nothing, as in the Python application, which
never read them either: facts are always sent as one object per host, and
`tower_uuid` is always `INSTALL_UUID`.

The error file for refused HTTP records is set by the environment variable
`ASCENDER_LOG_AGGREGATOR_ERROR_LOG_FILE`, not a setting.


### When changes take effect

No restart is needed. A saved change reaches every process at once (see
[Settings](settings.md#how-fast-changes-apply)), and each process applies
the destination the settings now describe as soon as its settings change,
and every 10 seconds regardless. The logging test applies the current
settings itself before it sends its message. Changes to the settings file
need a restart.

- A change to the loggers or the level applies to the records made from
  then on.
- A change to the host, port, protocol, type, credentials, certificate
  check, timeout or keepalive closes the connection and opens a new one.
  The queued records are kept and go to the new destination, in the format
  they were queued with.
- A change to the spool directory moves the queue there; what was queued
  (in memory or on disk) stays in the old directory, unsent.
- Disabling external logging (or clearing the host, or the port of a socket
  protocol) stops delivery and saves the queue to disk; it is sent when
  there is a destination again.


## Queueing and spooling

Each process has its own queue for the destination, so a slow or
unreachable aggregator never holds up a request or a job: whoever makes a
record never waits for it.

- The queue holds up to `LOG_AGGREGATOR_ACTION_QUEUE_SIZE` records in
  memory. From 75% of that, new records are written to disk instead, and
  they keep going to disk for as long as anything is there, so they stay in
  order.
- The disk part lives in `LOG_AGGREGATOR_MAX_DISK_USAGE_PATH`, in files of
  up to 100 MB named `ascender-external-logger-action-queue-web.<number>`
  (or `-task`), with the read position in `...-web.qi`. Each record is
  written to the file at once and synced to disk every 1000 records; the
  read position is saved every 1000 records sent, so after a crash up to
  that many may be sent twice. The queue may use up to
  `LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB` gigabytes on disk. Records still
  in memory when a process is killed are lost.
- When the records cannot go to disk (no usable directory, or the disk
  limit is reached) and the memory queue is 90% full, records whose syslog
  severity number is at least `LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY`
  are discarded. The levels' numbers are DEBUG 7, INFO 6, WARNING 4, ERROR 3
  and CRITICAL 2, so the default of 5 discards DEBUG and INFO records (job
  events, activity stream and lifecycle records among them), and 8 discards
  none.
- When the queue is full (memory at its size, and the disk unable to take
  more), a new record waits up to 2 seconds for room before it is
  discarded, as rsyslog's `queue.timeoutEnqueue` made it. It waits in
  front of the queue, not in the request or job that made it; records made
  meanwhile wait behind it, in order, up to 100,000 of them, and beyond
  that are discarded at once. Each one that gets no room within its 2
  seconds is discarded.
- Discarded records are counted (see [Queue statistics](#queue-statistics)),
  not logged.
- When the process stops, what is still in memory is written to the front
  of the disk queue, and the next start sends it first:
  `External log queue ascender-external-logger-action-queue-web: 12 record(s)
  spooled by an earlier run will be sent`.

The spool directory must be a directory the process can write to and enter.
If it is not, the queue uses `/var/lib/ascender`
(`Cannot spool external logs in <dir>, using /var/lib/ascender instead.`),
and if that is not usable either, the queue is kept in memory only and is
lost when the process stops. The published images create
`/var/lib/ascender`, and the compose file keeps it on a volume per container.

> **Note:** After a database from the Python application is upgraded, the
> queue files its rsyslog left in the spool directory
> (`ascender-external-logger-action-queue.*`, or the older
> `awx-external-logger-action-queue.*`) are not read. If there are any,
> each process says so when it starts shipping: `External log records spooled by the previous
> logging service are still in /var/lib/ascender and will not be sent:
> <files>. Deliver those files or remove them.` rsyslog drop-ins in
> `/var/lib/ascender/rsyslog/conf.d` are not read either.


## Queue statistics

When `LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL` is above 0 and external
logging is enabled, each process writes two JSON lines to its standard
output (the container log) every that many seconds; they are never sent to
the aggregator:

```
{"discarded.full":0,"discarded.nf":0,"enqueued":5321,"full":0,"maxqsize":118,"name":"ascender-external-logger-action-queue-task queue","ondisk":0,"origin":"core.queue","size":0}
{"failed":0,"name":"ascender-external-logger-action-queue-task","origin":"core.action","processed":5321,"resumed":1,"suspended":1,"suspended.duration":50}
```

`size` is the records queued now (`ondisk` of them on disk), `maxqsize` the
most there have been, `enqueued` the records queued since the process
started, `discarded.nf` those discarded by severity at 90%, `full` the
records that found the queue full and `discarded.full` those of them
discarded. `processed` counts records
delivered, `failed` records refused, `suspended` and `resumed` the outages
and `suspended.duration` their total length in seconds.


## Debugging

`LOG_AGGREGATOR_RSYSLOGD_DEBUG` makes the shipper report on standard error
every record it sends (`destination default: sent 1234 bytes`) and every
failed retry, not just the first. Turn it off again afterwards: it writes a
line per record.


## Testing the connection

```
POST /api/v2/settings/logging/test/
```

checks the saved settings. Only superusers may use it (others get `403`).

- If `LOG_AGGREGATOR_ENABLED` is off: `409` with
  `{"error": "Logging not enabled"}`.
- Otherwise an `ERROR` record with the message `Ascender Connection Test
  Message` is made on the logger of the first entry of
  `LOG_AGGREGATOR_LOGGERS` (`ascender` for the service logger, else
  `ascender.analytics.<entry>`), with the request's `guid`. It goes the way
  every record goes: through the filters (with `LOG_AGGREGATOR_LEVEL` at
  `CRITICAL`, or no loggers selected, it is not sent) and the queue, so a
  failure to deliver it is retried and reported like any other.
- For `https`, the answer is `202` with no body; the aggregator is not
  checked first.
- For `tcp`, `udp` and `relp`, a missing port gets `400` with
  `{"error": "Port required for tcp"}` (or `udp`, `relp`). Otherwise the
  endpoint connects to the host and port over IPv4 within half a second:
  `202` with no body when it can, else `400` with the reason in the words
  of the Python application's socket, for example
  `{"error": "[Errno 111] Connection refused"}`, `{"error": "timed out"}`,
  `{"error": "[Errno -2] Name or service not known"}`, or, for an IPv6
  address, `{"error": "[Errno -9] Address family for hostname not
  supported"}`. Connecting over UDP sends nothing and almost always
  succeeds, so it only shows that the host name resolves.


## API error records

Every API response with a status of 400 or more, the refusals, the
validation errors and the 404s, is logged by `ascender.api.generics` (at
`INFO` for a `401`, at `WARNING` otherwise), on the process's log and,
when `ascender` is selected, to the aggregator, with the request's `guid`.
An unexpected server error (a 500 the code did not choose) is logged as
the error it is instead. The message is `API_400_ERROR_LOG_FORMAT`, by
default:

```
status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}
```

which reads `status 404 received by user admin attempting to access
/api/v2/hosts/999/ from 192.0.2.7`. The variables are:

| Variable | Value |
|:---------|:------|
| `status_code` | The response's status. |
| `user_name` | The user's username, or `AnonymousUser`. `{user_name.username}`, `.id`, `.email`, `.first_name` and `.last_name` give the user's own fields. |
| `url_path` | The path, without the query string. |
| `remote_addr` | The first address among the `REMOTE_HOST_HEADERS` (custom `HTTP_` headers only from a `PROXY_IP_ALLOWED_LIST` proxy when that list is set), else `None`. |
| `error` | The response's own `error` value when it has one (each item's, joined with `, `, for a list), else the status's reason phrase (`Not Found`). |

The format is Python's `str.format`, so `{{` and `}}` are literal braces and
a field may carry a conversion and a format spec (`{status_code:>5}`,
`{url_path!r}`). A format that cannot be applied, such as one naming a
variable there is not, logs `Unable to format API_400_ERROR_LOG_FORMAT
setting, defaulting log message: 'name'` at `ERROR` and the default format
is used. The login and logout pages and the OAuth2 token endpoints are not
API views and log nothing of this kind.


## Example: Logstash

Logstash takes the records over TCP with the `json_lines` codec, one record
per line:

```
input {
    tcp {
        port => 5140
        codec => json_lines
    }
}
```

with `LOG_AGGREGATOR_TYPE` set to `logstash`, `LOG_AGGREGATOR_PROTOCOL` to
`tcp`, `LOG_AGGREGATOR_HOST` to `logs.example.com` and `LOG_AGGREGATOR_PORT`
to `5140`. Over HTTP, its `http` input parses the JSON body of each `POST`
by itself.
