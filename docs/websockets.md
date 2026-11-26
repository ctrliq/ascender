# Websockets

Ascender pushes live updates to the browser over a websocket: job status
changes, job events (the lines of job output), schedule and inventory changes,
and the notice that a session was ended because the user went over their
session limit. This document describes how a message gets from the process
that produces it to every client subscribed to it, and the protocol a client
speaks. It is an architectural overview, not a code walkthrough; the
implementation is in `src/internal/api/websocket.go`.

## Overview

```
ascender-task  (job status, job events, jobs-summary, scheduler pass)
      |
      |  SELECT pg_notify('ascender_websocket', ...)
      v
  PostgreSQL  ----- NOTIFY ----->  ascender-web replica 1:  LISTEN -> subscribers' sockets
      ^                       \--> ascender-web replica 2:  LISTEN -> subscribers' sockets
      |                        \-> ...
      |  SELECT pg_notify('ascender_websocket', ...)
      |
ascender-web   (API writes: launches, cancels, schedule saves, inventory deletes, logins)
```

PostgreSQL is the only channel between processes. Both `ascender-web` and
`ascender-task` publish with `pg_notify` on the channel `ascender_websocket`.
Every `ascender-web` process keeps one database connection listening on that
channel (`Server.ListenWebsocket`, started from `src/cmd/ascender-web/main.go`)
and hands each notification to the sockets connected to it that subscribe to
the notification's group. `ascender-task` publishes but never listens, and
holds no client sockets.

There is no relay daemon, no web-node heartbeat and no shared secret between
nodes. Because every web process receives every notification from the
database, a client gets the same messages whichever replica its socket
landed on, and web and task replicas can be added or removed without either
side knowing about the other.

The websocket is served by `ascender-web` itself, on the same port and by the
same HTTP server as the API and the UI.

## Publishing

Code that has something to announce calls one of the `Emit*` methods on
`api.Server` (`src/internal/api/websocket.go`); `ascender-task` holds its own
`api.Server` for this. Each method builds the message, and `publishNotice`
sends it with `pg_notify`. The notification payload is a small JSON envelope:

- `{"g": "<group>", "t": "<message text>"}` for a message whose text is
  complete, such as a status change;
- `{"g": "job_events-42", "e": {"table": "main_jobevent", "id": 123, "job_created": "..."}}`
  for a job event, which travels as a reference to its row (see below).

Running `LISTEN ascender_websocket;` in `psql` shows the traffic.

| Group | Published by | When |
| --- | --- | --- |
| `jobs-status_changed` | both | A unified job's status changes: `pending` when it is launched (web) or re-queued by the monitor (task), `waiting`, `running` and the finished status (task), `canceled` on a cancel through the API (web). |
| `workflow_events-<workflow job id>` | both | The same status message for a job a workflow spawned, sent to its workflow job's group. |
| `job_events-<id>`, `ad_hoc_command_events-<id>`, `project_update_events-<id>`, `inventory_update_events-<id>`, `system_job_events-<id>` | task | Each job event once it is stored. |
| `jobs-summary` | task | A job's events are all stored; carries `final_counter`. |
| `schedules-changed` | both | A schedule is saved through the API, or the scheduler pass in `ascender-task` changes its next run. |
| `inventories-status_changed` | web | An inventory is marked `pending_deletion`, and again when it is `deleted`. |
| `control-limit_reached_<user id>` | web | A login ended the user's oldest sessions because of `SESSIONS_PER_USER`. |

A `metrics` group also travels on the channel; it carries subsystem metrics
from `ascender-task` to the web processes and is never delivered to a client
(see [Subsystem Metrics](subsystem_metrics.md)).

### Job events travel by reference

A job event can be far larger than the 8000-byte limit PostgreSQL puts on a
`NOTIFY` payload, so `EmitEventDetail` publishes only the event's table, id
and `job_created`. A web process that has at least one socket subscribed to
the event's group reads the row back (`eventPayload`) and sends the full
message to those sockets; a web process with no such subscriber does not
query the database at all.

When the `UI_LIVE_UPDATES_ENABLED` setting is off, only the events the UI
needs to draw a summary are published: `playbook_on_play_start`,
`playbook_on_task_start` and `playbook_on_stats`.

### Event rate limit

