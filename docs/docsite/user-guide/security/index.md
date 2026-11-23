---
title: Security
description: How Ascender isolates jobs, which directories playbooks can reach, and how role-based access controls grant users and teams access to resources.
weight: 80
---

The following sections will help you gain an understanding of how Ascender handles and lets you control file system security.

Jobs run in execution environment containers. On a task node, the task container starts them with its rootless Podman, which runs as the unprivileged `ascender` user (uid 1000): the playbook runs as root inside its container, and that root is the `ascender` user outside it. For running jobs, Ascender offers job isolation via the use of Linux containers. This protection ensures jobs can only access playbooks, roles, and data from the Project directory for that job template.

For credential security, users may choose to upload locked SSH keys and set the unlock password to "ask". You can also choose to have the system prompt them for SSH credentials or sudo passwords rather than having the system store them in the database.

## Playbook Access and Information Sharing

Ascender's use of automation execution environments and Linux containers prevents playbooks from reading files outside of their project directory.

By default, the only data exposed to the ansible-playbook process inside the container is the current project being used.

You can customize this in the Job Settings and expose additional directories from the host into the container. Refer to the next section, [Isolation functionality and variables](#isolation-functionality-and-variables), for more information.

### Isolation functionality and variables

Ascender uses container technology to isolate jobs from each other. By default, only the current project is exposed to the container running a job template.

You may find that you need to customize your playbook runs to expose additional directories. To fine tune your usage of job isolation, there are certain variables that can be set.

By default, Ascender will use the system's `tmp` directory (`/tmp` by default) as its staging area. This can be changed in the **Job execution path** field of the Jobs settings screen, or with the `ASCENDER_ISOLATION_BASE_PATH` setting in a `PATCH` to `/api/v2/settings/jobs/`:

```json
{"ASCENDER_ISOLATION_BASE_PATH": "/opt/tmp"}
```

If there are any additional directories that should specifically be exposed from the host to the container that playbooks run in, you can specify those in the **Paths to expose to isolated jobs** field of the Jobs setting screen, or with the `ASCENDER_ISOLATION_SHOW_PATHS` setting in a `PATCH` to `/api/v2/settings/jobs/`:

```json
{"ASCENDER_ISOLATION_SHOW_PATHS": ["/list/of/", "/paths"]}
```

<Hint type="note">

The primary file you may want to add to `ASCENDER_ISOLATION_SHOW_PATHS` is `/var/lib/ascender/.ssh`, if your playbooks need to use keys or settings defined there.

</Hint>

The above fields can be found in the Jobs Settings window:

![Jobs settings with the Job Execution Path and Paths to Expose to Isolated Jobs fields](/assets/images/configure-ascender-jobs-isolated-jobs-fields.webp)

## Role-Based Access Controls

Role-Based Access Controls (RBAC) are built into Ascender and allow administrators to delegate access to server inventories, organizations, and more. Administrators can also centralize the management of various credentials, allowing end users to leverage a needed secret without ever exposing that secret to the end user. RBAC controls allow Ascender to help you increase security and streamline management.

RBACs are easiest to think of in terms of Roles which define precisely who or what can see, change, or delete an "object" for which a specific capability is being set. RBAC is the practice of granting roles to users or teams.

There are a few main concepts that you should become familiar with regarding Ascender's RBAC design--roles, resources, and users. Users can be members of a role, which gives them certain access to any resources associated with that role, or any resources associated with "descendant" roles.

A role is essentially a collection of capabilities. Users are granted access to these capabilities and Ascender's resources through the roles to which they are assigned or through roles inherited through the role hierarchy.

Roles associate a group of capabilities with a group of users. All capabilities are derived from membership within a role. Users receive capabilities only through the roles to which they are assigned or through roles they inherit through the role hierarchy. All members of a role have all capabilities granted to that role. Within an organization, roles are relatively stable, while users and capabilities are both numerous and may change rapidly. Users can have many roles.

### Role Hierarchy and Access Inheritance

Imagine that you have an organization named "SomeCompany" and want to allow two people, "Josie" and "Carter", access to manage all the settings associated with that organization. You should make both people members of the organization's `admin_role`.

![Diagram of users Josie and Carter as members of the SomeCompany organization admin_role](/assets/images/user-role-relationship.webp)

Often, you will have many Roles in a system and you will want some roles to include all of the capabilities of other roles. For example, you may want a System Administrator to have access to everything that an Organization Administrator has access to, who has everything that a Project Administrator has access to, and so on.

This concept is referred to as the 'Role Hierarchy':

- Parent roles get all capabilities bestowed on any child roles
- Members of roles automatically get all capabilities for the role they are a member of, as well as any child roles.

The Role Hierarchy is represented by allowing Roles to have "Parent Roles". Any capability that a Role has is implicitly granted to any parent roles (or parents of those parents, and so on).

![Diagram of a role hierarchy in which parent roles inherit the capabilities of their child roles](/assets/images/rbac-role-hierarchy.webp)

Often, you will have many Roles in a system and you will want some roles to include all of the capabilities of other roles. For example, you may want a System Administrator to have access to everything that an Organization Administrator has access to, who has everything that a Project Administrator has access to, and so on. We refer to this concept as the 'Role Hierarchy' and it is represented by allowing Roles to have "Parent Roles". Any capability that a Role has is implicitly granted to any parent roles (or parents of those parents, and so on). Of course Roles can have more than one parent, and capabilities are implicitly granted to all parents.

![Diagram of a more complex role hierarchy in which roles have multiple parents](/assets/images/rbac-heirarchy-morecomplex.webp)

RBAC controls also give you the capability to explicitly permit User and Teams of Users to run playbooks against certain sets of hosts. Users and teams are restricted to just the sets of playbooks and hosts to which they are granted capabilities. And, with Ascender, you can create or import as many Users and Teams as you require--create users and teams manually or import them from LDAP or Active Directory.

RBACs are easiest to think of in terms of who or what can see, change, or delete an "object" for which a specific capability is being determined.

### Applying RBAC

The following sections cover how to apply Ascender's RBAC system in your environment.

#### Editing Users

When editing a user, an Ascender system administrator may specify the user as being either a *System Administrator* (also referred to as the Superuser) or a *System Auditor*.

- System administrators implicitly inherit all capabilities for all objects (read/write/execute) within the Ascender environment.
- System Auditors implicitly inherit the read-only capability for all objects within the Ascender environment.

#### Editing Organizations

When editing an organization, system administrators may specify the following roles:

- One or more users as organization administrators
- One or more users as organization auditors
- And one or more users (or teams) as organization members

Users/teams that are members of an organization can view their organization administrator.

Users who are organization administrators implicitly inherit all capabilities for all objects within that Ascender organization.

Users who are organization auditors implicitly inherit the read-only capability for all objects within that Ascender organization.

#### Editing Projects in an Organization

When editing a project in an organization for which they are the administrator, system administrators and organization administrators may specify:

- One or more users/teams that are project administrators
- One or more users/teams that are project members
- And one or more users/teams that may update the project from SCM, from among the users/teams that are members of that organization.

Users who are members of a project can view their project administrators.

Project administrators implicitly inherit the capability to update the project from SCM.

Administrators can also specify one or more users/teams (from those that are members of that project) that can use that project in a job template.

#### Creating Inventories and Credentials within an Organization

All access that is granted to use, read, or write credentials is handled through roles, which use Ascender's RBAC system to grant ownership, auditor, or usage roles.

System administrators and organization administrators may create inventories and credentials within organizations under their administrative capabilities.

Whether editing an inventory or a credential, System administrators and organization administrators may specify one or more users/teams (from those that are members of that organization) to be granted the usage capability for that inventory or credential.

System administrators and organization administrators may specify one or more users/teams (from those that are members of that organization) that have the capabilities to update (dynamic or manually) an inventory. Administrators can also execute ad hoc commands for an inventory.

#### Editing Job Templates

System administrators, organization administrators, and project administrators, within a project under their administrative capabilities, may create and modify new job templates for that project.

When editing a job template, administrators (Ascender, organization, and project) can select among the inventory and credentials in the organization for which they have usage capabilities or they may leave those fields blank so that they will be selected at runtime.

Additionally, they may specify one or more users/teams (from those that are members of that project) that have execution capabilities for that job template. The execution capability is valid regardless of any explicit capabilities the user/team may have been granted against the inventory or credential specified in the job template.

#### User View

A user can:

- See any organization or project for which they are a member
- Create their own credential objects which only belong to them
- See and execute any job template for which they have been granted execution capabilities

If a job template that a user has been granted execution capabilities on does not specify an inventory or credential, the user will be prompted at run-time to select among the inventory and credentials in the organization they own or have been granted usage capabilities.

Users that are job template administrators can make changes to job templates; however, to change to the inventory, project, playbook, credentials, or instance groups used in the job template, the user must also have the "Use" role for the project and inventory currently being used or being set.

### Roles

All access that is granted to use, read, or write credentials is handled through roles, and roles are defined for a resource.

#### Built-in roles

The following table lists the RBAC system roles and a brief description of the how that role is defined with regard to privileges in Ascender.

| System Role | What it can do |
| --- | --- |
| System Administrator - System wide singleton | Manages all aspects of the system |
| System Auditor - System wide singleton | Views all aspects of the system |
| Ad Hoc Role - Inventory | Runs ad hoc commands on an Inventory |
| Admin Role - Organizations, Teams, Inventory, Projects, Job Templates | Manages all aspects of a defined Organization, Team, Inventory, Project, or Job Template |
| Auditor Role - All | Views all aspects of a defined Organization, Team, Inventory, Project, or Job Template |
| Execute Role - Job Templates | Runs assigned Job Template |
| Member Role - Organization, Team | User is a member of a defined Organization or Team |
| Read Role - Organizations, Teams, Inventory, Projects, Job Templates | Views all aspects of a defined Organization, Team, Inventory, Project, or Job Template |
| Update Role - Project | Updates the Project from the configured source control management system |
| Update Role - Inventory | Updates the Inventory using the cloud source update system |
| Admin Role - Credential | Manages all aspects of this Credential |
| Use Role - Credential, Inventory, Project, IGs, CGs | Uses the Credential, Inventory, Project, IGs, or CGs in a Job Template |

A Singleton Role is a special role that grants system-wide permissions. Ascender currently provides two built-in Singleton Roles but the ability to create or customize a Singleton Role is not supported at this time.

#### Common Team Roles - "Personas"

Support personnel typically works on ensuring that Ascender is available and manages it a way to balance supportability and ease-of-use for users. Often, support will assign "Organization Owner/Admin" to users in order to allow them to create a new Organization and add members from their team the respective access needed. This minimizes supporting individuals and focuses more on maintaining uptime of the service and assisting users who are using Ascender.

Below are some common roles managed by the Ascender Organization:

| System Role (for Organizations) | Common User Roles | Description |
| --- | --- | --- |
| Owner | Team Lead - Technical Lead | This user has the ability to control access for other users in their organization. They can add/remove and grant users specific access to projects, inventories, and job templates. This user also has the ability to create/remove/modify any aspect of an organization's projects, templates, inventories, teams, and credentials. |
| Auditor | Security Engineer - Project Manager | This account can view all aspects of the organization in read-only mode. This may be good for a user who checks in and maintains compliance. This might also be a good role for a service account who manages or ships job data from Ascender to some other data collector. |
| Member - Team | All other users | These users by default as an organization member do not receive any access to any aspect of the organization. In order to grant them access the respective organization owner needs to add them to their respective team and grant them Admin, Execute, Use, Update, Ad-hoc permissions to each component of the organization's projects, inventories, and job templates. |
| Member - Team "Owner" | Power users - Lead Developer | Organization Owners can provide "admin" through the team interface, over any component of their organization including projects, inventories, and job templates. These users are able to modify and utilize the respective component given access. |
| Member - Team "Execute" | Developers - Engineers | This will be the most common and allows the organization member the ability to execute job templates and read permission to the specific components. This permission applies to templates. |
| Member - Team "Use" | Developers - Engineers | This permission applies to an organization's credentials, inventories, and projects. This permission allows the ability for a user to use the respective component within their job template. |
| Member - Team "Update" | Developers - Engineers | This permission applies to projects. Allows the user to be able to run an SCM update on a project. |

## Function of roles: editing and creating

Organization "resource roles" functionality are specific to a certain resource type - such as workflows. Being a member of such a role usually provides two types of permissions, in the case of workflows, where a user is given a "workflow admin role" for the organization "Default":

- this user can create new workflows in the organization "Default"
- user can edit all workflows in the "Default" organization

One exception is job templates, where having the role is irrelevant of creation permission (more details on its own section).

### Independence of resource roles and organization membership roles

Resource-specific organization roles are independent of the organization roles of admin and member. Having the "workflow admin role" for the "Default" organization will not allow a user to view all users in the organization, but having a "member" role in the "Default" organization will. The two types of roles are delegated independently of each other.

#### Necessary permissions to edit job templates

Users can edit fields not impacting job runs (non-sensitive fields) with a Job Template admin role alone. However, to edit fields that impact job runs in a job template, a user needs the following:

- **admin** role to the job template and container groups
- **use** role to related project
- **use** role to related inventory
- **use** role to related instance groups

An "organization job template admin" role was introduced, but having this role isn't sufficient by itself to edit a job template within the organization if the user does not have use role to the project / inventory / instance group or an admin role to the container group that a job template uses.

In order to delegate *full* job template control (within an organization) to a user or team, you will need grant the team or user all 3 organization-level roles:

- job template admin
- project admin
- inventory admin

This will ensure that the user (or all users who are members of the team with these roles) have full access to modify job templates in the organization. If a job template uses an inventory or project from another organization, the user with these organization roles may still not have permission to modify that job template. For clarity of managing permissions, it is best-practice to not mix projects / inventories from different organizations.

#### RBAC permissions

Each role should have a content object, for instance, the org admin role has a content object of the org. To delegate a role, you need admin permission to the content object, with some exceptions that would result in you being able to reset a user's password.

**Parent** is the organization.

**Allow** is what this new permission will explicitly allow.

**Scope** is the parent resource that this new role will be created on. Example: `Organization.project_create_role`.

An assumption is being made that the creator of the resource should be given the admin role for that resource. If there are any instances where resource creation does not also imply resource administration, they will be explicitly called out.

Here are the rules associated with each admin type:

##### Project Admin

- Allow: Create, read, update, delete any project
- Scope: Organization
- User Interface: *Project Add Screen - Organizations*

##### Inventory Admin

- Parent: Org admin
- Allow: Create, read, update, delete any inventory
- Scope: Organization
- User Interface: *Inventory Add Screen - Organizations*

<Hint type="note">

As it is with the **Use** role, if you give a user Project Admin and Inventory Admin, it allows them to create Job Templates (not workflows) for your organization.

</Hint>

##### Credential Admin

- Parent: Org admin
- Allow: Create, read, update, delete shared credentials
- Scope: Organization
- User Interface: *Credential Add Screen - Organizations*

##### Notification Admin

- Parent: Org admin
- Allow: Assignment of notifications
- Scope: Organization

##### Workflow Admin

- Parent: Org admin
- Allow: Create a workflow
- Scope: Organization

##### Org Execute

- Parent: Org admin
- Allow: Executing JTs and WFJTs
- Scope: Organization

The following is a sample scenario showing an organization with its roles and which resource(s) each have access to:

![Sample scenario of an organization with its roles and the resources each role can access](/assets/images/rbac-multiple-resources-scenario.webp)
