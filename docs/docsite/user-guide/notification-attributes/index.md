---
title: Supported Attributes for Custom Notifications
description: Reference of the job attributes and template variables you can use in Ascender custom notification messages, with syntax examples.
weight: 72
---

This section describes the list of supported job attributes and the proper syntax for constructing the message text for notifications. To turn on custom messages for a notification template, see [Create custom notifications](../notifications#create-custom-notifications).

## Job attributes

The supported job attributes are:

- `allow_simultaneous` - (boolean) indicates if multiple jobs can run simultaneously from the JT associated with this job
- `controller_node` - (string) the instance that controlled the job
- `created` - (datetime) timestamp when this job was created
- `description` - (string) optional description of the job
- `diff_mode` - (boolean) if enabled, textual changes made to any templated files on the host are shown in the standard output
- `elapsed` - (decimal) elapsed time in seconds that the job ran
- `execution_node` - (string) node the job executed on
- `failed` - (boolean) true if job failed
- `finished` - (datetime) date and time the job finished execution
- `force_handlers` - (boolean) when handlers are forced, they will run when notified even if a task fails on that host (note that some conditions - e.g. unreachable hosts - can still prevent handlers from running)
- `forks` - (int) number of forks requested for job
- `id` - (int) database id for this job
- `job_explanation` - (string) status field to indicate the state of the job if it wasn't able to run and capture stdout
- `job_slice_count` - (integer) if run as part of a sliced job, the total number of slices (if 1, job is not part of a sliced job)
- `job_slice_number` - (integer) if run as part of a sliced job, the ID of the inventory slice operated on (if not part of a sliced job, attribute is not used)
- `job_tags` - (string) only tasks with specified tags will execute
- `job_type` - (choice) run, check, or scan
- `launch_type` - (choice) manual, relaunch, callback, scheduled, dependency, workflow, sync, or scm
- `limit` - (string) playbook execution limited to this set of hosts, if specified
- `modified` - (datetime) timestamp when this job was last modified
- `name` - (string) name of this job
- `playbook` - (string) playbook executed
- `scm_revision` - (string) scm revision from the project used for this job, if available
- `skip_tags` - (string) playbook execution skips over this set of tag(s), if specified
- `start_at_task` - (string) playbook execution begins at the task matching this name, if specified
- `started` - (datetime) date and time the job was queued for starting
- `status` - (choice) new, pending, waiting, running, successful, failed, error, canceled
- `timeout` - (int) amount of time (in seconds) to run before the task is canceled
- `type` - (choice) data type for this job
- `url` - (string) URL for this job
- `use_fact_cache` - (boolean) if enabled for job, Ascender acts as an Ansible Fact Cache Plugin, persisting facts at the end of a playbook run to the database and caching facts for use by Ansible
- `verbosity` - (choice) 0 through 5 (corresponding to Normal through WinRM Debug)
- `host_status_counts` (count of hosts uniquely assigned to each status)
  - `skipped` (integer)
  - `ok` (integer)
  - `changed` (integer)
  - `failures` (integer)
  - `dark` (integer)
  - `processed` (integer)
  - `rescued` (integer)
  - `ignored` (integer)
  - `failed` (boolean)
- `hosts` - (list) names of the hosts the job ran against, sorted alphabetically. Only populated for jobs that track per-host results; the list is capped at 1000 entries to keep notification payloads bounded for very large inventories.
- `summary_fields`:
  - `inventory`
    - `id` - (integer) database ID for inventory
    - `name` - (string) name of the inventory
    - `description` - (string) optional description of the inventory
    - `has_active_failures` - (boolean) (deprecated) flag indicating whether any hosts in this inventory have failed
    - `total_hosts` - (deprecated) (int) total number of hosts in this inventory.
    - `hosts_with_active_failures` - (deprecated) (int) number of hosts in this inventory with active failures
    - `total_groups` - (deprecated) (int) total number of groups in this inventory
    - `has_inventory_sources` - (deprecated) (boolean) flag indicating whether this inventory has external inventory sources
    - `total_inventory_sources` - (int) total number of external inventory sources configured within this inventory
    - `inventory_sources_with_failures` - (int) number of external inventory sources in this inventory with failures
    - `organization_id` - (id) organization containing this inventory
    - `kind` - (choice) (empty string) (indicating hosts have direct link with inventory) or 'smart'
  - `project`
    - `id` - (int) database ID for project
    - `name` - (string) name of the project
    - `description` - (string) optional description of the project
    - `status` - (choices) one of new, pending, waiting, running, successful, failed, error, canceled, never updated, ok, or missing
    - `scm_type (choice)` - one of (empty string), git, svn, archive
  - `job_template`
    - `id` - (int) database ID for job template
    - `name` - (string) name of job template
    - `description` - (string) optional description for the job template
  - `unified_job_template`
    - `id` - (int) database ID for unified job template
    - `name` - (string) name of unified job template
    - `description` - (string) optional description for the unified job template
    - `unified_job_type` - (choice) unified job type (job, workflow_job, project_update, etc.)
  - `instance_group`
    - `id` - (int) database ID for instance group
    - `name` - (string) name of instance group
  - `created_by`
    - `id` - (int) database ID of user that launched the operation
    - `username` - (string) username that launched the operation
    - `first_name` - (string) first name
    - `last_name` - (string) last name
  - `labels`
    - `count` - (int) number of labels
    - `results` - list of dictionaries representing labels (e.g. `{"id": 5, "name": "database jobs"}`)

## Message syntax

Information about a job can be referenced in a custom notification message using grouped curly braces `{{ }}`. Specific job attributes are accessed using dotted notation, for example `{{ job.summary_fields.inventory.name }}`. Any characters used in front or around the braces, or plain text, can be added for clarification, such as '#' for job ID and single-quotes to denote some descriptor. Custom messages can include a number of variables throughout the message:

```jinja
{{ job_friendly_name }} {{ job.id }} ran on {{ job.execution_node }} in {{ job.elapsed }} seconds.
```

## Other template variables

In addition to the job attributes, there are some other variables that can be added to the template.

Start, success, error, and changed notifications can use:

- `url` - (string) URL of the job for which the notification is emitted
- `job_friendly_name` - (string) the friendly name of the job

Approval notifications (approved, denied, pending, and timed out) do not have `url` or `job_friendly_name`. They can use:

- `approval_node_name` - (string) the approval node name
- `approval_status` - (choice) one of approved, denied, and timed_out
- `workflow_url` - (string) URL of the workflow job the approval node belongs to. This allows the notification recipient to go to the relevant workflow job page to see what's going on (i.e., `This node can be viewed at: {{ workflow_url }}`).

Both kinds of notifications can use:

- `job_metadata` - (string) job metadata as a JSON string, for example:

  ```text
  {'url': 'https://ascenderhost/$/jobs/playbook/13',
   'traceback': '',
   'status': 'running',
   'started': '2019-08-07T21:46:38.362630+00:00',
   'project': 'Stub project',
   'playbook': 'ping.yml',
   'name': 'Stub Job Template',
   'limit': '',
   'inventory': 'Stub Inventory',
   'id': 42,
   'hosts': {},
   'friendly_name': 'Job',
   'finished': False,
   'credential': 'Stub credential',
   'created_by': 'admin'}
  ```
