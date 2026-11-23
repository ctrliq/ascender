# Slow API Requests and Pages

A request's time is spent in four places: waiting for a database connection,
running SQL statements, Go code (permission checks, building the response,
rendering a page), and the network. The cause is usually the database:
undersized hardware or storage, one expensive statement, or many fast
statements that add up (a list that loads a summary field per row, say). Row
lock contention comes up occasionally. The tools below tell these apart.


## Timing headers

Every API response carries:

| Header | Meaning |
| --- | --- |
| `X-API-Total-Time` | Seconds from the request entering the API middleware to the response's headers being written, such as `0.042s`. |
| `X-API-Time` | The same value. The old application measured it at a different point of its middleware stack; Go measures both at the same moment. |
| `X-API-Node` | `ASCENDER_CLUSTER_HOST_ID` of the `ascender-web` process that answered. |
| `X-API-Request-Id` | The request's id, which the SQL log below and the external log records carry. |

The time ends when the headers go out, so a long body that is streamed
afterwards (a stdout download) is not included. UI pages carry no timing
headers unless SQL debugging is on.

```
curl -s -o /dev/null -D - -H "Authorization: Bearer $TOKEN" \
    'https://ascender.example.com/api/v2/hosts/?page_size=200' | grep -i '^x-api'
```

