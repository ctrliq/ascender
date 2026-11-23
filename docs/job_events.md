# Ansible Callback and Job Events

Ansible has no concept of a job event. Job events are JSON structures that
the `awx_display` stdout callback plugin produces each time Ansible calls one
of its hooks (`v2_playbook_on_task_start`, `v2_runner_on_ok`, and so on). An
event carries data from the hook's parameters plus UUIDs that tie it to other
events. There is usually a one-to-one relationship between an event and a
callback hook call.

The plugin is ansible-runner's (`ansible_runner/display_callback/callback/awx_display.py`),
taken from the execution environment the job runs in. Ascender does not ship
its own copy; see [Ansible Runner Integration](ansible_runner_integration.md)
for how it is installed and how its output becomes events.


## Job Event Relationships

Events form a strict hierarchy through their `uuid` and `parent_uuid`. The
plugin sets `parent_uuid` to the event's task, else its play, else the
playbook.

* There is always exactly one `playbook_on_start` event, and it is the first.
* `playbook_on_play_start` is created once per play; its parent is the
  playbook. The playbook below produces two.
* `playbook_on_task_start` is created when a task starts; its parent is the
  play. Under the default (linear) strategy the hook is called once per task.
  Other strategies, such as `free`, can call it again for the same task. Each
  repeated call creates another `playbook_on_task_start` event whose `uuid`
  is the task's UUID with `_2`, `_3`, ... appended. Host results always point
  at the task's own UUID, so the repeated events have no children.
* `runner_on_start`, `runner_on_ok`, `runner_on_failed`, `runner_on_skipped`,
  `runner_on_unreachable`, `runner_retry`, `runner_item_on_ok`,
  `runner_item_on_failed`, `runner_item_on_skipped`, the `runner_on_async_*`
  events and `runner_on_file_diff` are created per host (and per loop item for
  the `runner_item_*` events); their parent is the task.
* `playbook_on_stats` closes the run; its parent is the playbook.
* Output that is not inside any event, such as `-vvv` connection debugging,
  becomes `verbose` events. Messages Ansible prints through its `Display`
  warning and error methods become `warning`, `deprecated`,
  `system_warning`, `error` or `debug` events.

For ad hoc commands the plugin emits no `playbook_on_play_start` or
`playbook_on_task_start` events.


## Example

Below is an example inventory and playbook outline, along with the job events
generated and their hierarchical relationship:

```
# inventory
[tower]
hostA
hostB

[postgres]
hostC
```

```
# main.yml
---
- hosts: all
  name: preflight
  tasks:
    - name: check_space_requirements
      ...
    - name: check_ram
      ...
    - name: check_umask
      ...

- hosts: all
  name: install
  tasks:
    - name: install_tower
      ...
      when: inventory_hostname in ['A', 'B']
    - name: install_postgres
      ...
      when: inventory_hostname == 'C'
```

Below is how the job events are related (the `runner_on_start` events each
host also produces under its task are left out):

```
`-- playbook_on_start
    |-- playbook_on_play_start-preflight
    |   |-- playbook_on_task_start-check_space_requirements
    |   |   |-- runner_on_ok_hostA
    |   |   |-- runner_on_ok_hostB
    |   |   `-- runner_on_ok_hostC
    |   |-- playbook_on_task_start-check_ram
    |   |   |-- runner_on_ok_hostA
    |   |   |-- runner_on_ok_hostB
    |   |   `-- runner_on_ok_hostC
    |   `-- playbook_on_task_start-check_umask
    |       |-- runner_on_ok_hostA
    |       |-- runner_on_ok_hostB
    |       `-- runner_on_ok_hostC
    |-- playbook_on_play_start-install
    |   |-- playbook_on_task_start-install_tower
    |   |   |-- runner_on_ok_hostA
    |   |   `-- runner_on_ok_hostB
    |   `-- playbook_on_task_start-install_postgres
    |       `-- runner_on_ok_hostC
    `-- playbook_on_stats
```


## Job Event Creation Patterns

The execution strategy determines the order in which events are created. The
hierarchy above is also the creation order under the default strategy: every
`runner_on_*` event of a task is created before the next
`playbook_on_task_start`.

Under the `free` strategy, `runner_on_*` events can be created **after** the
`playbook_on_task_start` of a later task. The same playbook might produce:

```
playbook_on_start
playbook_on_play_start-preflight
  playbook_on_task_start-check_space_requirements
    runner_on_ok_hostA (check_space_requirements)
  playbook_on_task_start-check_ram
    runner_on_ok_hostA (check_ram)
    runner_on_ok_hostC (check_space_requirements)
    runner_on_ok_hostC (check_ram)
  playbook_on_task_start-check_umask
    runner_on_ok_hostB (check_ram)
    runner_on_ok_hostC (check_umask)
    runner_on_ok_hostA (check_umask)
    runner_on_ok_hostB (check_space_requirements)
    runner_on_ok_hostB (check_umask)
playbook_on_play_start-install
  playbook_on_task_start-install_tower
    runner_on_ok_hostB (install_tower)
  playbook_on_task_start-install_postgres
    runner_on_ok_hostC (install_postgres)
    runner_on_ok_hostA (install_tower)
