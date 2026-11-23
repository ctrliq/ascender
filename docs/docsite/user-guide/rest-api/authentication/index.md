---
title: Authentication Methods Using the API
description: Authenticate to the Ascender REST API with sessions, Basic Auth, OAuth 2 tokens, or SSO, with curl and Python examples.
weight: 3
---

This chapter describes the numerous enterprise authentication methods, the best use case for each, and examples:

- [Session Authentication](#session-authentication)
- [Basic Authentication](#basic-authentication)
- [OAuth 2 Token Authentication](#oauth-2-token-authentication)
- [SSO Authentication](#sso-authentication)

Ascender is designed for organizations to centralize and control their automation with a visual dashboard for out-of-the box control while providing a REST API to integrate with your other tooling on a deeper level. Ascender supports a number of authentication methods to make it easy to embed Ascender into existing tools and processes to help ensure the right people can access Ascender resources.

## Session Authentication

Session authentication is used when logging in directly to Ascender's API or UI to manually create resources (inventory, project, job template) and launch jobs in the browser. With this method, you can remain logged in for a prolonged period of time, not just for that HTTP request, but for instance, when browsing the UI or API in a browser like Chrome or Firefox. When a user logs in, a session cookie is created, which enables the user to remain logged in when navigating to different pages within Ascender. Below represents the communication that occurs between the client and server in a session.

![Sequence of requests and responses between the client and the Ascender server during session authentication](/assets/images/session-auth-architecture.webp)

Using the curl tool, you can see the activity that occurs when you log into Ascender.

1. GET to the `/api/login/` endpoint to grab the `csrftoken` cookie.

   ```bash
   curl -k -c - https://<ascender-host>/api/login/

   localhost    FALSE    /    FALSE    0   csrftoken
   AswSFn5p1qQvaX4KoRZN6A5yer0Pq0VG2cXMTzZnzuhaY0L4tiidYqwf5PXZckuj
   ```

2. POST to the `/api/login/` endpoint with username, password, and `X-CSRFToken=<token-value>`.

   ```bash
   curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
     --referer https://<ascender-host>/api/login/ \
     -H 'X-CSRFToken: K580zVVm0rWX8pmNylz5ygTPamgUJxifrdJY0UDtMMoOis5Q1UOxRmV9918BUBIN' \
     --data 'username=root&password=reverse' \
     --cookie 'csrftoken=K580zVVm0rWX8pmNylz5ygTPamgUJxifrdJY0UDtMMoOis5Q1UOxRmV9918BUBIN' \
     https://<ascender-host>/api/login/ -k -D - -o /dev/null
   ```

All of this is done by Ascender when you log in to the UI or API in the browser, and should only be used when authenticating in the browser. For programmatic integration with Ascender, see [OAuth 2 Token Authentication](#oauth-2-token-authentication).

A typical response might look like:

```text
Server: nginx
Date: <current date>
Content-Type: text/html; charset=utf-8
Content-Length: 0
Connection: keep-alive
Location: /api/
X-API-Session-Cookie-Name: ascender_sessionid
Expires: <date>
Cache-Control: max-age=0, no-cache, no-store, must-revalidate, private
Vary: Cookie, Accept-Language, Origin
Session-Timeout: 1800
Content-Language: en
X-API-Total-Time: 0.377s
X-API-Request-Id: 700826696425433fb0c8807cd40c00a0
Access-Control-Expose-Headers: X-API-Request-Id
Set-Cookie: userLoggedIn=true; Path=/
Set-Cookie: csrftoken=<csrftoken>; Path=/; SameSite=Lax
Set-Cookie: ascender_sessionid=<your session id>; expires=<date>; HttpOnly; Max-Age=1800; Path=/; SameSite=Lax
Strict-Transport-Security: max-age=15768000
```

When a user is successfully authenticated with this method, the server will respond with a header called `X-API-Session-Cookie-Name`, indicating the configured name of the session cookie. The default value is `ascender_sessionid` which you can see later in the `Set-Cookie` headers.

<Hint type="note">

The session expiration time can be changed by specifying it in the `SESSION_COOKIE_AGE` parameter. Refer to [Working with session limits](/admin-guide/authentication/sessions#working-with-session-limits) for further detail.

</Hint>

## Basic Authentication

Basic Authentication (Basic Auth) is stateless, thus the base64-encoded `username` and `password` must be sent along with each request via the Authorization header. This can be used for API calls from curl requests, python scripts, or individual requests to the API. [OAuth 2 Token Authentication](#oauth-2-token-authentication) is recommended for accessing the API when at all possible.

Example with curl:

```bash
# the --user flag adds this Authorization header for us
curl -X GET --user 'user:password' https://<ascender-host>/api/v2/credentials -k -L
```

For more information about the Basic HTTP Authentication scheme, see [RFC 7617](https://datatracker.ietf.org/doc/html/rfc7617).

<Hint type="note">

You can disable the Basic Auth for security purposes from the Miscellaneous Authentication settings of the Ascender UI Settings menu:

![Miscellaneous Authentication settings with the Enable HTTP Basic Auth option turned off](/assets/images/configure-ascender-auth-basic-off.webp)

</Hint>

## OAuth 2 Token Authentication

OAuth (Open Authorization) is an open standard for token-based authentication and authorization. OAuth 2 authentication is commonly used when interacting with the Ascender API programmatically. Like Basic Auth, an OAuth 2 token is supplied with each API request via the Authorization header. Unlike Basic Auth, OAuth 2 tokens have a configurable timeout and are scopable. Tokens have a configurable expiration time and can be revoked one at a time: from the user's **Tokens** tab, with `DELETE /api/v2/tokens/<id>/`, or by an application at `/api/o/revoke_token/`, as explained in [Token and session management](/admin-guide/awx-manage#token-and-session-management) and [Revoke an access token](/admin-guide/authentication/oauth2-tokens#revoke-an-access-token).

<Hint type="note">

By default, external users such as those created by SSO are not allowed to generate OAuth tokens for security purposes. This can be changed from the Miscellaneous Authentication settings of the Ascender UI Settings menu:

![Miscellaneous Authentication settings with the Allow External Users to Create OAuth2 Tokens option turned off](/assets/images/configure-ascender-external-tokens-off.webp)

</Hint>

The different methods for obtaining OAuth 2 Access Tokens in Ascender are:

- Personal access tokens (PAT)
- Application Token: Password grant type
- Application Token: Authorization Code grant type

For more information on the above methods, see [OAuth 2 token authentication](/admin-guide/authentication/oauth2-tokens) in the Ascender admin guides.

First, a user needs to create an OAuth 2 Access Token in the API or in their User's **Tokens** tab in the UI. For further detail on creating them through the UI, see [Users - Tokens](../../users#users---tokens). For the purposes of this example, use the PAT method for creating a token in the API. Upon token creation, the user can set the scope.

<Hint type="note">

The expiration time of the token can be configured system-wide. See [Using OAuth 2 Token System for Personal Access Tokens (PAT)](/admin-guide/authentication/oauth2-tokens#using-oauth-2-token-system-for-personal-access-tokens-pat) for more detail.

</Hint>

Token authentication is best used for any programmatic use of the Ascender API, such as Python scripts or tools like curl, as in the example for creating a PAT (without an associated application) below.

### Curl example

```bash
curl -u user:password -k -X POST https://<ascender-host>/api/v2/tokens/
```

This call will return JSON data like:

![JSON response from the tokens endpoint with the token property highlighted](/assets/images/api-oauth2-json-returned-token-value.webp)

The value of the `token` property is what you can now use to perform a GET request for an Ascender resource, e.g., Hosts.

```bash
curl -k -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <oauth2-token-value>" \
  https://<ascender-host>/api/v2/hosts/
```

Similarly, you can launch a job by making a POST to the job template that you want to launch.

```bash
curl -k -X POST \
  -H "Authorization: Bearer <oauth2-token-value>" \
  -H "Content-Type: application/json" \
  --data '{"limit" : "ansible"}' \
  https://<ascender-host>/api/v2/job_templates/14/launch/
```

### Python example

[Ascender Kit](https://pypi.org/project/ascender-kit/) is an open source tool that makes it easy to use HTTP requests to access the Ascender API. You can have it acquire a PAT on your behalf by using the `ascender login` command. Refer to the [Ascender Kit documentation](https://github.com/ctrliq/ascender-kit) for more detail.

For more information on how to use OAuth 2 in Ascender in the context of integrating external applications, see [OAuth 2 token authentication](/admin-guide/authentication/oauth2-tokens) in the Ascender admin guides.

If you need to write custom requests, you can write a Python script using [Python library requests](https://pypi.org/project/requests/), like in this example:

```python
import json
import requests
oauth2_token_value = 'y1Q8ye4hPvT61aQq63Da6N1C25jiA'   # your token value from Ascender
url = 'https://<ascender-host>/api/v2/users/'
payload = {}
headers = {'Authorization': 'Bearer ' + oauth2_token_value,}

# makes request to Ascender user endpoint
response = requests.request('GET', url, headers=headers, data=payload,
allow_redirects=False, verify=False)

# prints json returned from Ascender with formatting
print(json.dumps(response.json(), indent=4, sort_keys=True))
```

## SSO Authentication

Single sign-on (SSO) authentication methods are fundamentally different from other methods because the authentication of the user happens external to Ascender, like Google SSO, Azure SSO, SAML, or GitHub. For example, with GitHub SSO, GitHub is the single source of truth, which verifies your identity based on the username and password you gave Ascender.

You can configure SSO authentication using Ascender inside a large organization with a central Identity Provider. Once you have configured an SSO method in Ascender, a button for that SSO will be present on the login screen. If you click that button, it will redirect you to the Identity Provider, in this case GitHub, where you will present your credentials. If the Identity Provider verifies you successfully, then Ascender will make a user linked to your GitHub user (if this is your first time logging in via this SSO method), and log you in.

For the various types of supported SSO authentication methods, see [Social authentication](/admin-guide/authentication/social) and [Enterprise authentication](/admin-guide/authentication/enterprise) in the Ascender admin guides.
