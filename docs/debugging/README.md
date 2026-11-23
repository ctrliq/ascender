Debugging Ascender
==================

This folder describes the tools Ascender offers for finding out what it is
doing and why it is slow:

* [Slow API Requests and Pages](slow_api.md): the timing headers,
  `ASCENDER_SQL_DEBUG`, `EXPLAIN`, and reproducing a slow list with scale
  data.
* [Job Event Delays](job_events.md): the path a job event takes from Ansible
  to the browser, how to measure each part, and where it slows down.

The rest of this page covers the logs, the debug settings, profiling and
attaching a debugger.


Logs
----

Both processes, `ascender-web` and `ascender-task`, write their log to
standard output, one line per record in Go's `log/slog` text format (the
job lifecycle records, below, excepted):

```
time=2026-11-21T09:30:14.020Z level=INFO msg="ascender-web listening" addr=:8070 version=26.0.0-go.dev
```

Run on the host (`make run-web`, `make run-task`), the log is the terminal's.
In the compose stack, `make logs` follows both containers (`SERVICES=web` or
`SERVICES=task` limits it to one). The processes write no log files, apart
from the external log queue's spool and error file (see
[Logging Integration](../logging_integration.md)).

`ASCENDER_LOG_LEVEL` sets the least severe level both processes write:
`debug`, `info` (the default), `warn` or `error`; any other value means
`info`. Each process reads the variable once, at start. Run on the host it can
be given on the command line, `make run-web ASCENDER_LOG_LEVEL=debug` (or
`make run-task ...`); in the compose stack it goes in the service's
`environment` in `deploy/docker-compose.yml`, so the two containers can be
given different levels.

An API request that panics is logged as `request panicked`, a UI page as
`panic`, both with the path and the stack, and answered with a 500. A pass of
`ascender-task` that panics is logged as `<pass> panicked` with the stack,
and the process goes on.

The job lifecycle records (`job_lifecycle`), one for each step a job goes
through, from `created` to `notifications_sent`, with the controller and
execution node chosen, are written to standard output too, in the same slog
format as the other lines, as long as `ASCENDER_LOG_LEVEL` lets `info`
through:

```
time=2026-11-21T09:30:14.020-06:00 level=INFO msg="job-42 running playbook" logger=ascender.analytics.job_lifecycle type=job task_id=42 state=running_playbook task_name=Deploy guid=8e1c6a0b2f4d4e7a9c3b5d1f0a2e4c6b
```