playbook_on_stats
```

`counter` is the order in which events appeared in the output, and `start_line` /
`end_line` place each event's `stdout` in the job's output. Neither follows
the hierarchy.


## From the callback to the database

Events are saved by the `ascender-task` process that runs the job. There is
no separate callback receiver and no message queue.

1. The event arrives as a `runnerEvent`: either from the local output filter
   (`src/internal/tasks/runner.go`, `outputEventFilter`) or from the
   `ansible-runner worker` stream of an execution node or container group pod
   (`processWorkerStream` in `src/internal/tasks/container_group.go`).
2. `jobEventSink.handle` (`src/internal/tasks/job_events.go`) turns it into a
   row:
   - `host_id` comes from the inventory host map built when the job's
     inventory was written; `host_name` from `event_data.host`.
   - `failed` is set for `runner_on_failed`, `runner_on_error`,
     `runner_on_unreachable`, `runner_on_async_failed`, `runner_item_on_failed`
     and `error`, unless `ignore_errors` is set (ad hoc commands: only
     `runner_on_failed` and `runner_on_unreachable`). `changed` is set when
     `res.changed` is true. For `playbook_on_stats`, `failed` and `changed`
     come from the stats' `failures`/`dark` and `changed` counts.
   - `playbook`, `play`, `task` and `role` are copied from `event_data`,
     truncated to 1024 characters.
   - `event_data` is stored with its keys in the order the plugin wrote them,
     plus the task's `guid` (`src/internal/tasks/event_data.go`).
   - For project updates, URLs with credentials are redacted from
     `event_data` and `stdout` before anything is stored or broadcast.
3. Rows are written twice a second in one batch per flush, with
   `INSERT ... ON CONFLICT DO NOTHING` (`saveEvents` in
   `src/internal/tasks/event_save.go`). If the batch fails, events are retried
   one at a time so that one bad event does not lose the others; NUL
   characters are removed from `stdout` after the first failure, and an event
   that still fails after three tries is dropped and logged. A batch that
   failed because the database was unreachable is kept whole for the next
   flush.
4. After a row is saved, a reference to it is sent with `pg_notify`;
   `ascender-web` reads the row back and sends it to websocket subscribers
   (`EmitEventDetail` in `src/internal/api/websocket.go`), unless the
   `MAX_WEBSOCKET_EVENT_RATE` limit held the event back when it arrived (see
   [Websockets](websockets.md#event-rate-limit)). With
   `UI_LIVE_UPDATES_ENABLED` off, only `playbook_on_play_start`,
   `playbook_on_task_start` and `playbook_on_stats` are broadcast.
5. When the `playbook_on_stats` row is saved, the sink writes
   `main_jobhostsummary` rows, updates `main_hostmetric` and the inventory's
   computed fields, marks the direct parents of changed or failed events as
   changed or failed, and stores the job's `host_status_counts` (`onStats`).
   For ad hoc commands and project updates it stores only
   `host_status_counts`.
6. `set_stats` artifacts (`event_data.artifact_data`) and, unless
   `ASCENDER_AUTO_STATS_ENABLED` is off, the automatic `ascender_stats_*` keys
   become the job's `artifacts`.
7. When the run ends, the job's `emitted_events` is set to the number of
   events, and a `jobs-summary` websocket message carries that count as
   `final_counter`.

Event tables (`main_jobevent`, `main_adhoccommandevent`,
`main_projectupdateevent`, `main_inventoryupdateevent`, `main_systemjobevent`)
are partitioned by the job's `created` time, and each has a unique constraint
on `(<job>, job_created, counter)`. The constraint is what lets a job whose
output is read again after a controller restart replay its events without
duplicating them (see [Job Monitor Lease](job_monitor_lease.md)).

The plugin itself limits what an event carries: a `res` larger than
`MAX_EVENT_RES` characters is replaced by `{}` (except in
`playbook_on_stats`). Ascender sets `MAX_EVENT_RES` to 25,000,000 for
playbook jobs; other runs use the plugin's default of 700,000. Results of
tasks with `no_log` are replaced by `{"censored": ...}`.


## Reading events

- `GET /api/v2/jobs/<id>/job_events/` lists a job's events, ordered by
  `start_line` by default. `stdout` is truncated to
  `EVENT_STDOUT_MAX_BYTES_DISPLAY` bytes (default 1024) except for
  `playbook_on_*` events and when `no_truncate` is given.
- `GET /api/v2/job_events/<id>/children/` lists the events whose
  `parent_uuid` is that event's `uuid`.
- `GET /api/v2/jobs/<id>/job_events/children_summary/` returns, once the job
  has finished and all `emitted_events` rows are stored
  (`event_processing_finished`), each parent event's row number and number of
  descendants, which the UI uses to collapse the output tree.
- `/api/v2/jobs/<id>/stdout/` is assembled from the events' `stdout`.

These are implemented in `src/internal/api/jobs.go`; the HTML stdout renderer
is `src/internal/api/stdout_html.go`.


## Testing

The old application's `awx-manage replay_job_events` command and the UI's
`_debug` replay mode are not implemented.


## Code References

* Event types, display names and levels: `eventTypes` in
  `src/internal/api/project_updates.go`.
* Event filter and partial-file merge: `src/internal/tasks/runner.go`.
* Worker stream: `processWorkerStream` in `src/internal/tasks/container_group.go`.
* Event storage and the stats wrap-up: `src/internal/tasks/job_events.go`,
  `src/internal/tasks/event_save.go`, `src/internal/tasks/event_data.go`.
