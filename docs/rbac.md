# Role-Based Access Control (RBAC)

Ascender decides who may see and do what with roles: a role is a set of
permissions on one object (Admin of an organization, Use of a credential,
Execute of a job template), roles inherit from other roles, and users hold
roles directly or through a team. The tables are the ones the old
application used, so the roles of an upgraded database carry over as they
are.

The code:

| | |
|---|---|
| `src/internal/rbac/rbac.go` | role names and descriptions, the implicit parents (`rbac.ImplicitParents`), and the lookups (`UserHasRole`, `UserHasRoleOn`, `LoadHeld`) |
| `src/internal/models/roles.go` | creating an object's roles (`RoleFactory.CreateRoles`), rebuilding the ancestor closure (`RebuildRoleAncestors`), re-parenting when an organization changes (`RelinkParentRole`) and deleting an object's roles (`DeleteRolesFor`) |
| `src/internal/api/rbac_api.go` | the role endpoints, granting and revoking, and access lists |
| `src/internal/api/list.go` | filtering lists to what the user may read (`AccessibleFilter`) |


## Roles

Each role is a row of `main_rbac_roles`: its `role_field` (`admin_role`,
`use_role`, ...), the `content_type_id` and `object_id` of the object it
belongs to, and `implicit_parents` (the ids of the parents it was created
with, as a JSON list). The object's own row points back at its roles
(`main_project.admin_role_id`, `use_role_id`, ...).

These objects have roles, created with the object:

| Object | Role fields |
|---|---|
| Organization | `admin_role`, `execute_role`, `project_admin_role`, `inventory_admin_role`, `credential_admin_role`, `workflow_admin_role`, `notification_admin_role`, `job_template_admin_role`, `execution_environment_admin_role`, `auditor_role`, `member_role`, `read_role`, `approval_role` |
| Team | `admin_role`, `member_role`, `read_role` |
| Project | `admin_role`, `use_role`, `update_role`, `read_role` |
| Inventory | `admin_role`, `update_role`, `adhoc_role`, `use_role`, `read_role` |
| Credential | `admin_role`, `use_role`, `read_role` |
| Job template | `admin_role`, `execute_role`, `read_role` |
| Workflow job template | `admin_role`, `execute_role`, `read_role`, `approval_role` |
| Instance group | `admin_role`, `use_role`, `read_role` |

Other objects have no roles of their own. Access to them follows from the
object they belong to: a host or group from its inventory, an inventory
source from its inventory, a schedule from its template, an execution
environment or notification template from its organization's
`execution_environment_admin_role` or `notification_admin_role`.

The API shows a role's `name` and `description` from `rbac.RoleNames` and
its description table (translated): `admin_role` is "Admin", "Can manage all
aspects of the project", `use_role` is "Use", "Can use the credential in a
job template", and so on.

### Singleton roles

Two roles belong to no object. They have a `singleton_name` and are created
with the database (`src/internal/db/baseline/first_run.sql`):

* `system_administrator` ("System Administrator"). Its members are the
  superusers, kept in step both ways. Saving a user through
  `/api/v2/users/` (or an external login updating the account) adds the user
  to the role or removes them according to `is_superuser`, whether or not
  that field changed. Adding a user to the role through
  `/api/v2/roles/<id>/users/` or `/api/v2/users/<id>/roles/` sets
  `is_superuser`, and removing one clears it, even for a user who was not a
  member. The code checks `is_superuser`, which passes every access check.
* `system_auditor` ("System Auditor"). A user's `is_system_auditor` is
  membership of this role, and setting it through `/api/v2/users/` changes
  the membership.


## Inheritance

`main_rbac_roles_parents` holds the edges: a row (`from_role_id`,
`to_role_id`) makes `to_role_id` a parent of `from_role_id`, and whoever
holds the parent holds the child. `main_rbac_roles_members` holds the users
who are direct members of a role.

`main_rbac_role_ancestors` is the transitive closure of the parent edges:
one row per (descendant, ancestor) pair, every role being its own ancestor.
Each row also carries the descendant's `role_field`, `content_type_id` and
`object_id`, so one lookup answers "which objects of this type does the user
hold this role on". A user holds a role when they are a direct member of any
of its ancestors.

### Implicit parents

