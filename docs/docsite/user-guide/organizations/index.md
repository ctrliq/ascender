---
title: Organizations
description: Create and manage Ascender organizations, the top-level collection of users, teams, projects, and inventories, and manage their access and notifications.
weight: 10
---

An Organization is a logical collection of **Users**, **Teams**, **Projects**, and **Inventories**, and is the highest level in the Ascender object hierarchy.

![Ascender object hierarchy with organizations at the top containing users, teams, projects, and inventories](/assets/images/ascenderhierarchy.webp)

Access the Organizations page by clicking **Organizations** from the left navigation bar. The Organizations page displays all of the existing organizations for your installation. Organizations can be searched by **Name** or **Description**. Modify and remove organizations using the **Edit** and **Delete** buttons.

<Hint type="note">

A default organization is automatically created.

</Hint>

![Example of organizations home page](/assets/images/organizations-home-showing-example-organization.webp)

From this list view, you can edit the details of an organization by clicking the **Edit** (pencil) icon from the **Actions** menu.

## Creating a New Organization

1. You can create a new organization by clicking the **Add** button.

   ![Create new organization form](/assets/images/organizations-new-organization-form.webp)

2. An organization has several attributes that may be configured:

   - Enter the **Name** for your organization (required).
   - Enter a **Description** for the organization.
   - Enter **Instance Groups** on which to run this organization.
   - Enter the name of the execution environment or search for an existing **Execution Environment** on which to run this organization. See [Execution Environments](../execution-environments) for more information.
   - If used, enter the **Galaxy Credentials** or search from a list of existing ones.

3. Click **Save** to finish creating the organization.

Once created, Ascender displays the Organization details, and allows for the managing access and execution environments for the organization.

![Organization details tab with edit and delete options](/assets/images/organizations-show-record-for-example-organization.webp)

From the **Details** tab, you can edit or delete the organization.

<Hint type="note">

If deleting items that are used by other work items, a message opens listing the items are affected by the deletion and prompts you to confirm the deletion. Some screens will contain items that are invalid or previously deleted, so they will fail to run. Below is an example of such a message:

![Deletion warning dialog listing the work items affected by the deletion](/assets/images/warning-deletion-dependencies.webp)

</Hint>

## Work with Access

Clicking on **Access** (beside **Details** when viewing your organization), displays all the Users associated with this Organization and their roles.

![Organization Access tab with user permissions](/assets/images/organizations-show-users-permissions-organization.webp)

As you can manage the user membership for this Organization here, you can manage user membership on a per-user basis from the Users page by clicking **Users** from the left navigation bar. Organizations have a unique set of roles not described here. You can assign specific users certain levels of permissions within your organization, or allow them to act as an admin for a particular resource. Refer to [Role-Based Access Controls](../security#role-based-access-controls) for more information.

Clicking on a user brings up that user's details, allowing you to review, grant, edit, and remove associated permissions for that user. For more information, refer to [Users](../users).

### Add a User or Team

In order to add a user or team to an organization, the user or team must already be created. See [Create a User](../users#create-a-user) and [Create a Team](../teams#create-a-team) for additional detail. To add existing users or team to the Organization:

1. In the **Access** tab, click the **Add** button.
2. Select a user or team to add and click **Next**.
3. Select one or more users or teams from the list by clicking the check box(es) next to the name(s) to add them as members and click **Next**.

   ![Add Users wizard with two users selected](/assets/images/organizations-add-users-for-example-organization.webp)

   In this example, two users have been selected to be added.

4. Select the role(s) you want the selected user(s) or team(s) to have. Be sure to scroll down for a complete list of roles. Different resources have different options available.

   ![Add Users wizard showing the roles to apply to the selected users](/assets/images/organizations-add-users-roles.webp)

5. Click the **Save** button to apply the roles to the selected user(s) or team(s) and to add them as members.

The Add Users/Teams window closes to display the updated roles assigned for each user and team.

![Access tab with role assignments for each user](/assets/images/permissions-tab-roles-assigned.webp)

To remove roles for a particular user, click the disassociate (x) button next to its resource.

![Access tab with the disassociate button next to a user's role](/assets/images/permissions-disassociate.webp)

This launches a confirmation dialog, asking you to confirm the disassociation.

![Disassociation confirmation dialog](/assets/images/permissions-disassociate-confirm.webp)

<Hint type="note">

A user or team with roles associated will retain them even after they have been reassigned to another organization.

</Hint>

## Work with Notifications

Clicking the **Notifications** tab allows you to review any notification integrations you have set up.

![List of sample organization notifications](/assets/images/organizations-notifications-samples-list.webp)

Use the toggles to enable or disable the notifications to use with your particular organization. For more detail, see [Enable and Disable Notifications](../notifications#enable-and-disable-notifications).

If no notifications have been set up, you must create them from the **Notifications** option on the left navigation bar.

![Empty organization notifications list](/assets/images/organization-notifications-empty.webp)

Refer to [Notification Types](../notifications#notification-types) for additional details on configuring various notification types.