The `MAX_WEBSOCKET_EVENT_RATE` setting (Settings > Jobs, default 30) caps how
many event messages a job sends a second, as the old callback did
(`wsThrottle` in `src/internal/tasks/ws_throttle.go`). Every kind of job is
limited: playbook jobs, ad hoc commands, project updates, inventory updates
(the runner's lines and the import log alike) and system jobs. The limit
applies to the websocket message only: every event is still stored and
appears in the job's output and the events API, which the output page reads
for the lines it has not shown.

Each run keeps the times of its last `MAX_WEBSOCKET_EVENT_RATE` messages,
reading the setting once when the run starts; a resumed read of a run starts
a fresh window. The decision is made when the event arrives from the
runner, not when it is stored:

- The run's first event is sent, whatever it is.
- `playbook_on_play_start`, `playbook_on_task_start` and
  `playbook_on_stats` are always sent, and count toward the rate.
- An event with no output (empty `stdout` and `start_line` equal to
  `end_line`) is never sent.
- Any other event is sent when fewer than `MAX_WEBSOCKET_EVENT_RATE`
  messages have gone out yet, when the oldest of the last
  `MAX_WEBSOCKET_EVENT_RATE` went out more than a second ago, or when the
  last went out more than 1/`MAX_WEBSOCKET_EVENT_RATE` seconds ago.
- An event held back is not sent later; nothing replaces it.

`0` turns the limit off: every event is sent, events with no output
included. A replayed event that a resumed read finds stored already is
neither sent nor counted. `UI_LIVE_UPDATES_ENABLED` applies after the rate
limit, so with it off only the summary events above go out, and those the
limit let through. The `callback_receiver_events_broadcast` metric leaves
out the events the limit held back.

### Delivery guarantees

Delivery is best effort, as it was in the old implementation:

- A message whose envelope exceeds 7900 bytes is dropped and a warning is
  logged. Only messages with complete text can reach that size; job events
  never do.
- If a web process loses its listening connection it acquires a new one
  (retrying every five seconds while the database is unreachable).
  Notifications sent in the meantime are not replayed to its clients.
- A job event whose row cannot be read back is skipped.

Failures to publish are logged under the `broadcast_websocket` logger
(`ascender.analytics.broadcast_websocket`), which `LOG_AGGREGATOR_LOGGERS` can
send to an external log aggregator.

`LISTEN` needs a session-level database connection, so each `ascender-web`
holds one pool connection for as long as it runs. A connection pooler in
transaction mode between Ascender and PostgreSQL breaks it.

## Protocol

### Connecting

Open a websocket to `/websocket/` (`/api/websocket/` is the same endpoint).
A plain HTTP request to either path gets a 404.

The upgrade request is authenticated the way the API authenticates any
request:

- the session cookie (`ASCENDER_SESSION_COOKIE_NAME`, default
  `ascender_sessionid`), as a browser sends it;
- `Authorization: Bearer <token>` with an OAuth2 token;
- `Authorization: Basic ...` when `AUTH_BASIC_ENABLED` is on.

A token in the URL is not accepted.

A session-authenticated upgrade sent from a page on another site is treated
as unauthenticated: a browser attaches the session cookie to a cross-site
websocket. The request is cross-site when `Sec-Fetch-Site` says so or the
`Origin` host differs from the `Host`, unless the origin is listed in the
`CSRF_TRUSTED_ORIGINS` setting or the `ASCENDER_CSRF_TRUSTED_ORIGINS`
environment variable. Token and basic authentication are not origin-checked.

An authenticated connection is accepted and the server sends:

```json
{"accept": true, "user": 1}
```

A connection with no recognised user is accepted, sent `{"close": true}`, and
closed with code 1000. Credentials the API rejects outright, such as the token
of an inactive user, get the API's error response instead of an upgrade.

The user is checked once, when the socket opens. Logging out or losing access
later does not close an open socket.

### Subscribing

Once connected, a client is not subscribed to anything. It subscribes by
sending a JSON object with an `xrftoken` and a `groups` object:

```json
{
  "xrftoken": "<value of the CSRF cookie>",
  "groups": {
    "jobs": ["status_changed", "summary"],
    "schedules": ["changed"],
    "inventories": ["status_changed"],
    "job_events": [42],
    "workflow_events": [17],
    "ad_hoc_command_events": [ids...],
    "project_update_events": [ids...],
    "inventory_update_events": [ids...],
    "system_job_events": [ids...],
    "control": ["limit_reached_<user_id>"]
  }
}
```

`xrftoken` must equal the CSRF cookie (`ASCENDER_CSRF_COOKIE_NAME`, default
`csrftoken`) that came with the upgrade request. Every message is checked; on
a mismatch, or when the upgrade carried no CSRF cookie, the server answers
`{"error": "access denied to channel"}` and ignores the message. A
token-authenticated client must therefore send a CSRF cookie with the upgrade
too, and echo its value.

Each key of `groups` and each item of its list form one group name,
`<key>-<item>`: `"jobs": ["status_changed"]` subscribes to
`jobs-status_changed`, and `"job_events": [42]` to `job_events-42`.

Sending a new `groups` object replaces the previous subscription: groups not
named again are left and new ones joined. This is intentional, and suits a
single-page UI, which only needs to name what the current page wants. The
server replies with the result:

```json
{"groups_current": ["jobs-status_changed", "job_events-42"], "groups_left": [], "groups_joined": ["job_events-42"]}
```

A message with an `xrftoken` but no `groups` key is accepted and does nothing.

### Access checks

The event groups are checked per id when subscribing:

| Group | Each id must be |
| --- | --- |
| `job_events` | a job |
| `workflow_events` | a workflow job |
| `ad_hoc_command_events` | an ad hoc command |
| `project_update_events` | a project update |
| `inventory_update_events` | an inventory update |
| `system_job_events` | a system job |

and the user must be able to see it, which is the same check as the job
appearing in the user's `/api/v2/unified_jobs/` list. An id that fails is
skipped with `{"error": "access denied to channel <group> for resource id <id>"}`,
and the rest of the subscription goes ahead. Any other group name ending in
`_events` is refused the same way.

The other groups (`jobs`, `schedules`, `inventories`, `control`) are not
checked. A group name nothing publishes to is accepted and never receives
anything.

### Errors that close the socket

| Close code | Cause |
| --- | --- |
| 1008 | The user already holds 64 open sockets on this web process (the client gets `{"close": true}` first). |
| 1009 | A client message larger than 1 MiB. |
| 1002 | A protocol error: an unknown opcode, or a control frame that is fragmented or longer than 125 bytes. |
| 1011 | A text message that is not a JSON object, a `groups` value that is not an object, or an event id that is not an integer. |

A `groups` entry whose value is not a list is answered with
`{"error": "access denied to channel"}` and the whole message is ignored.
Binary messages are ignored.

### Keepalive and slow clients

The server pings every 30 seconds; browsers answer automatically. A
connection from which nothing (data, pong or ping) arrives for 75 seconds is
closed. A client that stops reading is disconnected once more than 8 MiB, or
512 messages, are waiting to be written to it.

### Messages

Every message carries `group_name`, the part of the group before the first
`-`, which tells a client subscribed to several groups which one it came
from.

`jobs-status_changed`, and the same message on `workflow_events-<id>`:

```json
{"unified_job_id": 42, "status": "running", "instance_group_name": "default", "type": "job", "group_name": "jobs", "unified_job_template_id": 7}
```

`instance_group_name` is present only for `running`, and `finished` only for
`successful`, `failed` and `canceled`. A job spawned by a workflow adds
`workflow_job_id` and `workflow_node_id`. A project update adds
`project_id`; an inventory update adds `inventory_source_id` and, when its
source has an inventory, `inventory_id`. On `workflow_events-<id>` the
`group_name` is `workflow_events` and `workflow_job_template_id` is the
spawned job's own template.

`jobs-summary`: `{"group_name": "jobs", "unified_job_id": 42, "final_counter": 118}`.

`schedules-changed`: `{"id": 3, "group_name": "schedules"}`.

`inventories-status_changed`: `{"group_name": "inventories", "inventory_id": 5, "status": "deleted"}`.

`control-limit_reached_<user id>`: `{"group_name": "control", "reason": "limit_reached"}`.

Job events carry `id`, the job's id under `job`, `ad_hoc_command`,
`project_update`, `inventory_update` or `system_job`, `created`, `modified`,
`group_name`, `url` (set for job and ad hoc command events, empty otherwise),
`stdout`, `counter`, `uuid`, `parent_uuid`, `start_line`, `end_line`, `event`,
`event_data`, `failed`, `changed`, `event_level`, `play`, `role` and `task`,
with the same values the old implementation sent.

## Differences from the old implementation

The client protocol, the replies and the message bodies are the same. A
client or operator may notice the following:

- Relay: Django Channels, Daphne, the per-pod Valkey, `wsrelay`, the
  `/websocket/relay/` endpoint and the web heartbeat are gone, replaced by
  PostgreSQL `NOTIFY`. The `BROADCAST_WEBSOCKET_*` settings are not read.
- A session-authenticated connection from another origin gets no user.
- A user can hold at most 64 sockets per web process.
- The server pings idle connections and closes ones that stop answering.
- The Ascender UI opens a websocket on the output page of a running job
  (not of a workflow job), where it subscribes to the job's events and to
  `jobs-status_changed` and `jobs-summary`, and on the lists whose rows show
  job state: projects, templates (job and workflow job templates, on their
  own page and in other resources' tabs), jobs, inventories and an
  inventory's sources. There it subscribes to `jobs-status_changed` and
  `inventories-status_changed`. A message about a row on the page (a
  project, template or inventory source by `unified_job_template_id`, a job
  by `unified_job_id`, an inventory by `inventory_id`) has the page fetched
  again, at most once a second and not while the browser tab is hidden. The
  row's status, activity, last-ran, revision, start and finish time and
  action cells are then replaced with the new render's. On the first page of
  a jobs list, a message about a job not on the page has it fetched again
  too, and the rows take the new render's order: rows already shown are
  kept, with their selection and expansion, a newly listed job's row is
  inserted and rows pushed off the page are removed. A selected row is
  never removed; the rows wait for a render that still lists it. The item
  count in the pagination is not updated.
