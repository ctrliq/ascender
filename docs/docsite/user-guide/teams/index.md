---
title: Teams
description: Create Ascender teams within an organization, add users to them, and grant team-wide roles on projects, inventories, templates, and other resources.
weight: 12
---

A Team is a subdivision of an organization with associated users, projects, credentials, and permissions. Teams provide a means to implement role-based access control schemes and delegate responsibilities across organizations. For instance, permissions may be granted to a whole Team rather than each user on the Team.

You can create as many Teams of users as make sense for your Organization. Each Team can be assigned permissions, just as with Users. Teams can also scalably assign ownership for Credentials, preventing multiple interface click-throughs to assign the same Credentials to the same user.

Access the Teams page by clicking **Teams** from the left navigation bar. The team list may be sorted and searched by **Name** or **Organization**.

![Teams page containing a list of teams and the organizations they belong to](/assets/images/organizations-teams-list.webp)

Clicking the **Edit** (pencil) icon next to the list of **Teams** allows you to edit details about the team. You can also review the users of this Team in its **Access** tab and its permissions in its **Roles** tab.

## Create a Team

To create a new Team:

1. Click the **Add** button.

   ![Create New Team form](/assets/images/teams-create-new-team.webp)

2. Enter the appropriate details into the following fields:

   - Name
   - Description (optional)
   - Organization (Choose from an existing organization)

3. Click **Save**.

Once the Team is successfully created, Ascender opens the **Details** dialog, which also allows you to review and edit your Team information.

![Details tab of an example team that was successfully created](/assets/images/teams-example-team-successfully-created.webp)

### Team Access

This tab displays the list of Users that are members of this Team. This list may be searched by **Username**, **First Name**, or **Last Name**. For more information, refer to [Users](../users).

![Teams list showing the Access tab displaying a list of users and their roles](/assets/images/teams-users-list.webp)

#### Add a User

In order to add a user to a team, the user must already be created. Refer to [Create a User](../users#create-a-user) to create a user. Adding a user to a team adds them as a member only, specifying a role for the user on different resources can be done in the **Access** tab. To add existing users to the Team:

1. In the **Access** tab, click the **Add** button.
2. Follow the prompts to add user(s) and assign them to roles.
3. Click **Save** when done.

To remove roles for a particular user, click the disassociate (x) button next to its resource.

![Access tab with list of users and an arrow pointing to the disassociate button next to a user's role](/assets/images/permissions-disassociate.webp)

This launches a confirmation dialog, asking you to confirm the disassociation.

![Disassociation confirmation dialog](/assets/images/permissions-disassociate-confirm.webp)

### Team Roles

Selecting the **Roles** view displays a list of the permissions that are currently available for this Team. The list shows each permission's **Resource Name**, **Type**, and **Role**. It can be searched by **Role**, and sorted by the **Role** column, which orders the permissions by their ID.

![Permissions list with resource names, type, and their associated roles](/assets/images/teams-permissions-sample-roles.webp)

The set of privileges assigned to Teams that provide the ability to read, modify, and administer projects, inventories, and other Ascender elements are permissions. By default, the Team is given the "read" permission (also called a role).

Permissions must be set explicitly via an Inventory, Project, Job Template, or within the Organization view.

#### Add Team Permissions

To add permissions to a Team:

1. Click the **Add** button, which opens the Add Permissions Wizard.

   ![Add Team Permissions wizard step 1, choose the resource type](/assets/images/teams-users-add-permissions-form.webp)

2. Click to select the object for which the team will have access and click **Next**.
3. Click to select the resource to assign team roles and click **Next**.

   ![Add Team Permissions wizard step 2, choose the resources from the list with Demo Job Template selected](/assets/images/teams-permissions-templates-select.webp)

4. Click the checkbox beside the role to assign that role to your chosen type of resource. Different resources have different options available.

   ![Add Team Permissions wizard step 3, choose the roles to apply to the previously selected resource](/assets/images/teams-permissions-template-roles.webp)

5. Click **Save** when done, and the Add Permissions Wizard closes to display the updated profile for the team with the roles assigned for each selected resource.

   ![Updated profile for each team's resources and their roles](/assets/images/teams-permissions-sample-roles.webp)

To remove Permissions for a particular resource, click the disassociate (x) button next to its resource. This launches a confirmation dialog, asking you to confirm the disassociation.

<Hint type="note">

You can also add teams, individual, or multiple users and assign them permissions at the object level (projects, inventories, job templates, and workflow templates) as well. This feature reduces the time for an organization to onboard many users at one time.

</Hint>