`make logs SERVICES=task | grep job_lifecycle` follows a job through the task
process (its `created` record is in the web process's output). See
[Logging Integration](../logging_integration.md#in-the-process-output).

Some records are not written to standard output at all; they only go to an
external log aggregator (see [Logging Integration](../logging_integration.md)):

* the performance records (`performance`): one per API request, with its
  timing headers;
* the job event and activity stream records, whose content the API also
  serves.

To read them on a development machine, run anything that accepts TCP, such
as `nc -lk 5140`, where both processes can reach it, and point the logging
settings at it:

```
PATCH /api/v2/settings/logging/

{
    "LOG_AGGREGATOR_ENABLED": true,
    "LOG_AGGREGATOR_TYPE": "other",
    "LOG_AGGREGATOR_PROTOCOL": "tcp",
    "LOG_AGGREGATOR_HOST": "<that host>",
    "LOG_AGGREGATOR_PORT": 5140,
    "LOG_AGGREGATOR_LOGGERS": ["job_lifecycle"]
}
```

Each record arrives as one line of JSON. With `LOG_AGGREGATOR_LEVEL` set to
`DEBUG` (and `performance` and `ascender` in `LOG_AGGREGATOR_LOGGERS`), the
performance records and the `debug` messages of both processes are sent too,
whatever level each writes to standard output.


Debug settings
--------------

The `debug` settings category (`/api/v2/settings/debug/`, shown in the UI
under Settings > Troubleshooting) holds two settings:

| Setting | Default | Effect |
| --- | --- | --- |
| `ASCENDER_CLEANUP_PATHS` | on | Off keeps each job's private data directory after the run. See [Ansible Runner Integration](../ansible_runner_integration.md#debugging). |
| `RECEPTOR_RELEASE_WORK` | on | Off leaves finished receptor work units unreleased and the pods of container group jobs in place. See [Ansible Runner Integration](../ansible_runner_integration.md#debugging). |

Turn both back on when done: what they keep holds credentials, and
nothing cleans it up while they are off.

For a job that fails or stays pending, start with the job itself:
`job_explanation` and `result_traceback` say why it failed or what it waits
for, and `job_args`, `job_cwd` and `job_env` show what was run. The task
manager's reasons for keeping a job pending are described in
[Task Manager System](../task_manager_system.md).


Profiling
---------

Neither process serves a profiling or debug endpoint: there is no
`net/http/pprof`, no `expvar` and no runtime trace endpoint. What can be
measured on a running installation is:

* the timing headers of every API response and, with `ASCENDER_SQL_DEBUG`,
  the statement count and time of every request and UI page
  ([Slow API Requests and Pages](slow_api.md));
* the event writer's counters and the database gauges at `/api/v2/metrics/`
  ([Subsystem Metrics](../subsystem_metrics.md)).

To profile a code path, exercise it from a Go test and run the package's tests
with `go test -cpuprofile cpu.out -run <test> ./internal/<package>`, then read
the profile with `go tool pprof`.

The old application's `awx-manage profile_sql` and `graph_jobs` commands, its
`@profile` and `@timing` decorators, the Django Debug Toolbar and the `sdb`
remote debugger have no equivalent.


Attaching a debugger
--------------------

The processes are ordinary Go programs, so [Delve](https://github.com/go-delve/delve)
(`dlv`) or an editor built on it can run them. `make -n run-web` and
`make -n run-task` print the command each target runs: run the same from
`src/` with `dlv debug ./cmd/ascender-web` (or `./cmd/ascender-task`) in
place of `go run`. The Makefile exports `ASCENDER_DB_PASSWORD` rather than
putting it on the command line, so a command run by hand needs it, and
`ASCENDER_SECRET_KEY_FILE`, in its own environment:

```
cd src
export ASCENDER_DB_PASSWORD=... ASCENDER_SECRET_KEY_FILE=...
ASCENDER_DB_HOST=localhost ASCENDER_DB_PORT=5442 ASCENDER_DB_SSLMODE=disable \
ASCENDER_STATIC_DIR=web/static ASCENDER_TEMPLATE_DIR=web/templates \
dlv debug ./cmd/ascender-web
```

To attach to a process that is already running instead, build it without
optimizations, so that variables are not optimized away, run that binary,
and attach to its process id:

```
go build -gcflags='all=-N -l' -o ../bin/ascender-web-debug ./cmd/ascender-web
dlv attach <pid>
```

While debugging, keep in mind:

* Templates that users write (notification messages, credential type
  injectors, workflow approval contexts) are rendered in a child process of
  the same binary
  (`src/internal/jinjarun`). A breakpoint in that code is not hit in the
  process the debugger holds.
* A paused `ascender-task` runs no heartbeat. Other nodes treat its node as
  lost once its last heartbeat is more than 120 seconds old (see
  [Clustering](../clustering.md)), and the jobs it monitors become
  candidates for another node once their monitor leases expire (see
  [Job Monitor Lease](../job_monitor_lease.md)).
* A paused `ascender-web` stops reading its `LISTEN` connection, and
  PostgreSQL holds the websocket notifications for it meanwhile (see
  [Websockets](../websockets.md)).
* Playbooks run in execution environment containers, outside the Go
  processes. What goes in and out of them is described in
  [Ansible Runner Integration](../ansible_runner_integration.md#debugging).
