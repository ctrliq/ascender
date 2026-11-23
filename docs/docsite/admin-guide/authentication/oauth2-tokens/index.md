---
title: Token-Based Authentication
description: Manage OAuth 2 applications, personal access tokens, and application tokens for authenticating to the Ascender API.
weight: 5
---

OAuth 2 is used for token-based authentication. You can manage OAuth tokens as well as applications, a server-side representation of API clients used to generate tokens. By including an OAuth token as part of the HTTP authentication header, you can authenticate yourself and adjust the degree of restrictive permissions in addition to the base RBAC permissions. Refer to [RFC 6749](https://tools.ietf.org/html/rfc6749) for more details of OAuth 2 specification.

Tokens are created and revoked through the API, as described on this page, or on a user's **Tokens** tab in the user interface.

## Managing OAuth 2 Applications and Tokens

Applications and tokens can be managed as a top-level resource at `/api/<version>/applications` and `/api/<version>/tokens`. These resources can also be accessed respective to the user at `/api/<version>/users/N/<resource>`. Applications can be created by making a **POST** to either `api/<version>/applications` or `/api/<version>/users/N/applications`.

Each OAuth 2 application represents a specific API client on the server side. For an API client to use the API via an application token, it must first have an application and issue an access token. Individual applications are accessible via their primary keys: `/api/<version>/applications/<pk>/`. Here is a typical application:

```json
{
    "id": 1,
    "type": "o_auth2_application",
    "url": "/api/v2/applications/2/",
    "related": {
        "tokens": "/api/v2/applications/2/tokens/"
    },
    "summary_fields": {
        "organization": {
            "id": 1,
            "name": "Default",
            "description": ""
        },
        "user_capabilities": {
            "edit": true,
            "delete": true
        },
        "tokens": {
            "count": 0,
            "results": []
        }
    },
    "created": "2018-07-02T21:16:45.824400Z",
    "modified": "2018-07-02T21:16:45.824514Z",
    "name": "My Application",
    "description": "",
    "client_id": "Ecmc6RjjhKUOWJzDYEP8TZ35P3dvsKt0AKdIjgHV",
    "client_secret": "7Ft7ym8MpE54yWGUNvxxg6KqGwPFsyhYn9QQfYHlgBxai74Qp1GE4zsvJduOfSFkTfWFnPzYpxqcRsy1KacD0HH0vOAQUDJDCidByMiUIH4YQKtGFM1zE1dACYbpN44E",
    "client_type": "confidential",
    "redirect_uris": "",
    "authorization_grant_type": "password",
    "skip_authorization": false,
    "organization": 1
}
```

As shown in the example above, `name` is the human-readable identifier of the application. The rest of the fields, like `client_id` and `redirect_uris`, are mainly used for OAuth2 authorization, which is covered later in [Using OAuth 2 Token System for Personal Access Tokens (PAT)](#using-oauth-2-token-system-for-personal-access-tokens-pat).

The values for the `client_id` and `client_secret` fields are generated during creation and are non-editable identifiers of applications. `organization` and `authorization_grant_type` are required upon creation. `authorization_grant_type` cannot be changed afterwards. `organization` can be changed by a user who is an administrator of both the current and the new organization.

### Access Rules for Applications

Access rules for applications are as follows:

- System administrators can view and manipulate all applications in the system
- System auditors can view all applications
- Members of an organization can view the applications of that organization
- Only system administrators and the organization's administrators can create, change, and delete the applications of an organization

Tokens, on the other hand, are resources used to actually authenticate incoming requests and mask the permissions of the underlying user. There are two ways to create a token:

- POST to the `/api/v2/tokens/` endpoint with `application` and `scope` fields to point to the related application and specify token scope
- POST to the `/api/v2/applications/<pk>/tokens/` endpoint with the `scope` field (the parent application will be automatically linked)

Individual tokens are accessible via their primary keys: `/api/<version>/tokens/<pk>/`. Here is an example of a typical token:

```text
{
    "id": 4,
    "type": "o_auth2_access_token",
    "url": "/api/v2/tokens/4/",
    "related": {
        "user": "/api/v2/users/1/",
        "application": "/api/v2/applications/1/",
        "activity_stream": "/api/v2/tokens/4/activity_stream/"
},
    "summary_fields": {
        "application": {
            "id": 1,
            "name": "Default application for root",
            "client_id": "mcU5J5uGQcEQMgAZyr5JUnM3BqBJpgbgL9fLOVch"
        },
        "user": {
            "id": 1,
            "username": "root",
            "first_name": "",
            "last_name": ""
        }
    },
    "created": "2018-02-23T14:39:32.618932Z",
    "modified": "2018-02-23T14:39:32.643626Z",
    "description": "App Token Test",
    "user": 1,
    "token": "*************",
    "refresh_token": "*************",
    "application": 1,
    "expires": "2018-02-24T00:39:32.618279Z",
    "scope": "read"
},
```

For an OAuth 2 token, the only fully editable fields are `scope` and `description`. The `application` field is non-editable on update, and all other fields are entirely non-editable, and are auto-populated during creation, as follows:

- `user` field corresponds to the user the token is created for, and in this case, is also the user creating the token
- `expires` is generated according to Ascender configuration setting `OAUTH2_PROVIDER`
- `token` and `refresh_token` are auto-generated to be non-clashing random strings

Both application tokens and personal access tokens are shown at the `/api/v2/tokens/` endpoint. The `application` field in the personal access tokens is always **null**. This is a good way to differentiate the two types of tokens.

### Access rules for tokens

Access rules for tokens are as follows:

- Users can create a token if they are able to view the related application; and are also able to create a personal token for themselves
- System administrators are able to view and manipulate every token in the system
- Organization administrators are able to view, change, and delete the tokens of applications that belong to their organization, and organization auditors are able to view them. Neither can see the personal tokens of organization members, nor their tokens for applications of other organizations
- System Auditors can view all tokens and applications
- Other normal users are only able to view and manipulate their own tokens

<Hint type="note">

Users can only view the token or refresh the token value at the time of creation only.

</Hint>

## Using OAuth 2 Token System for Personal Access Tokens (PAT)

The easiest and most common way to obtain an OAuth 2 token is to create a personal access token at the `/api/v2/users/<userid>/personal_tokens/` endpoint, as shown in this example below:

```bash
curl -H "Content-type: application/json" -d '{"description":"Personal Ascender CLI token", "application":null, "scope":"write"}' https://<USERNAME>:<PASSWORD>@<ASCENDER_SERVER>/api/v2/users/<USER_ID>/personal_tokens/ | python -m json.tool
```

You could also pipe the JSON output through `jq`, if installed.

The token belongs to the user whose ID is in the URL. Users can create tokens only for themselves; a System Administrator can also create one for another user, for example a service account created without a password, which cannot log in to create its own. Any other request for someone else's ID is refused with `403`. `GET` on the same endpoint lists that user's personal tokens, as far as the requester is allowed to see them.

Following is an example of using the personal token to access an API endpoint using curl:

```bash
curl -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{}' https://ascender/api/v2/job_templates/5/launch/
```

Ascender provides dedicated OAuth 2 endpoints for authorizing, revoking, and refreshing tokens under `/api/o/`: `/api/o/authorize/`, `/api/o/token/`, and `/api/o/revoke_token/`. A **GET** on `/api/o/` lists them. These special OAuth 2 endpoints only support using the `x-www-form-urlencoded` **Content-type**, so none of the `api/o/*` endpoints accept `application/json`.

<Hint type="note">

The `/api/o/token/` endpoint always authenticates an application, so it cannot issue personal access tokens. Create those at `/api/v2/users/<USER_ID>/personal_tokens/`, or at `/api/v2/tokens/` without an `application`.

</Hint>

Alternatively, you can [add tokens](/user-guide/applications#add-tokens) for users through the Ascender user interface, as well as configure the expiration of an access token and its associated refresh token (if applicable).

![Miscellaneous Authentication settings showing the access token and refresh token expiration fields](/assets/images/configure-ascender-system-misc-sys-token-expire.webp)

### Token scope mask over RBAC system

The scope of an OAuth 2 token is a space-separated string composed of valid scope keywords, "read" and "write". These keywords are used to specify permission level of the authenticated API client. Read and write scopes provide a mask layer over the Role-Based Access Control (RBAC) permission system of Ascender. Specifically, a "write" scope gives the authenticated user the full permissions the RBAC system provides, while a "read" scope gives the authenticated user only read permissions the RBAC system provides. Note that "write" implies "read" as well.

For example, if you have administrative permissions to a job template, you can view, modify, launch, and delete the job template if authenticated via session or basic authentication. In contrast, if you are authenticated using OAuth 2 token, and the related token scope is "read", you can only view, but not manipulate or launch the job template, despite being an administrator. If the token scope is "write" or "read write", you can take full advantage of the job template as its administrator.

To acquire and use a token, first create an application token:

1. Make an application with `authorization_grant_type` set to `password`. HTTP POST the following to the `/api/v2/applications/` endpoint (supplying your own organization ID):

   ```json
   {
       "name": "Admin Internal Application",
       "description": "For use by secure services & clients. ",
       "client_type": "confidential",
       "redirect_uris": "",
       "authorization_grant_type": "password",
       "skip_authorization": false,
       "organization": <organization-id>
   }
   ```

2. Make a token and POST to the `/api/v2/tokens/` endpoint:

   ```json
   {
       "description": "My Access Token",
       "application": <application-id>,
       "scope": "write"
   }
   ```

   This returns a `<token-value>` that you can use to authenticate with for future requests (this will not be shown again).

3. Use the token to access a resource. The following uses curl as an example:

   ```bash
   curl -H "Authorization: Bearer <token-value>" -H "Content-Type: application/json" https://<awx>/api/v2/users/
   ```

   The `-k` flag may be needed if you have not set up a CA yet and are using SSL.

To revoke a token, you can make a DELETE on the detail page for that token, using that token's ID. For example:

```bash
curl -u <user>:<password> -X DELETE https://<awx>/api/v2/tokens/<pk>/
```

Similarly, using a token:

```bash
curl -H "Authorization: Bearer <token-value>" -X DELETE https://<awx>/api/v2/tokens/<pk>/
```

## Application Functions

This section lists OAuth 2 utility endpoints used for authorization, token refresh, and revoke. The `/api/o/token/` and `/api/o/revoke_token/` endpoints accept HTTP POST only and are not meant to be used in browsers, while `/api/o/authorize/` is opened in the user's browser. The endpoints prescribed here strictly follow RFC specifications for OAuth 2, so use that for detailed reference. The following is an example of the typical usage of these endpoints in Ascender, in particular, when creating an application using various grant types:

- Authorization Code
- Password

<Hint type="note">

You can perform any of the application functions described here using Ascender user interface. Refer to the [Applications](/user-guide/applications) section of the [Ascender user guides](/user-guide) for more detail.

</Hint>

### Application using `authorization code` grant type

The application `authorization code` grant type should be used when access tokens need to be issued directly to an external application or service.

<Hint type="note">

You can only use the `authorization code` type to acquire an access token when using an application. When integrating an external webapp with Ascender, that webapp may need to create OAuth2 Tokens on behalf of users in that other webapp. Creating an application in Ascender with the `authorization code` grant type is the preferred way to do this because:

- this allows an external application to obtain a token from Ascender for a user, using their credentials.
- compartmentalized tokens issued for a particular application allows those tokens to be easily managed (revoke all tokens associated with that application without having to revoke *all* tokens in the system, for example)

</Hint>

To create an application named *AuthCodeApp* with the `authorization-code` grant type, perform a POST to the `/api/v2/applications/` endpoint:

```json
{
    "name": "AuthCodeApp",
    "organization": <organization-id>,
    "client_type": "confidential",
    "redirect_uris": "http://<awx>/api/v2",
    "authorization_grant_type": "authorization-code",
    "skip_authorization": false
}
```

The authorization code workflow requires PKCE ([RFC 7636](https://tools.ietf.org/html/rfc7636)). For each authorization, the client application makes up a random `code_verifier` and derives a `code_challenge` from it: the base64url encoding, without padding, of the SHA-256 hash of the verifier. The workflow is as follows:

1. The client application sends the user's browser with a **GET** to the `/api/o/authorize/` endpoint, with `response_type=code`, `client_id`, `redirect_uri` (one of the application's `redirect_uris`), `scope`, `state`, `code_challenge`, and `code_challenge_method=S256`:

   ```text
   https://<awx>/api/o/authorize/?response_type=code&client_id=<client_id>&redirect_uri=<redirect_uri>&scope=read&state=<state>&code_challenge=<code_challenge>&code_challenge_method=S256
   ```

   A request without `code_challenge` is refused with `invalid_request` and `Code challenge required.`

2. The user logs in if needed and authorizes the application. Ascender then sends the browser to the `redirect_uri` with the authorization `code` and the `state`.
3. The client application makes a **POST** to the `/api/o/token/` endpoint on Ascender with the `grant_type`, `code`, `redirect_uri`, and the `code_verifier`, authenticating with the application's `client_id` and `client_secret`:

   ```bash
   curl -X POST \
   -u "<client_id>:<client_secret>" \
   -d "grant_type=authorization_code&code=<code>&redirect_uri=<redirect_uri>&code_verifier=<code_verifier>" \
   https://<awx>/api/o/token/
   ```

   A request without `code_verifier` is refused with `invalid_request` and `Code verifier required.`

4. Ascender responds with the `access_token`, `token_type`, `refresh_token`, and `expires_in`.

You may specify the number of seconds an authorization code remains valid in the **Miscellaneous Authentication settings** screen:

![Miscellaneous Authentication settings showing the Authorization Code Expiration field](/assets/images/configure-ascender-system-misc-sys-authcode-expire.webp)

Requesting an access token after this duration will fail. The duration defaults to 600 seconds (10 minutes), based on the [RFC6749](https://tools.ietf.org/html/rfc6749) recommendation.

The best way to set up app integrations with Ascender using the Authorization Code grant type is to allow the origins of those cross-site requests. More generally, you need to allow the service or application you are integrating with Ascender, for which you want to provide access tokens, to call the API from a browser. To do this, have your Administrator set the `ASCENDER_CORS_ALLOWED_ORIGINS` environment variable of the web container to the origins of those applications, separated by commas:

```text
ASCENDER_CORS_ALLOWED_ORIGINS=https://client.example.com,https://www.example.com
```

Where `https://client.example.com` and `https://www.example.com` are applications needing tokens with which to access Ascender. Each origin is a scheme and a host, with a port when it is not the scheme's default, and nothing after it (no path, not even a trailing `/`). Matching is exact: there are no wildcards or patterns. The list is empty by default. Cross-origin requests never carry cookies, so pages on those origins authenticate with an OAuth 2 token.

On Ascender deployed by the Ascender Operator, set the variable with the `web_extra_env` parameter of the Ascender custom resource:

```yaml
spec:
  web_extra_env: |
    - name: ASCENDER_CORS_ALLOWED_ORIGINS
      value: https://client.example.com,https://www.example.com
```

### Application using `password` grant type

The `password` grant type or `Resource owner password-based` grant type is ideal for users who have native access to the web app and should be used when the client is the Resource owner. The following supposes an application, "Default Application" with grant type `password`:

```text
{
    "id": 6,
    "type": "application",
    ...
    "name": "Default Application",
    "user": 1,
    "client_id": "gwSPoasWSdNkMDtBN3Hu2WYQpPWCO9SwUEsKK22l",
    "client_secret": "fI6ZpfocHYBGfm1tP92r0yIgCyfRdDQt0Tos9L8a4fNsJjQQMwp9569eIaUBsaVDgt2eiwOGe0bg5m5vCSstClZmtdy359RVx2rQK5YlIWyPlrolpt2LEpVeKXWaiybo",
    "client_type": "confidential",
    "redirect_uris": "",
    "authorization_grant_type": "password",
    "skip_authorization": false
}
```

Logging in is not required for `password` grant type. The client sends the user's username and password to the `/api/o/token/` endpoint, authenticating with the application's `client_id` and `client_secret`:

```bash
curl -X POST \
-u "gwSPoasWSdNkMDtBN3Hu2WYQpPWCO9SwUEsKK22l:fI6ZpfocHYBGfm1tP92r0yIgCyfRdDQt0Tos9L8a4fNsJjQQMwp9569eIaUBsaVDgt2eiwOGe0bg5m5vCSstClZmtdy359RVx2rQK5YlIWyPlrolpt2LEpVeKXWaiybo" \
-d "grant_type=password&username=<username>&password=<password>&scope=read" \
https://<awx>/api/o/token/
```

<Hint type="note">

The special OAuth 2 endpoints only support using the `x-www-form-urlencoded` **Content-type**, so as a result, none of the `api/o/*` endpoints accept `application/json`.

</Hint>

Upon success, a response displays in JSON format containing the access token, refresh token and other information:

```json
{"access_token": "9epHOqHhnXUcgYK8QanOmUQPSgX92g", "expires_in": 31536000000, "token_type": "Bearer", "scope": "read", "refresh_token": "jMRX6QvzOTf046KHee3TU5mT3nyXsz"}
```

## Application Token Functions

This section describes the refresh and revoke functions associated with tokens. Everything that follows (Refreshing and revoking tokens at the `/api/o/` endpoints) can currently only be done with application tokens.

### Refresh an existing access token

The following example shows an existing access token with a refresh token provided:

```text
{
    "id": 35,
    "type": "access_token",
    ...
    "user": 1,
    "token": "omMFLk7UKpB36WN2Qma9H3gbwEBSOc",
    "refresh_token": "AL0NK9TTpv0qp54dGbC4VUZtsZ9r8z",
    "application": 6,
    "expires": "2017-12-06T03:46:17.087022Z",
    "scope": "read write"
}
```

The `/api/o/token/` endpoint is used for refreshing the access token:

```bash
curl \
    -d "grant_type=refresh_token&refresh_token=AL0NK9TTpv0qp54dGbC4VUZtsZ9r8z" \
    -u "gwSPoasWSdNkMDtBN3Hu2WYQpPWCO9SwUEsKK22l:fI6ZpfocHYBGfm1tP92r0yIgCyfRdDQt0Tos9L8a4fNsJjQQMwp9569eIaUBsaVDgt2eiwOGe0bg5m5vCSstClZmtdy359RVx2rQK5YlIWyPlrolpt2LEpVeKXWaiybo" \
    http://<awx>/api/o/token/ -i
```

In the above POST request, `refresh_token` is provided by `refresh_token` field of the access token above that. The authentication information is of format `<client_id>:<client_secret>`, where `client_id` and `client_secret` are the corresponding fields of the underlying related application of the access token.

<Hint type="note">

The special OAuth 2 endpoints only support using the `x-www-form-urlencoded` **Content-type**, so as a result, none of the `api/o/*` endpoints accept `application/json`.

</Hint>

Upon success, a response displays in JSON format containing the new (refreshed) access token with the same scope information as the previous one:

```json
{"access_token": "NDInWxGJI4iZgqpsreujjbvzCfJqgR", "expires_in": 31536000000, "token_type": "Bearer", "scope": "read write", "refresh_token": "DqOrmz8bx3srlHkZNKmDpqA86bnQkT"}
```

Essentially, the refresh operation replaces the existing token by deleting the original and then immediately creating a new token with the same scope and related application as the original one. Verify that new token is present and the old one is deleted in the `/api/v2/tokens/` endpoint.

### Revoke an access token

Similarly, you can revoke an access token by using the `/api/o/revoke_token/` endpoint.

Revoking an access token by this method is the same as deleting the token resource object, but it allows you to delete a token by providing its token value, and the associated `client_id` (and `client_secret` if the application is `confidential`). For example:

```bash
curl -d "token=rQONsve372fQwuc2pn76k3IHDCYpi7" \
-u "gwSPoasWSdNkMDtBN3Hu2WYQpPWCO9SwUEsKK22l:fI6ZpfocHYBGfm1tP92r0yIgCyfRdDQt0Tos9L8a4fNsJjQQMwp9569eIaUBsaVDgt2eiwOGe0bg5m5vCSstClZmtdy359RVx2rQK5YlIWyPlrolpt2LEpVeKXWaiybo" \
http://<awx>/api/o/revoke_token/ -i
```

<Hint type="note">

The special OAuth 2 endpoints only support using the `x-www-form-urlencoded` **Content-type**, so as a result, none of the `api/o/*` endpoints accept `application/json`.

</Hint>

<Hint type="note">

The **Allow External Users to Create Oauth2 Tokens** (`ALLOW_OAUTH2_FOR_EXTERNAL_USERS` in the API) setting is disabled by default. External users refer to users authenticated externally with a service like LDAP, or any of the other SSO services. This setting ensures external users cannot *create* their own tokens. If you enable then disable it, any tokens created by external users in the meantime will still exist, and are not automatically revoked.

</Hint>

Expired tokens are deleted by the [Cleanup Expired OAuth 2 Tokens](../../management-jobs#cleanup-expired-oauth-2-tokens) management job.

This setting can be configured at the system-level in the Ascender user interface:

![Miscellaneous Authentication settings showing the Allow External Users to Create OAuth2 Tokens toggle](/assets/images/configure-ascender-system-oauth2-tokens-toggle.webp)

Upon success, a response of `200 OK` displays. Verify the deletion by checking whether the token is present in the `/api/v2/tokens/` endpoint.
