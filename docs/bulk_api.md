# Bulk API Overview

The bulk endpoints do in one request what would otherwise take many:

- `POST /api/v2/bulk/job_launch/` launches many jobs as one workflow job.
- `POST /api/v2/bulk/host_create/` creates many hosts in an inventory.
- `POST /api/v2/bulk/host_delete/` deletes many hosts.

Many small requests in rapid succession, or at high concurrency, cost a
request, a database connection and several queries each; combining them
lets a client launch more jobs or add more hosts in less time and with less
load on the server.

The endpoints are `src/internal/api/bulk.go`. `GET /api/v2/bulk/` lists
them, and a `GET` of each answers a short `detail` text; the `OPTIONS` of
each describes the fields it takes. All of them need a logged-in user, and a
`POST` with an OAuth2 token needs the `write` scope. A successful `POST`
answers `201 Created`.

A request body may be at most 10 MiB; a larger one gets `413` with "Request
body too large: the limit is 10 MiB." Users other than superusers cannot send
a stored encrypted value (`$encrypted$...`) anywhere in the body: "Encrypted
values cannot be submitted; enter the value itself."

The limits are settings in the `bulk` category
(`/api/v2/settings/bulk/`, see [Settings](settings.md)):

| Setting | Default | Limits |
|:--------|:--------|:-------|
| `BULK_JOB_MAX_LAUNCH` | 100 | jobs in one bulk launch |
| `BULK_HOST_MAX_CREATE` | 100 | hosts in one bulk create |
| `BULK_HOST_MAX_DELETE` | 250 | hosts in one bulk delete |

Whatever the settings say, no list (`jobs`, or the `hosts` to create or
delete) may hold more than 100,000 elements, the cap the old serializers
had.

### Errors

A request that fails validation gets `400`, with the errors of each field
under its name, as the old serializers reported them:

- A field given as `null` that may not be null: `{"name": ["This field may
  not be null."]}`. Of the request's fields only `organization` may be
  null; of a job's, `identifier` and the prompts that are not ids or lists
  (`limit`, `scm_branch`, `job_type`, `job_tags`, `skip_tags`,
  `verbosity`, `forks`, `diff_mode`, `job_slice_count`, `timeout`,
  `all_parents_must_converge`).
- Text fields must be strings or numbers ("Not a valid string."), are
  trimmed, and `description`, `limit`, `scm_branch`, `skip_tags` and
  `job_tags` may not be blank ("This field may not be blank.").
- A list's items are reported by position, only those that failed:
  `{"jobs": {"1": {"unified_job_template": ["A valid integer is
  required."]}}}`, and a job's `credentials`, `labels` and
  `instance_groups` the same way by their own positions.
- Errors about the request as a whole go under `__all__` (the old
  `NON_FIELD_ERRORS_KEY`): `{"__all__": ["Number of requested jobs exceeds
  system setting BULK_JOB_MAX_LAUNCH"]}`. So do the errors of the `jobs`
  list itself: `{"jobs": {"__all__": ["Ensure this field has no more than
  100000 elements."]}}`, or "This list may not be empty.". The `hosts`
  lists, plain list fields, report theirs as a list: `{"hosts": ["Ensure
  this field has no more than 100000 elements."]}`.


## Bulk Job Launch

A bulk launch creates a workflow job with one node per requested job, and
starts it; each node then launches its template as a workflow node would.

```
POST /api/v2/bulk/job_launch/

{
    "name": "Bulk Job Launch",
    "jobs": [
        {"unified_job_template": 7},
        {"unified_job_template": 8},
        {"unified_job_template": 9}
    ]
}
```

launches a workflow job with three nodes, and answers with the workflow job
as `GET /api/v2/workflow_jobs/<id>/` shows it (without `user_capabilities`).
The workflow job has `is_bulk_job: true` and `launch_type: "manual"`.

The request takes:

- `jobs` (required, not empty): the jobs, at most `BULK_JOB_MAX_LAUNCH`
  ("Number of requested jobs exceeds system setting BULK_JOB_MAX_LAUNCH").
