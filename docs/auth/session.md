# Sessions

A browser signs in once and is then recognised by a session cookie. The
cookie holds only a random key; what it stands for (the user, how they signed
in, a hash of their password) is kept on the server, in the `django_session`
table, so the cookie gives away nothing about the user, lasts only while the
user is active, and can be ended at any time. Scripts and other API clients
use [OAuth2 tokens](oauth.md) or HTTP Basic authentication instead.

Sessions are `src/internal/auth/session.go`; the login, logout and the
session checks on each request are in `src/internal/api/views_root.go` and
`src/internal/api/middleware.go`.


## Logging in

The UI's login page signs users in. For the API, `GET /api/login/` shows the
browsable API's login form, and posting it signs in:

```
POST /api/login/
Content-Type: application/x-www-form-urlencoded
Cookie: csrftoken=<token>

username=admin&password=...&next=/api/&csrfmiddlewaretoken=<token>
```

The body is a form, not JSON, with four fields:

- `username` and `password`: the credentials, checked as described in
  [Password logins](README.md#password-logins).
- `next`: where to go afterwards. Only a path on this server is followed;
  anything else goes to `/api/`, which is also the default.
- `csrfmiddlewaretoken`: the CSRF token, which must equal the `csrftoken`
  cookie. `GET /api/login/` sets the cookie and puts the token in the form.

A successful login answers `302 Found` with `Location` set to `next`, and
these headers:

```
Set-Cookie: ascender_sessionid=Q2xxR0b3K9bW1pXr5nB0aYkU3t8dLm7c; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax
Set-Cookie: userLoggedIn=true; Path=/; Secure; SameSite=Lax
Set-Cookie: csrftoken=<new token>; Path=/; Max-Age=31449600; Secure; SameSite=Lax
X-API-Session-Cookie-Name: ascender_sessionid
Session-Timeout: 1800
```

- The session cookie carries the session key. Clients should read the
  cookie's name from `X-API-Session-Cookie-Name` and parse the `Set-Cookie`
  header by the [cookie rules](https://tools.ietf.org/html/rfc6265).
- `userLoggedIn` tells the UI's scripts that a session exists, since they
  cannot read the `HttpOnly` session cookie.
- Every login gets a new CSRF token, so a token from before the login no
  longer works.
- `Session-Timeout` is the number of seconds the session has left.

Logging in from a browser that already has a session ends that session and
starts a new one with a new key.

A wrong username or password answers `401` with the form again and "Please
enter a correct username and password. Note that both fields may be
case-sensitive."; an inactive account gets "This account is inactive." A post
without a valid CSRF token gets `403`.

After logging in, a client sends the cookie with each request:

```
Cookie: ascender_sessionid=Q2xxR0b3K9bW1pXr5nB0aYkU3t8dLm7c
```

Requests that change something (`POST`, `PUT`, `PATCH`, `DELETE`) with a
session must also send the CSRF token, in an `X-CSRFToken` header or the
`csrfmiddlewaretoken` form field, and must not come from a page on another
site (judged by `Sec-Fetch-Site`, else `Origin` against the `Host`), unless
that site's origin is listed in the `CSRF_TRUSTED_ORIGINS` setting or the
`ASCENDER_CSRF_TRUSTED_ORIGINS` environment variable. Otherwise they get
`403` with `CSRF Failed: ...`. Requests authenticated by an OAuth2 token or
Basic authentication need no CSRF token. See `src/internal/auth/csrf.go`.


## Logging out

```
POST /api/logout/
```

ends the session and clears the session cookie, and sets `userLoggedIn` to
`false`. Like any other change made with a session it needs the CSRF token. It
redirects to the local path in `next` (from the form or the query string), or
to `/api/`. Only `POST` logs out; a `GET` gets `405`. The browsable API's and
the UI's log out buttons post it.

When the session came from an OIDC or Entra ID login that is set up to end the
provider's session too, a browser is redirected to the provider instead, and
other clients get `{"logout_url": "..."}` (see [oidc.md](oidc.md) and
[entra_id.md](entra_id.md)).


## How long a session lasts

`SESSION_COOKIE_AGE` (in the authentication settings, "Idle Time Force Log
Out", default 1800 seconds) is an idle timeout. Each authenticated request
moves the session's expiry that far ahead and sends the cookie again with the
remaining time, so a session lasts as long as the user keeps working and ends
`SESSION_COOKIE_AGE` seconds after their last request. Every response to a
request made with the session carries `Session-Timeout`, which the UI uses to
warn the user before the session runs out.

A session also ends:

- when the user logs out;
- when the user's password changes. Each session holds a hash of the
  password it was made with, and a session whose hash no longer matches is
  ended. When users change their own password, the session they did it from
  carries on;
- when the user is made inactive, or `DISABLE_LOCAL_AUTH` is turned on and
  the user has only a local account;
- when the login method that made it is no longer configured (an LDAP
  server's `SERVER_URI` is cleared, or a provider's required settings);
- when it is one of the oldest past `SESSIONS_PER_USER` (below).

Expired sessions are removed from the database by the task process every five
minutes.


## Sessions per user

`SESSIONS_PER_USER` (default `-1`, no limit) is the most sessions a user may
have at once. When a login goes past it, the user's oldest sessions are ended
and a websocket message is sent to the group
`control-limit_reached_<user id>`:

```json
{"group_name": "control", "reason": "limit_reached"}
```

A client that subscribed to that group (see [Websockets](../websockets.md))
can sign out when it arrives. The UI does not subscribe; a browser whose
session was ended returns to the login page at its next request.


## Cookie settings

The cookies are configured when the web server starts, not through the
settings API:

| Environment variable | Default | Effect |
| --- | --- | --- |
| `ASCENDER_SESSION_COOKIE_NAME` | `ascender_sessionid` | The session cookie's name. |
| `ASCENDER_CSRF_COOKIE_NAME` | `csrftoken` | The CSRF cookie's name. |
| `ASCENDER_LOGGED_IN_COOKIE_NAME` | `userLoggedIn` | The logged-in marker's name. |
| `ASCENDER_SESSION_COOKIE_SECURE` | on, off when `ASCENDER_MODE` is `development` | The `Secure` flag on all three, so browsers send them over HTTPS only. |

With the `Secure` flag on, a browser does not send the cookies over plain
HTTP, and nobody can stay logged in; run a deployment without TLS with
`ASCENDER_MODE=development`. See [deploy/README.md](../../deploy/README.md)
for the other variables.

> **Note:** `SESSION_COOKIE_NAME` is not a setting in this implementation:
> the name is `ASCENDER_SESSION_COOKIE_NAME`. Sessions are stored in a format
> of this implementation's own, so after a database from the Python
> application is upgraded, its sessions are not recognised and every user
> signs in again.
