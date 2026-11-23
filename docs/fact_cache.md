# Ascender as an Ansible Fact Cache

Ascender can store and serve per-host facts through Ansible's `jsonfile` fact
cache plugin. This is enabled per job template with `use_fact_cache`. When it
is on, a job gets the cached facts of every host in its inventory, not only
the hosts it targets, so a playbook run with `--limit` still has the facts of
the whole inventory. Facts Ansible gathers or sets during the run are saved
back to the hosts' `ansible_facts`.

The implementation is `src/internal/tasks/facts.go` (`startFactCache`,
`finishFactCache`), called from `src/internal/tasks/job.go`.

## Before the run

When a job with `use_fact_cache` starts, `startFactCache` writes each host's
`ansible_facts` as a JSON file in `artifacts/<id>/fact_cache/` in the job's
private data directory. The hosts are those of the job's inventory, disabled
hosts included, narrowed to the job's slice for a sliced job; for a
constructed inventory, they are the source hosts behind the constructed
ones, and the facts are saved back to those source hosts.

A host's facts are written only if its `ansible_facts_modified` is set and,
when the `ANSIBLE_FACT_CACHE_TIMEOUT` setting is greater than 0, no older
than that many seconds. With the default of 0, facts never expire.

Each host gets two files, because which ansible-core the execution
environment has is not known in advance:

- `<host>`: the facts as plain JSON, read and written by ansible-core before
  2.19;
- `s1_<host>`: `{"__payload__": "<facts JSON>"}`, the form ansible-core 2.19
  and later use for persistent cache plugins.

The files are backdated by two seconds, and
`artifacts/<id>/host_cache_summary.json` records which hosts and files were
written. Two cases are logged and skipped for ansible-core 2.19+: facts that
contain the reserved key `__ansible_type`, and a host named `<name>` when
another host is named `s1_<name>` (the file name belongs to that other
host's plain-format file).

Ansible is pointed at the directory with `ANSIBLE_CACHE_PLUGIN=jsonfile` and
`ANSIBLE_CACHE_PLUGIN_CONNECTION=/runner/artifacts/<id>/fact_cache`. A job on
an execution node or in a container group sends the files in its private
data directory and has `ansible-runner worker` set up the same plugin
(`fact_cache_type: jsonfile`).

## After the run

When the playbook has finished, `finishFactCache` compares the directory with
the summary:

- A file whose modification time is not older than the summary was written
  by Ansible (`cache.set()`). Its facts are parsed (the payload form for
  `s1_<host>` files, with ansible-core's type tags removed) and, if they
  differ from the host's current facts, saved to `ansible_facts` with
  `ansible_facts_modified` set to now.
- A file that was written before the run and is gone was removed by Ansible,
  for example by `meta: clear_facts`. The host's `ansible_facts` is set to
  `{}`, unless the host's facts were modified after the job was created
  (another job saved them meanwhile), in which case they are kept and a
  warning is logged.
- Files Ansible did not touch change nothing. A play with
  `gather_facts: false` therefore leaves the hosts' facts as they are.

Files are read inside the private data directory only (symbolic links and
non-regular files are ignored, and each file is limited to 64 MiB), because
the playbook can write anything under `/runner`.

For a job that ran on an execution node or in a container group, the fact
files come back with the worker's artifacts at the end of its output stream.
If the artifacts did not arrive, the fact cache is not read back and the
hosts' facts are unchanged. A job whose output was resumed after a
controller restart reads the fact cache back the same way (see
[Job Monitor Lease](job_monitor_lease.md)).

Inventory updates of a constructed inventory also write the facts of the
source inventories' hosts into a fact cache, so that the `constructed`
plugin can use them; those files are not read back.

## Fact logging

Each saved change is logged as "New fact for inventory <name> host <name>"
with the fields `inventory_id`, `host_name`, `ansible_facts`,
`ansible_facts_modified` and `job_id`, and each clearing as "Facts cleared
for inventory <name> host <name>". The records come from the
`ascender.main.tasks.facts` logger, so external logging ships them when
`LOG_AGGREGATOR_LOGGERS` includes `ascender` (or the legacy `awx`) and
`LOG_AGGREGATOR_LEVEL` is `INFO` or lower. They are not sent to the
`system_tracking` logger, and `LOG_AGGREGATOR_INDIVIDUAL_FACTS` has no
effect on them. The old application behaved the same way.

## Integration Testing

* Ensure `meta: clear_facts` sets `hosts/<id>/ansible_facts` to `{}`.
* Ensure that `gather_facts: false` does NOT clear existing facts.
* Ensure that once a host's facts are older than `ANSIBLE_FACT_CACHE_TIMEOUT`,
  they are not offered to the job.
