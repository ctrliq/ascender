---
title: Ascender Quickstart
description: Log in to Ascender, review the default organization and credential, create an inventory, project, and job template, and launch your first playbook.
weight: 1
---

Complete the basic steps for using Ascender and running your first playbook.

This guide applies to the latest version of Ascender only. The content in this guide is updated frequently and might contain functionality that is not available in previous versions. Likewise content in this guide can be removed or replaced if it applies to functionality that is no longer available in the latest version.

**Join us online:** you can find lots of Ascender discussion and get answers to questions at the [Ascender Discussion Forum](https://github.com/ctrliq/ascender/discussions).

## Quick Start

Welcome to the Ascender Quick Start Guide. At the end of the Quick Start, you will have a functioning Ascender application that you can use to launch more sophisticated playbooks. You can expect the Quick Start process to take less than thirty minutes.

To begin, you must install Ascender. If you do not have Ascender running yet, see the [K3s quick start in the installation guide](/installation) to get a single-node deployment up, or the [installation guide](/installation) for full installation instructions.

The first playbook executes a simple Ansible task, while teaching you how to use Ascender, as well as ensuring its proper setup. It runs against `localhost` through a local connection, so you don't need a separate target system. Later you can run playbooks against any sort of system manageable by Ansible, as described in the [Managed nodes](https://docs.ansible.com/ansible/latest/user_guide/basic_concepts.html#managed-nodes) section of the Ansible documentation.

## Login as a Superuser

Using the login information provided after your installation completed, open a web browser and log in to Ascender by browsing to its server URL at: `https://<ASCENDER_SERVER_NAME>/`

Once the Ascender UI is accessible, use the credentials specified during the installation process to log in. The default username is `admin`. The password for `admin` is the value specified for `ASCENDER_ADMIN_PASSWORD` in your installer configuration.

These defaults can be changed later by clicking **Users** from the left navigation bar.

![Ascender login form with username and password fields](/assets/images/qs-login-form.webp)

## Examine the Ascender Dashboard

The Dashboard offers a friendly graphical framework for your IT orchestration needs. Along the left side of the Dashboard is the navigation menu, where you can quickly display different views, navigate to your resources, grant access, and administer certain Ascender features in the UI.

Click the **Menu** (hamburger) icon at the top of the left navigation to hide or display the navigation bar.

On the main Dashboard view, a summary appears listing your current **Job Status**. You can filter the job status within a period of time or by job type. Also available in their respective tabs are summaries of **Recent Jobs** ran and **Recent Templates** used. These can be sorted by various attributes.

![Ascender Dashboard showing the Job Status chart and the Recent Jobs and Recent Templates tabs](/assets/images/home-dashboard.webp)

The very last item in the navigation bar is **Settings**, which provides access to the Ascender configuration Settings.

The Settings page allows administrators to configure authentication, jobs, system-level attributes, and customize the user interface. Refer to the [Configuration](/admin-guide/configuration) section for more detail.

![Ascender Settings page listing the authentication, jobs, system, and user interface settings categories](/assets/images/ug-settings-menu-screen.webp)

Regardless of the window or action you're performing, the very top of each page next to your user icon is the question mark icon. It opens a menu with **Help**, which opens the documentation, and **About**, which shows the version of Ascender you are running.

<Hint type="note">

Keep in mind that the goal of this Quick Start is to launch a simple playbook. To do this, a number of configuration options must be set up. Completing the quick start configuration tasks now ensures that Ascender is configured properly and allows for easier executions of more involved playbooks later on.

</Hint>

## The Settings Page

To enter the Settings window for Ascender, click **Settings** from the left navigation bar. This page allows you to modify your Ascender configuration, such as settings associated with authentication, jobs, system, and user interface.

![The main settings window for Ascender](/assets/images/ug-settings-menu-screen.webp)

For more information on configuring these settings, refer to the [Configuration](/admin-guide/configuration) section of the [Ascender Administration Guide](/admin-guide).

## Review the Organization

An organization is a logical collection of users, teams, projects, and inventories. It is the highest level object in the Ascender object hierarchy.

From the left navigation bar, click **Organizations**.

<Hint type="note">

Ascender creates a default organization automatically.

</Hint>

![Organizations list view showing the Default organization](/assets/images/organizations-home-showing-example-organization.webp)

A default organization has been automatically created and is available to all users of Ascender. It can be used as is or edited later as needed, but deleting it is not recommended.

For the purpose of this Quick Start Guide, leave the default organization as is.

To edit the default organization later, expand its properties by clicking the **Edit** (pencil) icon and entering the appropriate details, then save your changes.

![Organizations list view with the Edit icon highlighted next to the Default organization](/assets/images/qs-organization-list-view-edit-icon.webp)

![Edit form for the Default organization with its name, description, and other properties](/assets/images/qs-organization-default-expand-properties.webp)

To add a new organization, refer to the [Organizations](../organizations) section in the [Ascender User Guide](..).

## Create a User

Users associated with an organization are shown in the **Access** tab of the Organization.

![Access tab of the Default organization listing the admin user](/assets/images/qs-organizations-admin-user-default-organization.webp)

A default `admin` user with the role of System Administrator has been automatically created and is available to all users of Ascender. It can be used as is or edited later as needed. You may add other users to an organization, but you must create the user(s) first. Refer to the [Users](../users#create-a-user) section in the [Ascender User Guide](..) for detail.

For the purpose of this Quick Start Guide, leave the default user as is.

## Create an Inventory

An inventory is a collection of hosts managed by Ascender. Organizations are assigned to inventories, while permissions to launch playbooks against inventories are controlled at the user and/or team level. For more information, refer to [Inventories](../inventories), [Users - Permissions](../users#add-permissions), and [Teams - Permissions](../teams#add-a-user) in the [Ascender User Guide](..).

A new installation has no inventories, so create one for this Quick Start:

1. Click **Inventories** from the left navigation bar.
2. Click **Add**, then select **Add inventory**.
3. Enter a **Name**, such as `Quick Start Inventory`, and select the **Default** organization in the **Organization** field.
4. Click **Save**.

For the other fields of the form, refer to [Add a new inventory](../inventories#add-a-new-inventory) in the [Ascender User Guide](..).

As with organizations, inventories also have associated users and teams that you can view through the **Access** tab.

### Groups and Hosts

Inventories are divided into groups and hosts. A group might represent a particular environment (e.g. "Datacenter 1" or "Stage Testing"), a server type (e.g. "Application Servers" or "DB Servers"), or any other representation of your environment. The groups and hosts that belong to an inventory are shown in its **Groups** and **Hosts** tabs, respectively.

For the purposes of this Quick Start and to test that Ascender is set up properly, add a single host that Ansible reaches through a local connection, so that the playbook runs inside the job's own execution environment:

1. In the inventory you created, click the **Hosts** tab.
2. Click **Add**.
3. Enter `localhost` as the **Name**.
4. In **Variables**, enter:

   ```yaml
   ansible_connection: local
   ansible_python_interpreter: '{{ ansible_playbook_python }}'
   ```

5. Click **Save**.

Suppose that your organization has a group of web server hosts supporting a particular application. To add these hosts to the inventory, create a group in the **Groups** tab and add the web server hosts to it. Refer to [Add groups](../inventories#add-groups) and [Add hosts](../inventories#add-hosts) for detail.

## Review the Credentials

Credentials authenticate the Ascender user to launch Ansible playbooks, which can include passwords and SSH keys, against inventory hosts. You can also require the Ascender user to enter a password or key phrase when a playbook launches using the credentials feature of Ascender.

Access the list of credentials by clicking **Credentials** from the left navigation bar.

After installation, the only credential is **Ansible Galaxy**, which the **Default** organization uses to install roles and collections from Ansible Galaxy. The provided Galaxy credential serves as a template and can only be copied and not edited. You may add more credentials as necessary. Refer to [Add a New Credential](../credentials#add-a-new-credential) in the [Ascender User Guide](..) for detail.

The `localhost` host of this Quick Start uses a local connection, so its job template needs no credential. To run playbooks against other machines, create a [Machine](../credentials#machine) credential with the user name and password or SSH key that logs in to them, and select it in the job template's **Credentials** field.

<Hint type="note">

When setting up additional credentials, keep in mind that the user you assign must have root access or be able to use SSH to connect to the host machine.

</Hint>

## Setting up a Project

A Project is a logical collection of Ansible playbooks, represented in Ascender.

You can manage playbooks and playbook directories by either placing them manually under the Project Base Path on your Ascender server, or by placing your playbooks into a source code management (SCM) system supported by Ascender: Git, Subversion, or a Remote Archive.

<Hint type="note">

It is recommended that, whenever possible, you use source control to manage your playbooks. This type of best practice provides the ability to treat your infrastructure as code and is in line with DevOps ideals. While this Quick Start Guide uses lightweight examples to get you up and running, we suggest using source control to manage playbooks for production purposes.

</Hint>

A new installation has no projects. Create one from a public Git repository of sample playbooks:

1. Click **Projects** from the left navigation bar.
2. Click **Add**.
3. Enter a **Name**, such as `Quick Start Project`, and select the **Default** organization in the **Organization** field.
4. Select **Git** as the **Source Control Type**.
5. Enter `https://github.com/ansible/ansible-tower-samples` as the **Source Control URL**.
6. Click **Save**.

Immediately after a project that uses source control is saved, a sync automatically starts that fetches the playbooks from the configured source control. Wait until the project's status is **Successful** before you create the job template, as its playbook list comes from the sync.

To fetch the latest changes later, start a sync manually: from the project's Details tab, click **Sync**, or from the Projects list view, click the **Sync** (circular arrows) icon next to the project name. To edit the project, from the Details tab, click **Edit**, or from the Projects list view, click the **Edit** (pencil) icon next to the project name, then save your changes. For the other project fields, refer to [Add a new project](../projects#add-a-new-project).

## Create a new Job Template

A job template combines an Ansible playbook from a project and the settings required to launch it. To create one for this Quick Start:

1. Click **Templates** from the left navigation bar.
2. Click **Add**, then select **Add job template**.
3. Enter a **Name**, such as `Quick Start Job Template`.
4. In **Inventory**, select the inventory you created.
5. In **Project**, select the project you created.
6. In **Playbook**, select `hello_world.yml`.
7. Click **Save**.

Leave **Credentials** empty: the `localhost` host needs none. For the other fields of the form, refer to [Create a Job Template](../job-templates#create-a-job-template).

To edit the template later, from the Details tab, click **Edit**, or from the Templates list view, click the **Edit** (pencil) icon next to the template name, then save your changes.

## Launch it

From the Templates list view, click **Launch** (rocket icon) next to the job template, or click **Launch** on its Details tab.

The launch opens the job's output page, which updates automatically until the job is complete. The playbook prints a `Hello World!` message from `localhost`, and the job's status turns to **Successful**.

For more details on the job results, refer to [Jobs](../jobs).

Congratulations! Your Ascender installation is officially set up and running properly. To learn more about these Ascender features or to learn about administration tasks, the Ascender API, etc., refer to the following documentation sets:

- [Ascender User Guide](..)
- [Ascender Administration Guide](/admin-guide)
- [Ascender API Guide](../rest-api)
- [Ascender Release Notes](/release-notes)
- [Ansible Documentation](http://docs.ansible.com/)