With an external log aggregator, the `performance` logger sends the same
headers for every request (see
[Logging Integration](../logging_integration.md#performance-records)).


## SQL debugging: `ASCENDER_SQL_DEBUG`

`ASCENDER_SQL_DEBUG` is an environment variable of `ascender-web`, read at
start (`src/internal/config/config.go`); `ascender-task` ignores it.

* `1` adds two headers to every API response and UI page:
  `X-API-Query-Count`, the number of statements run for it, and
  `X-API-Query-Time`, the time spent on them. A UI page's numbers include
  every API call it made in-process, and the page also gets
  `X-API-Total-Time`.
* `2` adds the headers and also logs every statement, at `info`, on
  standard output:

  ```
  time=2026-11-21T09:30:14.020Z level=INFO msg=sql request=9f2c4be1a07d4e3c8b5a6f1d2e3c4b5a ms=1.234 rows=20 sql="SELECT ... WHERE inventory_id = $1"
  ```

  `request` is the API request's `X-API-Request-Id`, or the path of a UI
  page. `ms` is the statement's time, `rows` the rows it returned or changed.
  The statement is logged as it was sent, with `$1`, `$2`, ... placeholders;
  the argument values are not logged.

Run on the host, give it on the command line:

```
make run-web ASCENDER_SQL_DEBUG=2
```

In the compose stack, add it to the `web` service's `environment` in
`deploy/docker-compose.yml`. Turn it off afterwards. Level `2` writes a
line per statement, and when external logging is on with the `ascender`
logger selected, every one of those lines is also sent to the aggregator.

Statement time is measured from sending the statement until its results have
been read (`src/internal/db/trace.go`). Reading the headers together:

| Total time | Query time | Query count | Likely cause |
| --- | --- | --- | --- |
| high | high | high | Many small statements. Look in the level `2` log for one statement repeated per row. |
| high | high | low | One or a few expensive statements. Find them in the log and `EXPLAIN` them (below). |
| high | low | any | Time outside the statements: Go code, rendering, the network, or waiting for a database connection. |

Waiting for a connection is not query time. Each process holds at most
`ASCENDER_DB_MAX_CONNS` connections (default 20); under concurrent load,
requests queue for them, and the total time grows while the query time does
not.


## `EXPLAIN`

Take a slow statement from the level `2` log and run it under `EXPLAIN` in
`psql` against the same database. In the compose stack:

```
docker exec -it ascender_postgres psql -d ascender
```

Since the logged statement has placeholders, prepare it and execute it with
the values the request used (the ids in its path, its filter values):

```sql
PREPARE q AS SELECT ... WHERE inventory_id = $1 ...;
EXPLAIN (ANALYZE, BUFFERS) EXECUTE q(42);
DEALLOCATE q;
```

If PostgreSQL cannot infer a parameter's type, name the types:
`PREPARE q(bigint, text) AS ...`. `EXPLAIN ANALYZE` runs the statement, so
wrap one that writes in `BEGIN; ... ROLLBACK;`. Look for sequential scans of
large tables, row estimates far from the actual rows, and nested loops that
run an inner scan once per outer row.

Event tables are partitioned by the job's `created` time. A statement that
filters on `job_created` as well as the job's id reads one partition; one
that does not reads them all. The API's event lists and counts always filter
on both.


## PostgreSQL's view

PostgreSQL can find slow statements from all processes, `ascender-task`
included:

* `log_min_duration_statement = 500` (milliseconds) logs every statement that
  takes longer. The `auto_explain` module can log their plans as well, and
  `pg_stat_statements` totals time per statement.
* Ascender sets no `application_name` on its connections. Set the standard
  `PGAPPNAME` environment variable for each process (for example
  `PGAPPNAME=ascender-web`), or add `application_name=...` to
  `ASCENDER_DATABASE_URL`, and `%a` in `log_line_prefix` and the
  `application_name` column of `pg_stat_activity` show which process sent
  a statement.
* Statements running for more than a minute right now:

  ```sql
  SELECT now() - query_start AS duration, application_name, state, query
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - query_start > interval '1 minute';
  ```

`ASCENDER_DB_STATEMENT_TIMEOUT` (seconds, unset by default) has PostgreSQL
cancel any statement that runs longer. A canceled statement fails with
`canceling statement due to statement timeout`, and an API request answers
with an error. It suits the web process, where a request's filters decide the
work; migrations lift it for themselves.


## Indexes Ascender adds

Beyond the schema the old application left, Ascender's own migrations
(`src/internal/db/migrations/`) add indexes for the slowest lists: the recent
jobs of each template, jobs per execution node, and trigram indexes for
`?search=` on host and job names and descriptions. A starting server applies
pending migrations in the background and serves meanwhile, so on a large
database a list can stay slow until its index has been built.
`ascender-web migrate` (`make migrate`) applies them and waits.
`SELECT * FROM ascender_migrations` lists the ones applied.

The trigram migration needs the `pg_trgm` extension. Where it cannot be
created, the migration is skipped and tried again at the next start, and
searches work without it, more slowly.


## Reproducing a slow list at scale

`make perf-seed` (`src/cmd/zz-perfseed`) fills a database with scale data,
so a list that is slow on a large installation can be reproduced and
measured on a development machine. It refuses any database whose name does
not end in `_perf`.

1. Make a copy of a working database under a name ending in `_perf`, for
   example `ascender_perf`, with `pg_dump` and `psql`, or with
   `CREATE DATABASE ascender_perf TEMPLATE ascender` while nothing is
   connected to `ascender`.
2. Seed it:

   ```
   make perf-seed ASCENDER_DB_NAME=ascender_perf
   ```

   It creates the users `zz-perf-admin` (a superuser), `zz-perf-user` and
   1000 `zz-perf-u*` users, 20 organizations with teams, projects,
   credentials and inventories (48,000 hosts), 2,000 job templates (each
   team may run a fifth of its organization's), 400 workflow job templates,
   200,000 finished jobs, 40 events on each of the latest 5,000 jobs, and 100,000 activity
   stream entries; then it runs `ANALYZE`. The users' password is
   `ASCENDER_PERF_PASSWORD`, or a random one it prints; users that exist
   keep theirs. A second run skips what it finds already seeded.
3. Serve it and measure:

   ```
   make run-web ASCENDER_DB_NAME=ascender_perf ASCENDER_SQL_DEBUG=1
   ```

   Compare the same list as `zz-perf-admin` and as `zz-perf-user`, who is a
   member of the first five organizations and of two teams in each: a
   superuser skips the permission filtering that a plain user's lists go
   through.

`ascender-task` is not needed for this; leave it running against the real
database only.
