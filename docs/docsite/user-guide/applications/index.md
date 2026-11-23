---
title: Applications
description: Create OAuth 2 applications in Ascender so external tools such as ServiceNow and Jenkins can integrate using scoped, revocable tokens.
weight: 23
---

Creating and configuring token-based authentication for external applications makes it easier for external applications such as ServiceNow and Jenkins to integrate with Ascender. OAuth 2 allows you to use tokens to share certain data with an application without disclosing login information, and furthermore, these tokens can be scoped as "read-only". You create an application that is representative of the external application you are integrating with, then use it to create tokens for that application to use on behalf of the users of the external application.

Having these tokens associated to an application resource gives you the ability to manage all tokens issued for a particular application more easily. By separating token issuance under Applications, you can revoke all tokens based on the Application without having to revoke all tokens in the system.

When integrating an external web app with Ascender that web app may need to create OAuth2 Tokens on behalf of users in that other web app. Creating an application with the Authorization Code grant type is the preferred way to do this because:

- external applications can obtain a token for users, using their credentials
- compartmentalized tokens issued for a particular application, allows those tokens to be easily managed (revoke all tokens associated with that application, for example)

## Getting Started with Applications

Access the Applications page by clicking **Applications** from the left navigation bar. The Applications page displays a searchable list of all available Applications currently managed by Ascender and can be sorted by **Name**.

![Applications list view](/assets/images/apps-list-view-examples.webp)

If no other applications exist, only a gray box with a message to add applications displays.

![No applications found in the list view](/assets/images/apps-list-view-empty.webp)

## Create a new application

Token-based authentication for users can be configured in the Applications window.

1. In the Ascender User Interface, click **Applications** from the left navigation bar.

   The Applications window opens.

2. Click the **Add** button located in the upper right corner of the Applications window.

   The New Application window opens.

   ![Create new application dialog](/assets/images/apps-create-new.webp)

3. Enter the following details in **Create New Application** window:

   - **Name** (required): provide a name for the application you want to create
   - **Description**: optionally provide a short description for your application
   - **Organization** (required): provide an organization for which this application is associated
   - **Authorization Grant Type** (required): Select from one of the grant types to use in order for the user to acquire tokens for this application. Refer to [grant types](/admin-guide/authentication/oauth2-tokens#application-functions) in the Applications section of the [Ascender Administration Guide](/admin-guide).
   - **Redirect URIS**: Provide a list of allowed URIs, separated by spaces. This is required if you specified the grant type to be **Authorization code**.
   - **Client Type** (required): Select the level of security of the client device

4. When done, click **Save** or **Cancel** to abandon your changes. Upon saving, the client ID displays in a pop-up window.

   ![Client ID pop-up window](/assets/images/apps-client-id-popup.webp)

### Applications - Tokens

Selecting the **Tokens** view displays a list of the users that have tokens to access the application.

![Application tokens list view](/assets/images/apps-tokens-list-view-examples.webp)

Tokens can only access resources that its associated user can access, and can be limited further by specifying the scope of the token.

#### Add Tokens

Tokens are added through the Users screen and can be associated with an application at that time. Specifying an application can be performed directly in the User's token settings. You can create a token for *your* user in the Tokens configuration tab, meaning only you can create and see your tokens in your own user screen.

<Hint type="note">

Users create and view their own tokens from their own user profile. A system administrator can also create a personal token for another user with `POST /api/v2/users/<id>/personal_tokens/`, and can revoke any token with `DELETE /api/v2/tokens/<id>/`; an organization administrator can revoke the tokens of their organization's applications. See [Token and session management](/admin-guide/awx-manage#token-and-session-management) in the [Ascender Administration Guide](/admin-guide).

</Hint>

To add a token:

1. Access the Users list view by clicking **Users** from the left navigation bar then click on your user to configure your OAuth 2 tokens.
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

To verify the application in the example above now shows the user with the appropriate token, go to the **Tokens** tab of the Applications window:

![Tokens tab of the application showing the user's token](/assets/images/apps-tokens-list-view-example2.webp)
