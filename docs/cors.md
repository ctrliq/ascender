## CORS Support

Ascender answers cross-origin requests from browsers as the old application
did with django-cors-headers and its default settings. Which origins a page
may call the API from is the one choice a deployment makes: the
`ASCENDER_CORS_ALLOWED_ORIGINS` environment variable, the old
`CORS_ALLOWED_ORIGINS`. It holds origins separated by commas:

```
ASCENDER_CORS_ALLOWED_ORIGINS=https://tools.example.com,http://127.0.0.1:9000
```

Each origin is a scheme and a host, with a port when it is not the scheme's
default, and nothing after it (no path, not even a trailing `/`), or `null`
for pages that browsers give no origin (a file opened locally, a sandboxed
frame). An entry of another form stops the process at startup with the
variable's name, as django-cors-headers' checks refused it: the old
documentation's example `hostname.example.com` has no scheme and is not
accepted. Matching is exact on the scheme and the host and port. There is
no wildcard and no pattern (`CORS_ALLOW_ALL_ORIGINS` and
`CORS_ALLOWED_ORIGIN_REGEXES` have no equivalent). By default the list is
empty and no page from another origin can read a response.

The headers are added by `Middleware` in `src/internal/api/middleware.go`,
so they cover `/api/` and `/websocket/`. The UI's pages and `/sso/` do not
get them, as nothing on another origin has reason to read those.

### What is sent

For a request whose `Origin` is in the list:

- `Access-Control-Allow-Origin` with that origin, on every response,
  errors included;
- on `OPTIONS` requests, also `Access-Control-Allow-Methods: DELETE, GET,
  OPTIONS, PATCH, POST, PUT`, `Access-Control-Allow-Headers: accept,
  authorization, content-type, user-agent, x-csrftoken, x-requested-with`
  and `Access-Control-Max-Age: 86400`.

`Access-Control-Allow-Credentials` is never sent (the old
`CORS_ALLOW_CREDENTIALS` default), so a browser neither sends cookies with
a cross-origin request made with `credentials: "include"` nor lets the page
read its answer. A page on another origin authenticates with an OAuth2
token in the `Authorization` header (see [OAuth2](auth/oauth.md)).
Every response also carries `Access-Control-Expose-Headers:
X-API-Request-Id` and `Vary` with `origin`, whatever the origin.

A preflight, an `OPTIONS` request with an `Access-Control-Request-Method`
header, is answered at once with an empty `200`, before authentication and
whatever its origin: an origin not in the list gets no `Access-Control-*`
headers, and the browser then refuses to send the request. An `OPTIONS`
request without that header is not a preflight and gets the API's usual
metadata, with the headers above when its origin is listed.

### CORS and CSRF

An allowed CORS origin is not a trusted CSRF origin. Requests that change
something and are authenticated by a session cookie are checked for CSRF as
always: the browser must not have sent them from another site unless their
origin is in `CSRF_TRUSTED_ORIGINS` (the system setting) or the
`ASCENDER_CSRF_TRUSTED_ORIGINS` environment variable, and they must carry
the `X-CSRFToken` header matching the CSRF cookie. Otherwise they get `403`
with "CSRF Failed: Origin checking failed - https://tools.example.com does
not match any trusted origins." (with the CORS headers, so the page can
read why). Requests authenticated by an OAuth2 token or Basic
authentication are not checked for CSRF.

Since no credentials are allowed, cross-origin calls from a browser carry a
token, and the CSRF settings do not come into it. Listing an origin in
`CSRF_TRUSTED_ORIGINS` is for a UI or proxy that sends the session cookie,
for example a reverse proxy or load balancer whose public address differs
from the one the web server sees; see [Sessions](auth/session.md) and
[deploy/README.md](../deploy/README.md).

### Other django-cors-headers settings

The old application read every `CORS_*` setting from its settings files.
Here the others keep the defaults it shipped with (no credentials, the
methods, headers and preflight cache above, no exposed headers beyond
`X-API-Request-Id`, no private network access), and the settings file
(`ASCENDER_SETTINGS_FILE`) does not take them: a settings file that sets
one logs "settings file: setting ignored" with the reason "is not a setting
this application reads".
