# OAuth2 Tokens and Applications

Ascender is an OAuth2 provider ([RFC 6749](https://tools.ietf.org/html/rfc6749)).
API clients authenticate with a bearer token instead of a session or basic
auth:

```
Authorization: Bearer <token>
```

A token belongs to a user and acts with that user's RBAC permissions, narrowed
by the token's scope. There are two kinds:

* **Personal access tokens** (PATs) belong to a user and no application. They
  are created through the API and have no refresh token.
* **Application tokens** belong to a user and an OAuth2 application. They are
  created through the API or issued by the OAuth2 endpoints under `/api/o/`,
  and come with a refresh token.

Both are listed at `/api/v2/tokens/`; a personal token has `application: null`.

The REST resources are in `src/internal/api/oauth2.go`, the `/api/o/` endpoints
in `src/internal/api/oauth2_provider.go`, and the bearer token check in
`userForToken` in `src/internal/api/middleware.go`.

A bearer token is checked before the session cookie and basic auth
(`Authenticate` in `src/internal/api/middleware.go`): a request that carries a
valid token and a session cookie acts as the token, with its scope and without
the CSRF check a session needs. A token that is unknown or expired counts as no
credential, and the session or basic auth is tried next.


## Quick start: a personal access token

Create a token for yourself, here with basic auth:

```bash
curl -u <username>:<password> -H "Content-Type: application/json" -X POST \
  -d '{"description": "deploy script", "scope": "write"}' \
  https://ascender.example.com/api/v2/users/<your user id>/personal_tokens/
```

The response is the token, with its value in `token`. This is the only time
the value is shown; every later read shows `************`. Use it:

```bash
curl -H "Authorization: Bearer <token>" https://ascender.example.com/api/v2/users/
```

Delete it to revoke it:

```bash
curl -H "Authorization: Bearer <token>" -X DELETE \
  https://ascender.example.com/api/v2/tokens/<id>/
```

The UI creates personal and application tokens under the user's **Tokens**
tab.


## Using a token

A token is accepted on every `/api/` endpoint. Ascender looks it up by its
checksum and:

* treats a token it does not know, or one past its `expires`, as no
  credentials at all, so an endpoint that needs a user answers `401`;
* answers `401` with `User inactive or deleted.` when the token's user is
  inactive;
* records the time in the token's `last_used`.

While `DISABLE_LOCAL_AUTH` is on, tokens of local users (users with no LDAP,
social or SAML login) are not accepted.

> **Note:** the old application deleted those tokens when `DISABLE_LOCAL_AUTH`
> was turned on. Ascender leaves them in place and refuses them while the
> setting is on, so they work again if it is turned off. Delete them if that is
> not wanted.

### Scopes

A token's `scope` is `read`, `write`, or both separated by a space (`read
write`). Any other word, a repeated word or an empty scope is refused with
`Must be a simple space-separated string with allowed scopes ['read', 'write'].`

The scope is a mask over RBAC, never a grant: a token can do at most what its
user can. A token whose scope includes `write` can do everything the user can.
A token without `write` can only make `GET`, `HEAD` and `OPTIONS` requests; any
other method is refused with `403` before it reaches the view. A user who
administers a job template can see, change, launch and delete it with a `write`
token, but only see it with a `read` token.

### Expiry

Expiry is set by the `OAUTH2_PROVIDER` setting (**Settings > Miscellaneous
Authentication**), a dictionary of three lifetimes in seconds:

| Key | Default | Meaning |
|---|---|---|
| `ACCESS_TOKEN_EXPIRE_SECONDS` | `31536000000` (1000 years) | lifetime of every new token, personal or application |
| `AUTHORIZATION_CODE_EXPIRE_SECONDS` | `600` | lifetime of an authorization code from `/api/o/authorize/` |
| `REFRESH_TOKEN_EXPIRE_SECONDS` | `2628000` (about a month) | how long a refresh token can be used (see [Refreshing a token](#refreshing-a-token)) |

A change applies to tokens created afterwards; existing tokens keep their
`expires`.

The **Cleanup Expired OAuth 2 Tokens** system job (`cleanup_tokens`, scheduled
weekly in a new installation) deletes expired access tokens that no refresh
token points at, refresh tokens revoked longer ago than
`REFRESH_TOKEN_EXPIRE_SECONDS`, refresh tokens whose access token expired that
long ago, and expired authorization codes.

There is no command line equivalent of the old `create_oauth2_token` and
`revoke_oauth2_tokens` management commands. Use the API.

### External users

By default, users who log in through an external provider cannot get tokens:
the API answers `403` with

```
OAuth2 Tokens cannot be created by users associated with an external authentication provider (<kind>)
```

where `<kind>` is `enterprise` (SAML), `social` (any OAuth2 or OIDC login,
including Entra ID) or `ldap`. `/api/o/token/` refuses them the same way (see
[Errors](#errors)). Turn on `ALLOW_OAUTH2_FOR_EXTERNAL_USERS` (**Settings >
Miscellaneous Authentication**) to let them. Turning it off again does not
delete tokens they already have.


## Applications

An application is the server side record of an API client that gets tokens
through `/api/o/`. Applications belong to an organization.

| Endpoint | Methods |
|---|---|
| `/api/v2/applications/` | `GET`, `POST` |
| `/api/v2/applications/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` |
| `/api/v2/applications/<id>/tokens/` | `GET`, `POST` |
| `/api/v2/applications/<id>/activity_stream/` | `GET` |
| `/api/v2/organizations/<id>/applications/` | `GET`, `POST` (the organization is taken from the URL) |
| `/api/v2/users/<id>/applications/` | the same as `/api/v2/applications/`; the user in the URL is not used |

Create one with:

```json
{
    "name": "Deploy Pipeline",
    "description": "",
    "organization": 1,
    "client_type": "confidential",
    "authorization_grant_type": "password",
    "redirect_uris": "",
    "skip_authorization": false
}
```

| Field | |
|---|---|
| `name` | unique within the organization |
| `organization` | required |
| `client_type` | `confidential` or `public`, required. A confidential client authenticates to `/api/o/` with its secret, a public one only names its `client_id`. |
| `authorization_grant_type` | `password` or `authorization-code`, required, and cannot be changed afterwards |
| `redirect_uris` | space separated `http` or `https` URIs without a fragment. Required for `authorization-code`. |
| `skip_authorization` | skip the consent page of `/api/o/authorize/`. Only a superuser can turn it on. |
| `client_id`, `client_secret` | generated on creation and read-only |

A typical application:

```json
{
    "id": 3,
    "type": "o_auth2_application",
    "url": "/api/v2/applications/3/",
    "related": {
        "named_url": "/api/v2/applications/Deploy Pipeline++Default/",
        "tokens": "/api/v2/applications/3/tokens/",
        "activity_stream": "/api/v2/applications/3/activity_stream/",
        "organization": "/api/v2/organizations/1/"
    },
    "summary_fields": {
        "organization": {"id": 1, "name": "Default", "description": ""},
        "user_capabilities": {"edit": true, "delete": true},
        "tokens": {"count": 1, "results": [{"id": 7, "token": "************", "scope": "read write"}]}
    },
    "created": "2026-11-21T10:15:02.118341Z",
    "modified": "2026-11-21T10:15:02.118356Z",
    "name": "Deploy Pipeline",
    "description": "",
    "client_id": "<40 characters>",
    "client_secret": "************",
    "client_type": "confidential",
    "redirect_uris": "",
    "authorization_grant_type": "password",
    "skip_authorization": false,
    "organization": 1
}
```

The client secret is shown in the clear only in the response to the `POST`
that creates the application; afterwards a confidential application shows
`************` and a public one has no `client_secret` field. It is stored
encrypted. `summary_fields.tokens` lists at most ten of the application's
tokens, with the total in `count`. Deleting an application deletes its
tokens.

> **Note:** in the old application an organization administrator could set
> `skip_authorization`. An application that skips the consent page receives an
> authorization code for any signed-in user whose browser is sent to
> `/api/o/authorize/`, superusers included, so Ascender only lets a superuser
> turn it on (`Only a superuser can let an application skip the authorization
> page.`). Applications that already have it keep it.

**Access:**

* Superusers and system auditors see every application.
* Members of an organization see its applications.
* Superusers and the organization's administrators can create, change and
  delete them. Moving an application to another organization needs
  administrator rights on both.


## Tokens

| Endpoint | Methods |
|---|---|
| `/api/v2/tokens/` | `GET`, `POST` |
| `/api/v2/tokens/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` |
| `/api/v2/tokens/<id>/activity_stream/` | `GET` |
| `/api/v2/applications/<id>/tokens/` | `GET`, `POST` (an application token of that application) |
| `/api/v2/users/<id>/tokens/` | `GET` (the user's tokens), `POST` |
| `/api/v2/users/<id>/authorized_tokens/` | `GET` (the requesting user's application tokens, whatever the URL's user), `POST` (`application` required) |
| `/api/v2/users/<id>/personal_tokens/` | `GET` (the user's personal tokens), `POST` (no application) |

A `POST` takes `description`, `scope` (default `write`) and, where the endpoint
allows it, `application`. The new token always belongs to the requesting user,
with one exception: a superuser can `POST` to another user's
`personal_tokens/`, for example to give a service account with no password a
token. That user must be active, and while `DISABLE_LOCAL_AUTH` is on must not
be a local user. The activity stream entry for such a token names the
superuser as `actor` and the owner in `changes.user`. Users other than
superusers can only `POST` to their own `users/<id>/` endpoints, and need to be
able to see the application they name.

A token created with an application also gets a refresh token. The response to
the `POST` is the only place `token` and `refresh_token` are shown in the
clear:

```json
{
    "id": 7,
    "type": "o_auth2_access_token",
    "url": "/api/v2/tokens/7/",
    "related": {
        "user": "/api/v2/users/4/",
        "application": "/api/v2/applications/3/",
        "activity_stream": "/api/v2/tokens/7/activity_stream/"
    },
    "summary_fields": {
        "user": {"id": 4, "username": "deployer", "first_name": "", "last_name": ""},
        "application": {"id": 3, "name": "Deploy Pipeline"}
    },
    "created": "2026-11-21T10:20:44.901233Z",
    "modified": "2026-11-21T10:20:44.901250Z",
    "description": "CI runner",
    "user": 4,
    "token": "************",
    "refresh_token": "************",
    "application": 3,
    "expires": "3026-03-24T10:20:44.900871Z",
    "scope": "read write"
}
```

Only `description` and `scope` can be changed. A personal token has
`refresh_token: null`.

**Access:**

* Superusers and system auditors see every token.
* Users see their own tokens, and the tokens of applications in organizations
  they are a direct administrator or auditor of.
* Superusers, the token's owner and the administrators of its application's
  organization can change and delete it.


## The OAuth2 endpoints

`/api/o/` lists the three endpoints:

```json
{"authorize": "/api/o/authorize/", "token": "/api/o/token/", "revoke_token": "/api/o/revoke_token/"}
```

`/api/o/token/` and `/api/o/revoke_token/` take `POST` only, with the
parameters form encoded in the body (`application/x-www-form-urlencoded` or
`multipart/form-data`); parameters in the URL's query string are refused. They
authenticate the client, not a user: a confidential client with its
`client_id` and `client_secret` in HTTP basic auth (or as `client_id` and
`client_secret` parameters), a public client with `client_id` alone. They need
no session and no CSRF token.

### Password grant

For an application with `authorization_grant_type` `password`. The client
sends the user's own username and password:

```bash
curl -X POST \
  -u "<client_id>:<client_secret>" \
  -d "grant_type=password&username=<username>&password=<password>&scope=read" \
  https://ascender.example.com/api/o/token/
```

The credentials are checked the way a login is (LDAP first, then local
accounts unless `DISABLE_LOCAL_AUTH` is on), and only for an active user.
Without `scope` the token gets `read write`. The answer:

```json
{"access_token": "<token>", "expires_in": 31536000000, "token_type": "Bearer", "scope": "read", "refresh_token": "<refresh token>"}
```

### Authorization code grant

For an application with `authorization_grant_type` `authorization-code`. PKCE
([RFC 7636](https://tools.ietf.org/html/rfc7636)) is required.

1. The client sends the user's browser to the authorize endpoint:

   ```
   https://ascender.example.com/api/o/authorize/?response_type=code&client_id=<client_id>&redirect_uri=https://client.example.com/callback&scope=read&state=<state>&code_challenge=<challenge>&code_challenge_method=S256
   ```

   * `redirect_uri` must match one of the application's `redirect_uris`
     (scheme, host, port, path and query). It may be left out when the
     application has exactly one.
   * `code_challenge` is required. `code_challenge_method` is `S256` or
     `plain` (the default).
   * `scope` defaults to `read write`.

2. A browser that is not signed in to Ascender is sent to the login page and
   back. A signed-in user sees a page asking to authorize the application for
   the listed scopes, unless the application has `skip_authorization`, or the
   request carries `approval_prompt=auto` and the user already has an
   unexpired token of that application covering the scopes. With
   `prompt=none` a browser that is not signed in is sent back to the client
   with `error=login_required` instead of to the login page.

3. Authorizing sends the browser to `redirect_uri` with `code` and `state`;
   cancelling sends it there with `error=access_denied`. An invalid request is
   reported to `redirect_uri` the same way, except that an unknown client or a
   bad redirect URI is shown on the page and never redirected.

4. The client exchanges the code, within `AUTHORIZATION_CODE_EXPIRE_SECONDS`,
   once:

   ```bash
   curl -X POST \
     -u "<client_id>:<client_secret>" \
     -d "grant_type=authorization_code&code=<code>&redirect_uri=https://client.example.com/callback&code_verifier=<verifier>" \
     https://ascender.example.com/api/o/token/
   ```

   The answer has the same form as the password grant's. A code can be used
   once; a second request with it gets `invalid_grant`.

### Refreshing a token

```bash
curl -X POST \
  -u "<client_id>:<client_secret>" \
  -d "grant_type=refresh_token&refresh_token=<refresh token>" \
  https://ascender.example.com/api/o/token/
```

The answer is a new access token and a new refresh token, with the same
application and scope unless `scope` asks for a narrower one (a wider one gets
`invalid_scope`). The old access token is deleted and the old refresh token is
marked revoked, so it cannot be used again. The client must be the application
the token was issued to, and the user must still be active.

A refresh token can be used for `REFRESH_TOKEN_EXPIRE_SECONDS` after it was
created; after that the endpoint answers `403` with the plain text body
`The refresh token has expired.` It is also refused with `invalid_grant` once
its access token has been expired for that long.

### Revoking a token

Deleting `/api/v2/tokens/<id>/` revokes a token. A client can also revoke one
by its value:

```bash
curl -X POST \
  -u "<client_id>:<client_secret>" \
  -d "token=<token>" \
  https://ascender.example.com/api/o/revoke_token/
```

The token can be an access token or a refresh token (`token_type_hint` says
which to look for first). Revoking either deletes the access token and marks
its refresh token revoked. Only tokens of the authenticating application are
revoked, so personal tokens cannot be revoked here. The answer is `200` with
an empty body whether or not a token was found.

### Other grants

The client credentials grant is not supported: no application can have that
grant type, and the request gets `unauthorized_client`. Neither is the device
authorization grant.

### Errors

Errors are JSON in the RFC 6749 form, `{"error": "...", "error_description":
"..."}`, the description only when there is one:

| Error | Status | When |
|---|---|---|
| `invalid_client` | 401 | the client could not be authenticated (with a `WWW-Authenticate` header) |
| `invalid_request` | 400 | a required parameter is missing (for example `Request is missing password parameter.`, `Missing code parameter.`, `Code verifier required.`), or the URL has a query string |
| `invalid_grant` | 400 | wrong username or password (`Invalid credentials given.`), an unknown, used, expired or revoked code or refresh token, a wrong PKCE verifier, or an inactive user |
| `unauthorized_client` | 400 | the application's grant type does not allow the request |
| `unsupported_grant_type` | 400 | an unknown `grant_type` |
| `invalid_scope` | 400 | a scope other than `read` and `write`, or wider than the refreshed token's |
| `access_denied` | 400 | the user logs in through an external provider and `ALLOW_OAUTH2_FOR_EXTERNAL_USERS` is off |

The documents under `/api/o/.well-known/` are not part of the OAuth2 provider.
They describe Ascender as the issuer of the workload identity tokens it signs
for jobs, for external systems that accept those tokens in place of a stored
secret.
