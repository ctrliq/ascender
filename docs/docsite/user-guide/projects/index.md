---
title: Projects
description: Create and manage Ascender projects, which supply playbooks from source control, a remote archive, or the project base path.
weight: 40
---

A project is a logical collection of Ansible playbooks.

You can manage playbooks and playbook directories by either placing them manually under the Project Base Path on your server, or by placing your playbooks into a source code management (SCM) system supported by Ascender, including Git and Subversion.

<Hint type="note">

By default, the Project Base Path is `/var/lib/ascender/projects`, set with the `ASCENDER_PROJECTS_ROOT` environment variable.

</Hint>

The **Projects** page displays the list of the projects that are currently available. The default view is collapsed (**Compact**) with the project name and its status, but you can use the arrow next to each entry to expand it for more information.

![Compact Projects list view with two projects shown](/assets/images/projects-list-all.webp)

![Projects list view showing the arrows used to expand and collapse projects](/assets/images/projects-list-all-expanded.webp)

For each project listed, you can get the latest SCM revision (**Sync**, the refresh icon), edit the project (**Edit**, the pencil icon), or copy the project attributes (**Copy**, the copy icon), using the respective icons next to each project. Projects are allowed to be updated while a related job is running. In cases where you have a big project (around 10 GB), disk space on `/tmp` may be an issue.

**Status** indicates the state of the project and may be one of the following (you can also filter your view by specific status types):

- **Pending**: The source control update has been created, but not queued or started yet. Any job (not just source control updates) stays in pending until it is actually ready to be run by the system. Reasons for it not being ready include dependencies that are currently running (so it has to wait until they are done), or not enough capacity to run in the locations it is configured to.
- **Waiting**: The source control update is in the queue waiting to be executed.
- **Running**: The source control update is currently in progress.
- **Successful**: The last source control update for this project succeeded.
- **Failed**: The last source control update for this project failed.
- **Error**: The last source control update job failed to run at all. (To be deprecated.)
- **Canceled**: The last source control update for the project was canceled.
- **Never updated**: The project is configured for source control, but has never been updated.
- **OK**: The project is not configured for source control, and is correctly in place. (To be deprecated.)
- **Missing**: Projects are absent from the project base path of `/var/lib/ascender/projects` (applicable for manual or source control managed projects).

<Hint type="note">

Projects of credential type Manual cannot update or schedule source control-based actions without being reconfigured as an SCM type credential.

</Hint>

<Hint type="note">

If deleting items that are used by other work items, a message opens listing the items that are affected by the deletion and prompts you to confirm the deletion. Some screens contain items that are invalid or previously deleted, so they will fail to run. Below is an example of such a message:

![Deletion warning dialog listing the work items that depend on the item being deleted](/assets/images/warning-deletion-dependencies.webp)

</Hint>

## Add a new project

To create a new project:

1. Click the **Add** button, which launches the **Create Project** window.

   ![Create New Project form](/assets/images/projects-create-new-project.webp)

