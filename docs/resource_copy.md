# Copying Resources

Some resources can be copied by `POST`ing to their `copy/` endpoint,
`/api/v2/<resource>/<id>/copy/`. The detail view of every copiable object
links it as `related.copy`.

| Resource | Endpoint | Handler |
|---|---|---|
| Credentials | `/api/v2/credentials/<id>/copy/` | `credentialCopy` in `src/internal/api/credentials.go` |
| Execution environments | `/api/v2/execution_environments/<id>/copy/` | `executionEnvironmentCopy` in `src/internal/api/execution_environments.go` |
| Inventories | `/api/v2/inventories/<id>/copy/` | `inventoryCopy` in `src/internal/api/inventory_copy.go` |
| Job templates | `/api/v2/job_templates/<id>/copy/` | `jobTemplateCopy` in `src/internal/api/job_templates.go` |
| Notification templates | `/api/v2/notification_templates/<id>/copy/` | `notificationTemplateCopy` in `src/internal/api/notification_templates.go` |
| Projects | `/api/v2/projects/<id>/copy/` | `projectCopy` in `src/internal/api/project_relations.go` |
| Workflow job templates | `/api/v2/workflow_job_templates/<id>/copy/` | `workflowJobTemplateCopy` in `src/internal/api/workflow_templates.go` |


## Usage

`GET` answers whether the current user may copy the object:

```json
{"can_copy": true}
```

`POST` makes the copy. The body has one field, `name`, the name of the copy
(`copyName` in `src/internal/api/form.go`):

* It is required, may not be null or blank, and must be a string (a number
  is taken as its text). Surrounding whitespace is trimmed.
* It must differ from the original's name:
  `{"non_field_errors": ["The original object is already named Demo, a copy from it cannot have the same name."]}`.

On success the answer is `201 Created` with the new object, as its detail
view shows it, and a `Location` header with its URL. The copy is created by
the requesting user (`created_by`), an activity stream entry records its
creation, and the user is made a member of its `admin_role` (execution
environments and notification templates have no roles).

Everything, including the hosts and groups of an inventory and the nodes of
a workflow, is copied in the request's database transaction: when the
response arrives, the copy is complete. The old application created those
sub-objects afterwards in a background task.

The UI's copy buttons name the copy `<original name> @ <time>`, the time as
the old UI wrote it (luxon's `hh:mm:ss:ms a`, always in English, where `ms`
is the minute and the second unpadded): `Deploy @ 03:07:09:79 PM`
(`timeOfDay` in `web/static/js/app.js`). A failed copy shows the list's own
message ("Failed to copy template.", "Failed to copy inventory.", "Failed to
copy project.", "Failed to copy credential.", "Failed to copy execution
environment"), from the button's `data-copy-error`. The inventory list
disables its copy button for inventories that have inventory sources
("Inventories with sources cannot be copied"); the API copies them without
their sources.


## What is copied

### Credentials

The name, description, organization, credential type and inputs. Secret
inputs are decrypted and encrypted again for the new credential. The
credential's input sources (`/api/v2/credentials/<id>/input_sources/`) are
copied too, so a copy of a credential that looks up its secrets from an
external credential looks them up from the same one. Access granted to users
and teams is not copied.

Permission: for a credential with an organization, a superuser or an admin
or credential admin of that organization. A credential without an
organization (a private credential) can only be copied by a superuser.

### Execution environments

The name, description, organization, image, registry credential and pull
policy. The copy is never `managed`. The name must be unused:
`{"name": ["Execution environment with this Name already exists."]}`.

Permission: a superuser, or an execution environment admin of the
organization; an environment without an organization only by a superuser.

### Inventories

The inventory's name, description, variables, organization, kind,
`host_filter`, `prevent_instance_group_fallback`, `allow_deletes_while_in_use`,
`allow_jobs_while_syncing` and instance groups (in order), and then
(`copyInventoryTree`):

* every host, with its name, description, `enabled`, `instance_id` and
  variables, but no facts and no job history;
* every group, with its name, description and variables;
* the group memberships of hosts, and the parent and child links between
  groups.

Not copied: inventory sources, labels, the input inventories of a constructed
or federated inventory, and access granted to users and teams. A copy of a
constructed inventory gets a new, empty constructed inventory source, as
every constructed inventory has one.

The name must be unused in the organization:
`{"__all__": ["Inventory with this (name, organization) combination already exists."]}`.
The response shows the copy as it was created, before its hosts and groups
were counted (`total_hosts` and `total_groups` are 0); the detail view shows
the counts.

Permission: a superuser or an inventory admin of the organization.

### Job templates

Every field of the job template except its name, with its labels,
credentials, instance groups (in order) and survey. The copy starts with no
jobs, no schedule and the status `never updated`. Schedules, notification
template attachments and access granted to users and teams are not copied.

The webhook key is not copied: a copy with a webhook service gets a new key
of its own, as a new template does. The webhook credential is copied only
when the user may use it (or is a superuser). This is stricter than the old
application, which copied it in every case: the copier administers the copy,
can read its webhook key and so sign a delivery naming any status URL, and
the credential's token is posted to that URL.

Permission: a superuser, or a user with `use` on the project and on the
inventory (when there is one) and read access to the execution environment
(when there is one), who also has `use` on every credential of the template.
A template without a project cannot be copied by anyone else. A user who
lacks `use` on a credential is refused with
`{"detail": "Insufficient access to Job Template credentials."}`; any other
refusal is the usual `403`.

### Notification templates

The name, description, organization, type, configuration and messages.
Secret configuration values are decrypted and encrypted again for the new
template. The copy is made through the same code as `POST
/api/v2/notification_templates/`, so it is validated the same way.

Permission: a superuser or a notification admin of the organization.

### Projects

Every field of the project a user can set, except its local path, webhook
key and requirements generation. What the project's updates fill in (the
SCM revision, the playbook and inventory files) and its job history start
empty. A copy with a webhook service gets a new webhook key. An SCM
project's copy gets a local path of its own and starts a project update, as
a new project does. A manual project's copy
has no local path, so its status is `missing` until one is set.

Permission: a superuser, or a project admin of the organization who may use
the project's SCM credential and read its default execution environment.

### Workflow job templates

Every field of the workflow job template except its name, with its labels,
and every node (`copyWorkflowNodes`), with:

* its success, failure, always and condition links to the other nodes;
* its prompts, credentials, labels and instance groups.

An approval node gets a copy of its approval template rather than sharing
it. The nodes leave out what the user may not use: the inventory without
`use`, the template without `start`, and each credential without `use`.

The webhook key and webhook credential are handled as for job templates: a
copy with a webhook service gets a new webhook key (rotated with
`POST /api/v2/workflow_job_templates/<id>/webhook_key/`), and the webhook
credential goes with the copy only for a user who may use it.
Schedules, notification template attachments and access granted to users and
teams are not copied.

Permission: a superuser, or a workflow admin of the organization who may use
the workflow's inventory, if it has one, and read its execution environment,
if it has one.

`GET` on a workflow's `copy/` endpoint says what the nodes would lose:

```json
{
    "can_copy": true,
    "can_copy_without_user_input": false,
    "templates_unable_to_copy": ["Deploy"],
    "credentials_unable_to_copy": [],
    "inventories_unable_to_copy": []
}
```

`can_copy_without_user_input` is false when any node refers to something the
user may not use; the three lists name those templates, credentials and
inventories. When the user may not copy the workflow at all, each list is
`["all"]`.