- `name` (default "Bulk Job Launch") and `description`: the workflow job's.
- `organization`: the organization the workflow job belongs to (see
  [below](#who-can-bulk-launch)).
- `inventory`, `limit`, `scm_branch`, `skip_tags`, `job_tags`: prompts for
  every job, as a workflow job's own prompts.
- `extra_vars`: variables, as a JSON object or JSON/YAML text, for every
  job.

Each job takes:

- `unified_job_template` (required): a job template, workflow job template,
  project or inventory source. Other kinds fail the whole request ("Template
  types System Job Template not allowed in bulk jobs").
- `identifier`: the node's identifier, unique within the request
  ("Identifier deploy not unique"); a random UUID by default.
- the prompts `inventory`, `execution_environment`, `credentials`,
  `labels`, `instance_groups`, `extra_data`, `limit`, `scm_branch`,
  `job_type`, `job_tags`, `skip_tags`, `verbosity`, `forks`, `diff_mode`,
  `job_slice_count` and `timeout`, and `all_parents_must_converge`.

Prompts follow the template's "prompt on launch" settings, as for any
workflow node: a value the template does not prompt for is ignored when the
job is created. For example:

```
{
    "name": "Bulk Job Launch",
    "jobs": [
        {"unified_job_template": 11, "limit": "kansas", "credentials": [1]},
        {"unified_job_template": 12},
        {"unified_job_template": 13}
    ],
    "inventory": 2
}
```

runs template 11 with the limit and credential given for it, if it prompts
for them, and every template that prompts for an inventory with inventory 2.
When the request and a job give the same prompt, the request's wins.

The request's `extra_vars` reach every job, whatever its template prompts
for. A user other than a superuser may therefore only send variables that
every template in the request would take at its own launch (through
"prompt on launch" for variables, or its survey); otherwise the launch fails
with "Variables region, tier are not accepted at launch by Deploy".

### Who can bulk launch?

Every template, and everything the request names, is checked before
anything is created. The user needs:

- execute on each job template and workflow job template, and update on
  each project and on the inventory of each inventory source;
- use on each inventory, credential and instance group;
- read on each label and execution environment.

A failed check names what is missing, for example "Job Templates {7, 9} not
found or you don't have permissions to access it" or "Unified Job Templates
{40} not found or you don't have permissions to access it" for templates
that do not exist (a `400`; the old view failed on a template that did not
exist with a `500`).

The workflow job belongs to an organization, for auditing:

- A superuser may name any organization, or none.
- A user who is a member of exactly one organization need not name one;
  that organization is used.
- A user who is a member of several must name one: "User has permission to
  multiple Organizations, please set one of them in the request". A user in
  no organization gets "User not part of any organization, please assign an
  organization to assign to the bulk job".
- A named organization must be one the user is a member of ("Organization 2
  not found or you don't have permissions to access it").

```
{
    "name": "Bulk Job Launch with org specified",
    "jobs": [
        {"unified_job_template": 12},
        {"unified_job_template": 13}
    ],
    "organization": 2
}
```

### Who can see bulk jobs?

A bulk workflow job has no workflow job template, so it is visible only to
superusers, system auditors, and the admins and auditors of its
organization; it appears in their workflow job and unified job lists. The
jobs it launched are visible as usual, to everyone who can read their
templates.

> **Note:** the user who launched a bulk job, if they are not an admin or
> auditor of its organization, cannot currently open or cancel the workflow
> job that the response links to.


## Bulk Host Create

```
POST /api/v2/bulk/host_create/

{
    "inventory": 1,
    "hosts": [
        {"name": "host1", "variables": "ansible_connection: local"},
        {"name": "host2"},
        {"name": "host3"}
    ]
}
```

adds three hosts to inventory 1. Each host takes `name` (required),
`enabled` (default true), `instance_id`, `description` and `variables`,
validated as for `POST /api/v2/hosts/`; errors are reported per host, by its
position in the list:

```
{"hosts": {"1": {"name": ["This field is required."]}}}
```

The request then fails, with nothing created, when:

- the inventory is smart or constructed: "Hosts can only be created in
  manual inventories (not smart or constructed types).";
- there are more hosts than `BULK_HOST_MAX_CREATE`: "Number of hosts exceeds
  system setting BULK_HOST_MAX_CREATE";
- the user is not an admin of the inventory: "Inventory with id 1 not found
  or lack permissions to add hosts.";
- a name is already in the inventory, or given twice: "Hostnames must be
  unique in an inventory. Duplicates found: ['host1']";
- the hosts would take the organization past its `max_hosts`: `403` with
  "You have already reached the maximum number of 10 hosts allowed for your
  organization. Contact your System Administrator for assistance."

The answer lists the new hosts:

```
{
    "url": "/api/v2/inventories/1/",
    "hosts": [
        {"name": "host1", "enabled": true, "instance_id": "", "description": "",
         "variables": "ansible_connection: local", "id": 101,
         "url": "/api/v2/hosts/101/", "inventory": "/api/v2/inventories/1/"},
        ...
    ]
}
```

The hosts are created in one transaction, with the inventory's host counts
brought up to date, and the activity stream records an update of the
inventory's `total_hosts`.


## Bulk Host Delete

```
POST /api/v2/bulk/host_delete/

{
    "hosts": [3, 4, 5, 6, 7, 8, 9, 10]
}
```

deletes eight hosts, which may be in different inventories. The request
fails, with nothing deleted, when:

- there are more hosts than `BULK_HOST_MAX_DELETE`:
  `{"ERROR": "Number of hosts exceeds system setting BULK_HOST_MAX_DELETE",
  "BULK_HOST_MAX_DELETE": 250, "Hosts_count": 300}`;
- an id is not a number (or numeric text): `{"hosts": ["Field 'id'
  expected a number but got 'web1'."]}`, the value shown as Python showed
  it (a `400`; the old view failed with a `500`);
- a host does not exist:
  `{"hosts": {"11": "Hosts do not exist or you lack permission to delete it"}}`;
- the user is not an admin of one of the inventories: `403` with
  `{"inventories": {"Production": "Lack permissions to delete hosts from this inventory."}}`;
- one of the inventories is smart or constructed:
  `{"inventories": {"Smart": "Hosts can only be deleted from manual inventories."}}`.

Otherwise the hosts are deleted in one transaction, with what depends on
them, and the answer names each:

```
{"hosts": {"3": "The host host1 was deleted", "4": "The host host2 was deleted", ...}}
```

The activity stream records an update of each inventory, listing its
deleted hosts' ids and names.