2. Enter the appropriate details into the following required fields:

   - **Name**
   - **Description** (optional)
   - **Organization**: The organization the project belongs to. A project belongs to exactly one organization, which is required.
   - **Execution Environment** (optional): Enter the name of the execution environment or search from a list of existing ones to run this project. See [Upgrading to execution environments](/admin-guide/upgrade-considerations#upgrading-to-execution-environments) in the [upgrade considerations](/admin-guide/upgrade-considerations) for more information.
   - **Source Control Type**: Select from the drop-down menu list an SCM type associated with this project. The options available in the subsequent section depend on the type you choose. Refer to [Manage playbooks manually](#manage-playbooks-manually) or [Manage playbooks using source control](#manage-playbooks-using-source-control) in the subsequent sections for more detail.
   - **Content Signature Validation Credential**: Use this optional field to enable content verification. Specify the GPG key to use for validating the content signature during project sync. If the content has been tampered with, the job will not run. See [Project Signing and Verification](../project-signing) for more detail.

3. Click **Save** when done.

The following sections describe the ways projects are sourced in Ascender.

### Manage playbooks manually

- Create one or more directories to store playbooks under the Project Base Path (for example, `/var/lib/ascender/projects/`).
- Create or copy playbook files into the playbook directory.
- Ensure that the playbook directory and files are owned by the same UNIX user and group that the Ascender service runs as.
- Ensure that the permissions are appropriate for the playbook directories and files.

If adding a manual project, each project path inside of the project root folder can only be assigned to one project. If you have trouble adding a project path, check the permissions and SELinux context settings for the project directory and files.

<Hint type="warning">

If the base project path has no playbook directory that is not already assigned to another project, either because you have not added any Ansible playbook directories to it or because all of them are assigned to existing projects, you will receive the following message:

![Create New Project form showing the warning displayed when the Manual source control type is selected](/assets/images/projects-create-manual-warning.webp)

Correct this issue by creating the appropriate playbook directories and checking out playbooks from your SCM or otherwise copying playbooks into the appropriate playbook directories.

</Hint>

### Manage playbooks using source control

#### SCM Types - Git and Subversion

To configure playbooks to use source control, in the project **Details** tab:

1. Select the appropriate option (Git or Subversion) from the **Source Control Type** drop-down menu list.

   ![Create New Project form for the Git source control type](/assets/images/projects-create-scm-project.webp)

2. Enter the appropriate details into the following fields:

   - **Source Control URL**: See an example in the tooltip (the **?** help icon).
   - **Source Control Branch/Tag/Commit** (**Revision #** for Subversion): Optionally enter the SCM branch, tags, commit hashes, arbitrary refs, or revision number (if applicable) from the source control (Git or Subversion) to checkout. Some commit hashes and refs may not be available unless you also provide a custom refspec in the next field. If left blank, the default is HEAD, which is the last checked out Branch/Tag/Commit for this project.
   - **Source Control Refspec**: This field is an option specific to git source control, and only advanced users familiar and comfortable with git should specify which references to download from the remote repository. For more detail, see [job branch overriding](../jobs#job-branch-overriding).
   - **Source Control Credential**: If authentication is required, select the appropriate source control credential.

3. In the **Options**, optionally select the launch behavior, if applicable.

   - **Clean**: Removes any local modifications prior to performing an update.
   - **Delete**: Deletes the local repository in its entirety prior to performing an update. Depending on the size of the repository this may significantly increase the amount of time required to complete an update.
   - **Track submodules**: Tracks the latest commit. See more details in the tooltip (the **?** help icon).
   - **Update Revision on Launch**: Updates the revision of the project to the current revision in the remote source control, as well as caches the roles directory from [Galaxy](#ansible-galaxy-support) or [Collections](#collections-support). Ascender ensures that the local revision matches and that the roles and collections are up-to-date with the last update. Also, to avoid job overflows if jobs are spawned faster than the project can sync, selecting this allows you to configure a Cache Timeout to cache prior project syncs for a certain number of seconds.
   - **Allow Branch Override**: Allows a job template or an inventory source that uses this project to launch with a specified SCM branch or revision other than that of the project's. For more detail, see [job branch overriding](../jobs#job-branch-overriding).
   - **Reuse Downloaded Requirements**: Selected by default. Reuses the roles and collections downloaded for an earlier revision of the project while its requirements files and the organization's Galaxy credentials are unchanged, instead of downloading them in every update. See [Galaxy](#ansible-galaxy-support) for when they are downloaded again.

   ![Create New Project form with the Allow Branch Override option selected](/assets/images/projects-create-scm-project-branch-override-checked.webp)

4. Click **Save** to save your project.

<Hint type="tip">

Using a GitHub link offers an easy way to use a playbook. To help get you started, use the `gather_facts.yml` file available at [https://github.com/ctrliq/ascender-playbooks.git](https://github.com/ctrliq/ascender-playbooks.git).

This link offers a very similar playbook to the one created manually in the [Quick Start](../quick-start). Using it will not alter or harm your system in any way.

</Hint>

#### SCM Type - Remote Archive

Playbooks using a remote archive allow projects to be provided based on a build process that produces a versioned artifact, or release, containing all the requirements for that project in a single archive.

To configure playbooks to use a remote archive, in the project **Details** tab:

1. Select **Remote Archive** from the **Source Control Type** drop-down menu list.

2. Enter the appropriate details into the following fields:

   - **Source Control URL**: Requires a URL to a remote archive, such as a *GitHub Release* or a build artifact stored in *Artifactory*, and unpacks it into the project path for use.
   - **Source Control Credential**: If authentication is required, select the appropriate source control credential.

3. In the **Options**, optionally select the launch behavior, if applicable.

   - **Clean**: Removes any local modifications prior to performing an update.
   - **Delete**: Deletes the local repository in its entirety prior to performing an update. Depending on the size of the repository this may significantly increase the amount of time required to complete an update.
   - **Update Revision on Launch**: Not recommended, as this option updates the revision of the project to the current revision in the remote source control, as well as caches the roles directory from [Galaxy](#ansible-galaxy-support) or [Collections](#collections-support).
   - **Allow Branch Override**: Not recommended, as this option allows a job template that uses this project to launch with a specified SCM branch or revision other than that of the project's.
   - **Reuse Downloaded Requirements**: Selected by default. Reuses the roles and collections downloaded for an earlier revision of the project while its requirements files and the organization's Galaxy credentials are unchanged.

   ![Create New Project form for the Remote Archive source control type](/assets/images/projects-create-scm-rm-archive.webp)

4. Click **Save** to save your project.

<Hint type="note">

Since this SCM type is intended to support the concept of unchanging artifacts, it is advisable to disable Galaxy integration (for roles, at minimum).

</Hint>

## Updating projects from source control

1. Update an existing SCM-based project by selecting the project and clicking the **Sync** (refresh) icon.

   ![Projects list view with the latest revision information of the projects that synced](/assets/images/projects-list-all.webp)

2. Click the project's status under the **Status** column to get further details about the update process.

   ![Projects list view with an example project that has a successful status](/assets/images/projects-list-status-more.webp)

   ![Example project update with real-time standard output details](/assets/images/projects-update-status.webp)

<Hint type="note">

Immediately after adding a project set up to use source control, a "Sync" starts that fetches the project details from the configured source control.

</Hint>

## Work with Permissions

The set of permissions assigned to this project (role-based access controls) that provide the ability to read, modify, and administer projects, inventories, job templates, and other Ascender elements are privileges.

You can access the project permissions from the **Access** tab next to the **Details** tab. This screen displays a list of users that currently have permissions to this project. The list may be sorted and searched by **Username**, **First Name**, or **Last Name**.

![Access tab of a sample project that shows the list of users who have permissions to this project](/assets/images/projects-permissions-example.webp)

### Add Permissions

1. In the **Access** tab, click the **Add** button.

2. Select a user or team to add and click **Next**.

3. Select one or more users or teams from the list by clicking the check boxes next to the names to add them as members, and click **Next**.

   ![Add Users dialog with two users selected](/assets/images/organizations-add-users-for-example-organization.webp)

   In this example, two users have been selected to be added.

4. Select the roles you want the selected users or teams to have. Be sure to scroll down for a complete list of roles. Different resources have different options available.

   ![Add Users dialog showing the roles available to apply to the selected users](/assets/images/organizations-add-users-roles.webp)

5. Click the **Save** button to apply the roles to the selected users or teams and to add them as members.

The Add Users/Teams window closes to display the updated roles assigned for each user and team.

![Access tab showing the role assignments for each user and team](/assets/images/permissions-tab-roles-assigned.webp)

To remove roles for a particular user, click the disassociate (**x**) button next to its resource.

![Role chip with the disassociate button next to the resource](/assets/images/permissions-disassociate.webp)

This launches a confirmation dialog, asking you to confirm the disassociation.

![Confirmation dialog asking you to confirm removing the role](/assets/images/permissions-disassociate-confirm.webp)

## Work with Notifications

Clicking the **Notifications** tab allows you to review any notification integrations you have set up.

![List of notifications configured for this project](/assets/images/projects-notifications-example-list.webp)

Use the toggles to enable or disable the notifications to use with your particular project. For more detail, see [Enable and Disable Notifications](../notifications#enable-and-disable-notifications).

If no notifications have been set up, you can configure them from the **Notifications** link in the left navigation bar to create a new notification.

![Notification Templates page with no notification templates found](/assets/images/project-notifications-empty.webp)

Refer to [Notification Types](../notifications#notification-types) for additional details on configuring various notification types.

## Work with Job Templates

Clicking **Job Templates** allows you to add and review the job templates that use this project.

![List of job templates associated with this project](/assets/images/projects-templates-example-list.webp)

Click the recent jobs that ran using that template to see its details and other useful information. You can sort this list by various criteria, and perform a search to filter the templates of interest.

![Job Templates tab of the project showing an example drop-down menu used to filter the search](/assets/images/projects-templates-search-dropdown.webp)

From this view, you can also launch (**Launch**, the rocket icon), edit (**Edit**, the pencil icon), or copy (**Copy**, the copy icon) the template configuration.

## Work with Schedules

Clicking **Schedules** allows you to review any schedules set up for this project.

![List of configured schedules that may be used with this project](/assets/images/generic-schedules-list-configured.webp)

### Schedule a Project

To schedule a project run, click the **Schedules** tab.

- If schedules are already set up, review, edit, or enable/disable your schedule preferences.
- If schedules have not been set up, refer to [Schedules](../schedules) for more information.

## Ansible Galaxy Support

At the end of a project update, Ascender searches for a file called `requirements.yml` in the `roles` directory, located at `<project-top-level-directory>/roles/requirements.yml`. If this file is found, the following command automatically runs:

```bash
ansible-galaxy role install -r roles/requirements.yml -p <project-specific cache location>/requirements_roles -vvv
```

This file allows you to reference Galaxy roles or roles within other repositories which can be checked out in conjunction with your own project. The addition of this Ansible Galaxy support eliminates the need to create git submodules for achieving this result. Given that SCM projects (along with roles and collections) are pulled into and executed from a private job environment, a `<private job directory>` specific to the project within `/tmp` is created by default. However, you can specify another **Job Execution Path** based on your environment in the **Jobs** settings tab of the **Settings** window:

![Job Settings page showing where to configure the job execution path](/assets/images/configure-ascender-jobs-execution-path.webp)

The cache directory is a subdirectory inside the global projects folder. The content may be copied from the cache location to the `<job private directory>/requirements_roles` location.

By default, Ascender has a system-wide setting that allows roles to be dynamically downloaded from the `roles/requirements.yml` file for SCM projects. You may turn off this setting in the **Jobs settings** screen of the **Settings** menu by switching the **Enable Role Download** toggle button to **OFF**.

![Job Settings page showing the Enable Role Download option](/assets/images/configure-ascender-jobs-download-roles.webp)

Whenever a project sync runs, Ascender determines if the project source and any roles from Galaxy and/or Collections are out of date with the project. Project updates download the roles inside the update.

If jobs need to pick up a change made to an upstream role, updating the project ensures this happens. A change to the role means that a new commit was pushed to the *provision-role* source control. To make this change take effect in a job, you do not need to push a new commit to the *playbooks* repo, but you **do need** to update the project, which downloads roles to a local cache. For instance, say you have two git repositories in source control. The first one is *playbooks* and the project in Ascender points to this URL. The second one is *provision-role* and it is referenced by the `roles/requirements.yml` file inside of the *playbooks* git repo.

In short, jobs would download the most recent roles before every job run. Roles and collections are locally cached for performance reasons, and you need to select **Update Revision on Launch** in the project's source control **Options** to ensure that the upstream role is re-downloaded before each job run:

![SCM update options with Update Revision on Launch selected](/assets/images/projects-scm-update-options-update-on-launch-checked.webp)

Requirements that come from Galaxy or a private automation hub are installed once and reused by later project revisions for as long as the requirements files and the organization's Galaxy credentials stay the same, so a commit that does not touch them does not download them again. Syncs that run for a job or workflow, such as **Update Revision on Launch**, reuse them. Syncs you start, scheduled syncs, and relaunches always download fresh copies and replace the reused ones, so use one of these to pick up a new release of a requirement that is not pinned to a version. Requirements that point to a source control repository (like *provision-role* above), a URL, a file, or a directory in the project are never reused and are downloaded by every update. To download requirements in every update instead, clear the **Reuse Downloaded Requirements** option of the project.

The update happens much earlier in the process than the sync, so this surfaces errors and details faster and in a more logical place.

For more information and examples on the syntax of the `requirements.yml` file, refer to the [role requirements section](https://docs.ansible.com/ansible/latest/galaxy/user_guide.html#installing-multiple-roles-from-a-file) in the Ansible documentation.

If there are any directories that should specifically be exposed, you can specify those in the **Paths to expose to isolated jobs** field of the **Jobs** settings, or with the `ASCENDER_ISOLATION_SHOW_PATHS` setting in a `PATCH` to `/api/v2/settings/jobs/`:

```json
{"ASCENDER_ISOLATION_SHOW_PATHS": ["/list/of/", "/paths"]}
```

<Hint type="note">

The primary file you may want to add to `ASCENDER_ISOLATION_SHOW_PATHS` is `/var/lib/ascender/.ssh`, if your playbooks need to use keys or settings defined there.

</Hint>

In the user interface, you can configure these settings in the **Jobs** settings window.

![Job Settings page showing example paths to expose to isolated jobs](/assets/images/configure-ascender-jobs-path-to-expose.webp)

## Collections Support

Ascender supports project-specific [Ansible collections](https://docs.ansible.com/ansible/latest/collections_guide/index.html) in job runs. If you specify a collections requirements file in the SCM at `collections/requirements.yml`, Ascender installs the collections in that file in the implicit project sync before a job run.

By default, Ascender has a system-wide setting that allows collections to be dynamically downloaded from the `collections/requirements.yml` file for SCM projects. You may turn off this setting in the **Jobs settings** tab of the **Settings** menu by switching the **Enable Collection(s) Download** toggle button to **OFF**.

![Job Settings page showing where to enable collections download](/assets/images/configure-ascender-jobs-download-collections.webp)

Roles and collections are locally cached for performance reasons, and you need to select **Update Revision on Launch** in the project's source control **Options** to ensure this:

![SCM update options with Update Revision on Launch selected](/assets/images/projects-scm-update-options-update-on-launch-checked.webp)

For more information on collections, refer to [Using Collections](https://docs.ansible.com/ansible/latest/user_guide/collections_using.html).