When an object is created, `RoleFactory.CreateRoles` inserts its roles and
links each one to the parents `rbac.ImplicitParents` names for it, which are
the parents the old application's `ImplicitRoleField`s declared. A parent is
another role of the same object, a role of a related object (reached through
a foreign key, such as the project's `organization`), or a singleton:

| Role | Parents |
|---|---|
| organization `admin_role` | `system_administrator` |
| organization `execute_role`, `project_admin_role`, `inventory_admin_role`, `credential_admin_role`, `workflow_admin_role`, `notification_admin_role`, `job_template_admin_role`, `execution_environment_admin_role`, `member_role`, `approval_role` | its `admin_role` |
| organization `auditor_role` | `system_auditor` |
| organization `read_role` | its `member_role`, `auditor_role`, `execute_role`, `approval_role` and every `*_admin_role` but `admin_role` |
| team `admin_role` | organization `admin_role` |
| team `member_role` | its `admin_role` |
| team `read_role` | organization `auditor_role`, its `member_role` |
| project `admin_role` | organization `project_admin_role`, `system_administrator` |
| project `use_role`, `update_role` | its `admin_role` |
| project `read_role` | organization `auditor_role`, `system_auditor`, its `use_role` and `update_role` |
| inventory `admin_role` | organization `inventory_admin_role` |
| inventory `update_role`, `adhoc_role` | its `admin_role` |
| inventory `use_role` | its `adhoc_role` |
| inventory `read_role` | organization `auditor_role`, its `update_role`, `use_role` and `admin_role` |
| credential `admin_role` | organization `credential_admin_role`, `system_administrator` |
| credential `use_role` | its `admin_role` |
| credential `read_role` | `system_auditor`, organization `auditor_role`, its `use_role` and `admin_role` |
| job template `admin_role` | organization `job_template_admin_role` |
| job template `execute_role` | its `admin_role`, organization `execute_role` |
| job template `read_role` | organization `auditor_role`, the inventory's organization's `auditor_role`, its `execute_role` and `admin_role` |
| workflow job template `admin_role` | `system_administrator`, organization `workflow_admin_role` |
| workflow job template `execute_role` | its `admin_role`, organization `execute_role` |
| workflow job template `approval_role` | organization `approval_role`, its `admin_role` |
| workflow job template `read_role` | `system_auditor`, organization `auditor_role`, its `execute_role`, `admin_role` and `approval_role` |
| instance group `admin_role` | `system_administrator` |
| instance group `use_role` | its `admin_role` |
| instance group `read_role` | `system_auditor`, its `use_role` and `admin_role` |

A parent on a related object that does not exist (a credential without an
organization) is left out. The resolved parent ids are stored in the role's
`implicit_parents`, as a sorted list (`[12, 40, 41]`). So the Ad Hoc role of
an inventory also grants Use, and Use grants Read.

For example, the roles of an organization, one of its projects and a job
template that uses it:

```
system_administrator
└── organization admin_role
    ├── organization project_admin_role
    │   └── project admin_role
    │       ├── project use_role ─────┐
    │       └── project update_role ──┴── project read_role
    ├── organization job_template_admin_role
    │   └── job template admin_role
    │       └── job template execute_role ── job template read_role
    └── organization execute_role
        └── job template execute_role
```

An organization admin therefore holds every role on the organization's
projects and job templates, and a user given Execute on the organization may
run every job template in it.

### Keeping the closure current

`RebuildRoleAncestors` recomputes the closure rows of the given roles and of
everything beneath them with a recursive query. It runs whenever parent
edges change: when an object is created, when a team is granted or loses a
role, and when an object moves to another organization. It takes a
transaction-scoped advisory lock, so two changes to the same roles cannot
interleave and leave a revoked parent in the closure.

When a project, inventory, credential, job template or workflow job template
changes organization (or a job template its inventory), `RelinkParentRole`
replaces the organization roles among the parents of its roles with those of
the new organization, leaving the other parents (team grants among them)
alone. Deleting an object deletes its roles, their memberships, parent edges
and closure rows (`DeleteRolesFor`).

### Teams

Granting a role to a team makes the team's `member_role` a parent of that
role, so every member of the team holds it. Team members are the direct
members of the team's `member_role`, and the team's admins of its
`admin_role`.


## How access is checked

Superusers pass every check. Otherwise:

* **One object.** A handler asks whether the user holds a role:
  `SerCtx.HasRole(roleID)` for a role id it has (the project's
  `admin_role_id`), or `SerCtx.HasRoleOn(contentType, objectID, roleField)`
  for a role named by its object and field. Both come down to one query of
  `main_rbac_role_ancestors` joined with the user's memberships
  (`rbac.UserHasRole`, `rbac.UserHasRoleOn`). A read-only request loads every
  role the user holds once (`rbac.LoadHeld`) and answers the rest from
  memory, so a page computing `user_capabilities` for each row does not
  query once per row.
* **Reading an object.** A detail view answers `404` when the object does
  not exist and `403` when it exists but the user holds no role that lets
  them read it (usually its `read_role`). System auditors may read
  everything.
* **Lists.** A list query is restricted to the objects the user may read,
  with the clause `AccessibleFilter` builds:

  ```sql
  <pk> IN (SELECT a.object_id FROM main_rbac_role_ancestors a
           WHERE a.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = $1)
             AND a.content_type_id = $2 AND a.role_field = 'read_role')
  ```

  Superusers and system auditors see every row. Lists of objects without
  roles use the roles of the object they belong to.
* **`role_level`.** Every list whose objects have roles (organizations,
  teams, projects, inventories, credentials, job templates, workflow job
  templates, instance groups and unified job templates, sub-lists included)
  accepts `?role_level=<role field>`, which keeps the objects on which the
  user holds that role, such as `/api/v2/projects/?role_level=admin_role`.
  It goes by role membership for everyone: a superuser gets what the System
  Administrator role is an ancestor of (not, for example, an inventory
  without an organization). An empty value matches nothing. Any other list
  answers `400` with `Cannot apply role_level filter to this list because
  its model does not use roles for access control.`
* **Capabilities.** The `user_capabilities` in `summary_fields` (`edit`,
  `delete`, `start`, `copy`, `use`, ...) are computed from the same roles,
  so the UI only offers what the API will allow.


## Role endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/v2/roles/` | the roles the user may see |
| `GET /api/v2/roles/<id>/` | one role |
| `GET`, `POST /api/v2/roles/<id>/users/` | the role's direct members; `POST {"id": <user id>}` grants, with `"disassociate": true` revokes |
| `GET`, `POST /api/v2/roles/<id>/teams/` | the teams granted the role; `POST {"id": <team id>}` grants, with `"disassociate": true` revokes |
| `GET /api/v2/roles/<id>/parents/`, `/children/` | the role's direct parents and children, limited to the roles the user may see |
| `GET`, `POST /api/v2/users/<id>/roles/` | the roles a user is a direct member of, limited to the roles the viewer may see; `POST {"id": <role id>}` grants, with `"disassociate": true` revokes |
| `GET`, `POST /api/v2/teams/<id>/roles/` | the roles granted to a team; `POST {"id": <role id>}` grants, with `"disassociate": true` revokes |
| `GET /api/v2/<resource>/<id>/object_roles/` | the roles of one object, for organizations, teams, projects, inventories, credentials, job templates, workflow job templates and instance groups |
| `GET /api/v2/<resource>/<id>/access_list/` | the users who hold any role on the object, for the same resources and users |

A user sees a role when it is an ancestor of a role that descends from one
of the user's own roles (`visibleRolesClause`): roles on objects they have
something to do with. Superusers and system auditors see every role. A user
who belongs to no organization also sees the two singleton roles.

An access list entry is a user with `summary_fields.direct_access` (the
user's memberships of the object's own roles, and the roles on it given to
the user's teams) and `summary_fields.indirect_access` (the roles above them
the user is a member of, such as Admin of the object's organization). When the
`ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS` setting is on, superusers and
system auditors appear only through roles they hold on the object.

### Granting and revoking

Granting a role to a user or a team, and revoking it, takes
(`canUnattachRole`):

* a superuser; or
* a user who may read the user or team being granted, and who holds the
  `admin_role` of the role's object.

With these exceptions:

* An organization's `admin_role` and `member_role` cannot be granted to
  teams. Granting them to users also needs the `MANAGE_ORGANIZATION_AUTH`
  setting and admin rights over the user.
* A team's `admin_role` and `member_role` can be granted only while
  `MANAGE_ORGANIZATION_AUTH` is on.
* The singleton roles can only be granted by a superuser, and never to a
  team.

The API refuses these with `400`:

| Message | When |
|---|---|
| `You cannot grant credential access to a user not in the credentials' organization` | granting a role of an organization's credential to a user who is not a member of that organization |
| `You cannot grant private credential access to another user` | a non-superuser granting a role of a credential without an organization |
| `You cannot grant credential access to a team when the Organization field isn't set, or belongs to a different organization` | granting a credential role to a team of another organization, or a private credential's role to any team |
| `You cannot assign an Organization participation role as a child role for a Team.` | granting an organization's `admin_role` or `member_role` to a team |
| `You cannot grant system-level permissions to a team.` | granting a singleton role to a team |

Each grant and revoke is recorded in the activity stream as an `associate` or
`disassociate` of the role and the user or team. A revoke is recorded even
when the user was not a member. Changes to the System Administrator role's
members made from the role's side record nothing; made from the user's side
they record the association and then an `update` of the user's
`is_superuser`. The `/api/v2/organizations/<id>/users/`,
`/admins/` and `/api/v2/teams/<id>/users/` endpoints change the members of
the organization's `member_role` and `admin_role` and of the team's
`member_role` in the same way.

An organization's instance groups (`/api/v2/organizations/<id>/instance_groups/`)
are attached and detached by a user who holds both the organization's
`admin_role` and the instance group's `use_role` (superusers hold both).

Creating a job template, creating a credential owned by a user, and copying
an object (see [Copying Resources](./resource_copy.md)) make the requesting
user a direct member of the new object's `admin_role`.
