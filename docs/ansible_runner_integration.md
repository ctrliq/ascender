# Ansible Runner Integration

`ascender-task` runs Ansible without the ansible-runner Python library. The
parts of ansible-runner that the old task system used on the controller (the
private data directory layout, the containerized command line, answering
password prompts, and turning the callback plugin's output into events) are
reimplemented in Go in `src/internal/tasks/runner.go`, and the directory
looks the way ansible-runner left it. ansible-runner is still used in two
places, both inside the execution environment image:

- its `awx_display` callback plugin, which produces the job events;
- `ansible-runner worker`, which runs a job sent to an execution node, a
  container group pod, or (on Kubernetes) the receptor beside the control
  node.

The run types (`jobRun`, `invUpdateRun`, `puRun`) share `baseRun` in
`src/internal/tasks/run_base.go`, which covers what `BaseTask` did in the
old application: the private data directory, the execution environment
parameters, and mapping the runner's status to the job's.


## Where a run goes

| The run | How it is started | Code |
|---|---|---|
| On the node of the `ascender-task` that claimed it | `podman run` or `docker run` on a pseudo-terminal, started by `ascender-task` itself | `runnerConfig.run` in `runner.go` |
| On an execution node | a receptor work unit of type `ansible-runner`; `ansible-runner worker` runs the execution environment there with podman | `runRemote` in `receptor_run.go` |
| In a container group | `ascender-task` creates the pod through the Kubernetes API, attaches to its `worker` container and writes the job to its stdin; the container runs `ansible-runner worker --private-data-dir=/runner` | `runPod` in `container_group.go` |
| In a container group behind a mesh node | a `kubernetes-incluster-auth` work unit on that node, with the pod spec as a secret parameter; the node must serve its control service over TLS | `runMeshPod` in `receptor_run.go` |
| A project update when `IS_K8S` is set | a `local` work unit of the receptor beside the task container, running `ansible-runner worker` in the control plane execution environment | `runLocalWork` in `receptor_run.go` |

System jobs do not use an execution environment: they run in the
`ascender-task` process (`src/internal/tasks/system_job.go`).

The container runtime is `ASCENDER_CONTAINER_RUNTIME` (an environment
variable of `ascender-task`), else `podman` when it is installed, else
`docker`. The runtime runs on the same host as `ascender-task` and must see
the private data directory at the same path.

> **Differences from the old application.** The old application sent every
> run, including those on the control or hybrid node itself, through
> receptor. Ascender starts local runs with the container runtime directly,
> so they have no `work_unit_id` and cannot outlive the `ascender-task` that
> started them (see [Job Monitor Lease](job_monitor_lease.md)). docker is
> supported as a runtime: podman-only run options (`--user=root`,
> `--quiet`, a `slirp4netns` or `pasta` network) are dropped and the
> container runs as the task process's uid.


## The private data directory

Each run gets a directory `ascender_<id>_<random>` (mode 0700) under the
`ASCENDER_ISOLATION_BASE_PATH` setting (default `/tmp`; `makePDD`). It is
mounted into the execution environment as `/runner`. For a playbook job it
contains:

| Path | Contents |
|---|---|
| `project/` | a copy of the project checkout, with the cached `requirements_roles/` and `requirements_collections/` |
| `inventory/hosts` | an executable script printing the inventory's JSON |
| `env/extravars` | the extra variables as YAML, tagged `!unsafe` unless `ALLOW_JINJA_IN_EXTRA_VARS` allows templating them |
| `env/cmdline` | the `ansible-playbook` arguments |
| `env/settings` | runner settings: `job_timeout`, `idle_timeout` when `DEFAULT_JOB_IDLE_TIMEOUT` is set |
| `env/` (other files) | private key and other credential files written by credential types and injectors |
| `cp/` | the SSH control path directory (`ANSIBLE_SSH_CONTROL_PATH_DIR=/runner/cp`) |
| `artifacts/<id>/callback/` | the `awx_display` callback plugin (local runs) |
| `artifacts/<id>/env.list` | the job's environment, passed to the runtime with `--env-file` (local runs) |
| `artifacts/<id>/command` | JSON with the container command, its working directory and the job's environment, unmasked (local runs) |
| `artifacts/<id>/job_events/` | the callback's partial event files while a local run is in progress; `<counter>-<uuid>.json` per event for a worker run |
| `artifacts/<id>/fact_cache/`, `host_cache_summary.json` | the fact cache, when the template uses it (see [Fact Cache](fact_cache.md)) |
| `artifacts/<id>/status`, `rc` | the runner's final status and return code |

Inventory and project updates use the same scheme with their own files
(for example `args` holding an inventory update's command).

`AWX_PRIVATE_DATA_DIR` in the job's environment (and its stored `job_env`)
holds the directory's path on the controller; the variable keeps its old
name.

When the run ends the directory is removed if the `ASCENDER_CLEANUP_PATHS`
setting is on (the default). Independently, every three hours (and two
minutes after `ascender-task` starts) a sweep removes `ascender_*_*` and
older `awx_*_*` directories under `ASCENDER_ISOLATION_BASE_PATH` that are
more than an hour old and do not belong to a waiting or running task of this
node (`src/internal/tasks/cleanup_paths.go`). The sweep is skipped when
`ASCENDER_CLEANUP_PATHS` is off and on Kubernetes.


## Local runs

### The command

`runnerConfig.command` builds what ansible-runner's containerized
invocation built:

```
podman run --rm --tty --interactive --workdir /runner/project \
  -v <private data dir>/:/runner/:Z [-v <ASCENDER_ISOLATION_SHOW_PATHS mounts>] \
  --env-file <private data dir>/artifacts/<id>/env.list --quiet \
  --name ansible_runner_<id> --user=root <DEFAULT_CONTAINER_RUN_OPTIONS> \
  [--authfile=...] [--pull=<policy>] <image> \
  ansible-playbook <args> -i /runner/inventory -e @/runner/env/extravars <playbook>
```

Ad hoc commands run `ansible ... -m <module> -a <args>` instead. With a
machine or source control SSH key the command is wrapped in
`ssh-agent sh -c 'trap ... && ssh-add <fifo> && ...'`; the key is fed through
a named pipe at `artifacts/<id>/ssh_key_data`, so it is never written to disk.

The execution environment's registry credential, if any, is written to a
temporary directory beside the private data directory (not inside it, where
the playbook could read it) and passed as `--authfile` (podman) or
`--config` (docker); it is removed when the run ends. docker pulls the image
before the run, because it prints pull progress on the job's terminal.

Two safeguards apply to the runtime client itself:

- The `--env-file` is refused, with the variable named, if a name is not a
  plain variable name or a value contains a line break or NUL (`envFile`).
  podman and docker read the file a line at a time, and a line holding only
  a name copies that variable from the client's own environment.
- The client runs with `ascender-task`'s environment minus `ASCENDER_*`,
  `PGPASS*`, `PGSERVICEFILE`, `DATABASE_URL` and `SECRET_KEY`
  (`runtimeClientEnv`). The job's environment reaches the container only
  through `--env-file`, so a credential that injects `DOCKER_HOST`,
  `CONTAINER_HOST` or `LD_PRELOAD` cannot redirect the client.

### Prompts, cancel and timeouts

The process runs on a pseudo-terminal with echo off (`src/internal/tasks/pty_linux.go`).
Password prompts (SSH, become, vault passwords supplied at launch) are
matched against the last 100 characters of output and answered, as pexpect
did for ansible-runner.

A cancel, or `ascender-task` stopping, runs `<runtime> kill ansible_runner_<id>`
(bounded to 10 seconds), then sends SIGTERM to the client and SIGKILL five
seconds later. The job timeout and `DEFAULT_JOB_IDLE_TIMEOUT` (no output for
that many seconds) end the run the same way with status `timeout`, which
fails the job with "Job terminated due to timeout".

### What is recorded on the job

Before the run starts (`recordStart`), the job's `job_args` is set to the
full container command, `job_cwd` to `/runner/project`, and `job_env` to the
environment with secrets masked. After the run, `ansible_version` and
`installed_collections` are read from `artifacts/<id>/ansible_version.txt`
and `collections.json` when the execution environment left them there.


## The callback plugin and event filtering

The plugin is taken from the execution environment image, not shipped with
Ascender (`callbackPlugin` in `runner.go`). The first local run on an image
starts a throwaway container (`--network none`, `--entrypoint python3`) that
prints the `.py` files of `ansible_runner.display_callback.callback`, and
stores them under `<ASCENDER_JOBOUTPUT_ROOT>/callback_cache/<image>-<digest>/`
(`ASCENDER_JOBOUTPUT_ROOT` is an environment variable, default
`/var/lib/ascender/job_status/`). Later runs on that image reuse the cache;
each run copies the files to `artifacts/<id>/callback/`. A playbook job or
ad hoc command fails if the image has no `awx_display.py`. An inventory
update runs without the plugin in that case, since `ansible-inventory` does
not need it.

`addRunnerEnv` (`run_base.go`) sets the variables ansible-runner set:

| Variable | Value |
|---|---|
| `ANSIBLE_STDOUT_CALLBACK` | `awx_display` |
| `ANSIBLE_CALLBACK_PLUGINS` | `/runner/artifacts/<id>/callback`, after any directories from the `ASCENDER_ANSIBLE_CALLBACK_PLUGINS` setting |
| `AWX_ISOLATED_DATA_DIR` | `/runner/artifacts/<id>`, where the plugin writes partial event files |
| `RUNNER_OMIT_EVENTS`, `RUNNER_ONLY_FAILED_EVENTS` | `False` |
| `ANSIBLE_CACHE_PLUGIN`, `ANSIBLE_CACHE_PLUGIN_CONNECTION` | `jsonfile` and `/runner/artifacts/<id>/fact_cache`, with the fact cache |
| `ANSIBLE_UNSAFE_WRITES` | `1`, with podman |
| `ANSIBLE_RETRY_FILES_ENABLED` | `False` |

For each event the plugin writes the full event to
`artifacts/<id>/job_events/<uuid>-partial.json` and prints only
`{"uuid": ...}`, base64-encoded and wrapped in `ESC[K` markers, into the
output. `outputEventFilter` (`runner.go`, ansible-runner's
`OutputEventFilter`):

- finds the encoded markers in the terminal output; the text up to the next
  marker is that event's `stdout`;
- emits text outside any event as `verbose` events, one per line;
- numbers events (`counter`) and their output lines (`start_line`,
  `end_line`);
- releases held-back output as a `verbose` event once it exceeds 16 MiB, so
  an event that never ends cannot exhaust memory.

`completeEvent` then merges the partial file into the event (only for a UUID
of the expected form, read inside the private data directory), removes the
file, and passes the event to the job's event sink. How events are stored is
described in [Job Events](job_events.md).


## Worker runs

A run on an execution node, in a pod, or as a Kubernetes `local` work unit
is sent to `ansible-runner worker` as ansible-runner's transmit stream
(`transmitWorker` in `container_group.go`):

```
{"kwargs": {...}}
{"zipfile": <size>}
<base64 zip of the private data directory>
{"eof": true}
```

`kwargs` (`workerKwargs`) holds `ident`, `inventory`, `envvars` (the
environment without `HOME`), `settings`, `cmdline`, the prompt `passwords`,
`playbook` or `module`/`module_args`, and `fact_cache_type`. For an
execution node it also holds the podman parameters (`eeWorkerParams`):
`container_image`, `process_isolation_executable: podman`,
`container_options` (`--user=root`, `DEFAULT_CONTAINER_RUN_OPTIONS`,
`--pull`), `container_auth_data` from the registry credential and
`container_volume_mounts` from `ASCENDER_ISOLATION_SHOW_PATHS`. The SSH key
travels in the zip as `env/ssh_key` and is removed from the local directory
once the zip is written. The zip is built in a temporary file beside the
private data directory and removed after the run.

The worker uses the image's own callback plugin. Its output comes back as one
JSON object per line, read by `processWorkerStream`:

- status lines: `starting` records the worker's command, working directory
  and environment on the job (secrets masked, `recordStarting`); the last
  status is the run's result;
- event lines: written to `artifacts/<id>/job_events/<counter>-<uuid>.json`
  and passed to the event sink;
- `{"zipfile": n}` followed by the worker's artifacts, unpacked into
  `artifacts/<id>/` (bounded to 1 GiB compressed and 2 GiB unpacked); the
  fact cache is read back only if this arrived;
- `{"eof": true}`. A stream that ends without it fails the job with
  "Unexpected empty line encountered during worker stream...".

For work units, the unit id is stored in the job's `work_unit_id`, and the
unit is signed when receptor's work signing is configured. A cancel runs
`work cancel`. A unit that fails without producing events gets the last
1000 bytes of its output, or receptor's detail, as the job's traceback
(`workError`). When the job is done the unit is released (`work release`)
and a pod deleted. Every minute a reaper cancels and releases the work units
of jobs that are no longer active (`reapWorkUnits`). When
`ASCENDER_CLEANUP_PATHS` is on, an execution node's worker is started with
`--delete`, so its copy of the directory is removed after the run.

While a worker runs, the task holds a monitor lease on the job so another
control node can resume reading its output if this one stops; see
[Job Monitor Lease](job_monitor_lease.md).


## Debugging

- **Keep the private data directory.** Turn the `ASCENDER_CLEANUP_PATHS`
  setting off (Settings > Troubleshooting, or `PATCH /api/v2/settings/debug/`), run
  the job, and read `AWX_PRIVATE_DATA_DIR` from its `job_env`. The directory
  is on the job's `controller_node`. Execution nodes then also keep their
  copy, because `--delete` is not passed. Turn the setting back on
  afterwards: the directories hold credentials, and the periodic sweep does
  not remove them while the setting is off.
- **The command and environment.** `job_args`, `job_cwd` and `job_env` on
  the job show what was run, with secrets masked. In a kept directory,
  `artifacts/<id>/command` and `env.list` hold the environment unmasked.
- **Keep work units.** Turn off **Release Receptor Work**
  (`RECEPTOR_RELEASE_WORK`, Settings > Troubleshooting, or
  `PATCH /api/v2/settings/debug/`) to leave finished work units unreleased
  (inspect them with `receptorctl work list` and `work results`) and the
  pods of container group jobs that ran to the end in place; the work unit
  and pod reapers are off too. A canceled job's pod is still deleted. Turn
  it back on afterwards: nothing cleans up what is kept meanwhile.
- **The callback plugin.** Delete an image's directory under
  `<ASCENDER_JOBOUTPUT_ROOT>/callback_cache/` to make the next run on that
  image copy the plugin again, for example after replacing an image under the
  same tag.
