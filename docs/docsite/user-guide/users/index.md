---
title: Users
description: Create, edit, and delete Ascender users, review their organizations and teams, assign roles, and manage your own OAuth 2 tokens.
weight: 11
---

A User is someone who has access to Ascender with associated permissions and credentials. Access the Users page by clicking **Users** from the left navigation bar. The User list may be sorted and searched by **Username**, **First Name**, or **Last Name** and click the headers to toggle your sorting preference.

![Users list view with example users](/assets/images/users-home-with-example-users.webp)

You can easily view permissions and user type information by looking beside their user name in the User overview screen.

## Create a User

To create a new user:

1. Click the **Add** button, which opens the Create User dialog.
2. Enter the appropriate details about your new user. Fields marked with an asterisk (\*) are required.

   Three types of Users can be assigned:

   - **Normal User**: Normal Users have read and write access limited to the resources (such as inventory, projects, and job templates) for which that user has been granted the appropriate roles and privileges.
   - **System Auditor**: Auditors implicitly inherit the read-only capability for all objects within the environment.
   - **System Administrator**: A System Administrator (also known as Superuser) has full system administration privileges—with full read and write privileges over the entire installation. A System Administrator is typically responsible for managing all aspects of Ascender and delegating responsibilities for day-to-day work to various Users. Assign with caution!

   ![Create User form with the User Type drop-down showing Normal User, System Auditor, and System Administrator](/assets/images/users-create-user-form-types.webp)

   When editing your own user, the form also offers a **Preferred Theme** field. See [Themes](../user-interface#themes) for the available themes and how the preference is stored.

3. Select **Save** when finished.

<Hint type="note">

A new password takes effect at once. Changing a user's password logs that user out of every session, except that when you change your own password, the session you changed it from stays logged in.

</Hint>

<Hint type="note">

The initial user (usually "admin") created by the installation process is a Superuser. One Superuser must always exist. To delete the "admin" user account, you must first create another Superuser account.

</Hint>

Once the user is successfully created, the **User** dialog opens for that newly created User.

![User details for a newly created user](/assets/images/users-edit-user-form.webp)

You may delete the user from its Details screen by clicking **Delete**, or once you exit the details screen, you can delete users from a list of current users. See [Delete a User](#delete-a-user) for more detail.

The same window opens whether you click on the user's name, or the **Edit** (pencil) icon beside the user. Here, the User's **Organizations**, **Teams**, and **Roles**, as well as other user membership details, may be reviewed and modified.

<Hint type="note">

If the user is not a newly-created user, the user's details screen displays the last login activity of that user.

![User details with last login information](/assets/images/users-last-login-info.webp)

</Hint>

When you log in as yourself, and view the details of your own user profile, you can manage tokens from your user profile. See [Users - Tokens](#users---tokens) for more detail.

![User details with Tokens tab highlighted](/assets/images/user-with-token-button.webp)

## Delete a User

Before you can delete a user, you must have user permissions. When you delete a user account, the name and email of the user are permanently removed from Ascender.

1. Expand the **Access** menu from the left navigation bar, and click **Users** to display a list of the current users.
2. Select the check box(es) for the user(s) that you want to remove and click **Delete**.

   ![Users list view with two users checked](/assets/images/users-home-users-checked-delete.webp)

3. Click **Delete** in the confirmation warning message to permanently delete the user.

## Users - Organizations

This displays the list of organizations of which that user is a member. This list may be searched by **Name**. Organization membership cannot be modified from this display panel.

![Organizations tab for an example user](/assets/images/users-organizations-list-for-example-user.webp)

## Users - Teams

This displays the list of teams of which that user is a member. This list may be searched by **Name** or **Organization**. If you can add users, click **Associate** to add the user to one or more teams, or select teams and click **Disassociate** to remove all of the user's roles on them. For more information, refer to [Teams](../teams).

Until a Team has been created and the user has been assigned to that team, the assigned Teams Details for the User appears blank.

![Empty Teams tab for an example user](/assets/images/users-teams-list-for-example-user.webp)

## Users - Roles

The set of permissions assigned to this user (role-based access controls) that provide the ability to read, modify, and administer projects, inventories, job templates, and other Ascender elements are Roles.

<Hint type="note">

It is important to note that the job template administrator may not have access to other resources (inventory, project, credentials, or instance groups) associated with the template. Without access to these, certain fields in the job template are not editable. System Administrators may grant individual users permissions to certain resources as necessary. See [Add Permissions](#add-permissions) for detail.

</Hint>

This screen displays a list of the roles that are currently assigned to the selected User, showing each role's **Name**, **Type**, and **Role**. The list can be searched by **Role**.

![Roles tab listing the permissions for an example user](/assets/images/users-permissions-list-for-example-user.webp)

### Add Permissions

To add permissions to a particular user:

1. Click the **Add** button, which opens the Add Permissions Wizard.

   ![Add User Permissions wizard, first step, add resource type](/assets/images/users-add-permissions-form.webp)

2. Click to select the object for which the user will have access and click **Next**.
3. Click to select the resource to assign team roles and click **Next**.

   ![Add User Permissions wizard, second step, select items from list with an instance group checked](/assets/images/users-permissions-ig-select.webp)

4. Click the checkbox beside the role to assign that role to your chosen type of resource. Different resources have different options available.

   ![Add User Permissions wizard, final step, select roles to apply with the Use role checked](/assets/images/users-permissions-ig-roles.webp)

5. Click **Save** when done, and the Add Permissions Wizard closes to display the updated profile for the user with the roles assigned for each selected resource.

   ![Roles tab of a user showing the sample roles assigned](/assets/images/users-permissions-sample-roles.webp)

To remove Permissions for a particular resource, click the disassociate (x) button next to its resource. This launches a confirmation dialog, asking you to confirm the disassociation.

<Hint type="note">

You can also add teams, individual, or multiple users and assign them permissions at the object level (templates, credentials, inventories, projects, organizations, or instance groups) as well. This feature reduces the time for an organization to onboard many users at one time.

</Hint>

## Users - Tokens

The **Tokens** tab will only be present for your user (yourself). Before you add a token for your user, you may want to [create an application](../applications#create-a-new-application) if you want to associate your token to it. You may also create a personal access token (PAT) without associating it with any application. To create a token for your user:

1. If not already selected, click on your user from the Users list view to configure your OAuth 2 tokens.
2. Click the **Tokens** tab from your user's profile.

   When no tokens are present, the Tokens screen prompts you to add them:

   ![Empty Tokens tab prompting you to add a token](/assets/images/users-tokens-empty.webp)

3. Click the **Add** button, which opens the Create Token window.
4. Enter the following details in Create Token window:

   - **Application**: enter the name of the application with which you want to associate your token. Alternatively, you can search for it by clicking the **Search** (magnifying glass) icon. This opens a separate window that allows you to choose from the available options. Use the Search bar to filter by name if the list is extensive. Leave this field blank if you want to create a Personal Access Token (PAT) that is not linked to any application.
   - **Description**: optionally provide a short description for your token.
   - **Scope** (required): specify the level of access you want this token to have.

5. When done, click **Save** or **Cancel** to abandon your changes.

After the token is saved, the newly created token for the user displays with the token information and when it expires.

![Newly created token showing the token value, refresh token, and expiration](/assets/images/users-token-information-example.webp)

<Hint type="note">

This is the only time the token value and associated refresh token value will ever be shown.

</Hint>

In the user's profile, the application for which it is assigned to and its expiration displays in the token list view.

![Tokens tab listing a token with its application and expiration](/assets/images/users-token-assignment-example.webp)
