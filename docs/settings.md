# Settings

Settings are the system-wide options an administrator changes while Ascender
runs: authentication, job defaults, logging, the UI's branding and so on. They
are changed on the UI's Settings pages or through `/api/v2/settings/`, stored
in the `conf_setting` table, and apply to every process without a restart.

What the deployment decides (the database, `SECRET_KEY`, cookie names, TLS)
is configured with environment variables instead; see
[deploy/README.md](../deploy/README.md). A deployment can also fix the value of
settings in a [settings file](#settings-from-a-file).

The settings registry and the store of values are
`src/internal/settings/settings.go`, the settings file
`src/internal/settings/file.go`, and the API with its validation
`src/internal/api/settings.go` (the authentication settings' structured
fields are validated in `src/internal/api/settings_sso.go`).


## Categories

Every setting belongs to one category. `GET /api/v2/settings/` lists them,
sorted by slug, as a paginated list:

```
GET /api/v2/settings/

{
    "count": 23,
    "next": null,
    "previous": null,
    "results": [
        {
            "url": "/api/v2/settings/all/",
            "slug": "all",
            "name": "All"
        },
        {
            "url": "/api/v2/settings/authentication/",
            "slug": "authentication",
            "name": "Authentication"
        },
        ...
    ]
}
```

| Slug | Name | Described in |
| --- | --- | --- |
| `all` | All | every setting |
| `authentication` | Authentication | [Authentication](auth/README.md), [Sessions](auth/session.md) |
| `azuread-oauth2` | Azure AD OAuth2 (legacy) | [Microsoft Entra ID](auth/entra_id.md) |
| `azuread-oauth2-tenant` | Azure AD Tenant OAuth2 (legacy) | [Microsoft Entra ID](auth/entra_id.md) |
| `bulk` | Bulk Actions | [Bulk API](bulk_api.md) |
| `changed` | Changed | the settings that differ from their default |
| `debug` | Debug (the UI's Troubleshooting page) | [Debugging](debugging/README.md), [ansible-runner integration](ansible_runner_integration.md#debugging) |
| `entra-id` | Microsoft Entra ID | [Microsoft Entra ID](auth/entra_id.md) |
| `github`, `github-org`, `github-team` | GitHub OAuth2, GitHub Organization OAuth2, GitHub Team OAuth2 | [Authentication](auth/README.md) |
| `github-enterprise`, `github-enterprise-org`, `github-enterprise-team` | GitHub Enterprise OAuth2, GitHub Enterprise Organization OAuth2, GitHub Enterprise Team OAuth2 | [Authentication](auth/README.md) |
| `google-oauth2` | Google OAuth2 | [Authentication](auth/README.md) |
| `jobs` | Jobs | |
| `ldap` | LDAP | [LDAP](auth/ldap.md) |
| `logging` | Logging | [Logging Integration](logging_integration.md) |
| `named-url` | Named URL | [Named URLs](named_url.md) |
| `oidc` | Generic OIDC | [OIDC](auth/oidc.md) |
| `saml` | SAML | [SAML](auth/saml.md) |
| `system` | System | |
| `ui` | UI | |

`all` and `changed` are not categories of their own: `all` holds every
setting, and `changed` the ones the database holds a value for, other than
the read-only ones (`INSTALL_UUID` excepted). The other categories come from
the registry (below). The list is empty for users who are neither superusers
nor system auditors.

Besides the categories, `POST /api/v2/settings/logging/test/` tests the log
aggregator (see [Logging Integration](logging_integration.md)), and
`POST /api/v2/settings/ldap/certificate/` and `POST /api/v2/settings/ldap/test/`
help set up an LDAP server (see [LDAP](auth/ldap.md)).


## Reading and changing settings

Each category's URL is a single object, a setting's name to its value, in
the registry's order:

```
GET /api/v2/settings/github-team/

{
    "SOCIAL_AUTH_GITHUB_TEAM_CALLBACK_URL": "https://ascender.example.com/sso/complete/github-team/",
    "SOCIAL_AUTH_GITHUB_TEAM_KEY": "",
    "SOCIAL_AUTH_GITHUB_TEAM_SECRET": "",
    "SOCIAL_AUTH_GITHUB_TEAM_ID": "",
    "SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP": null,
    "SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP": null
}
```

A setting the database holds no value for shows its default. The methods are:

- `GET` returns the category's settings.
- `PATCH` takes an object of the same shape and stores the settings it
  gives; settings it leaves out keep their values.
- `PUT` is a full update: a required setting it leaves out is an error
  ("This field is required.", keyed by the setting, and nothing is stored),
  and an optional one it leaves out is set to its default, which is stored
  as a value of its own (it then shows in `changed`). Read-only settings and
  those the settings file gives are never required. To change some settings
  and keep the rest, use `PATCH`.
- For both, the response is the category's settings after the change, and
  a setting sent (or reset) with its current value is not written again.
- `DELETE` removes the database's values for the category's settings, so
  they read as their defaults again, and answers `204 No Content`. Read-only
  settings and those the settings file gives are left as they are. When the
  category holds `ASCENDER_URL_BASE` (`system` or `all`), it is then set to
  the scheme and host the request was made to (`X-Forwarded-Host` when the
  request has one), unless the settings file gives `ASCENDER_URL_BASE`: the
  file's value stands and nothing is written.
- `OPTIONS` describes each setting: its type, label, help text, default and
  limits. The `PUT` section is left out for users who may not change
  settings. For `changed`, the `GET` section lists every setting and the
  `PUT` section only the settings currently changed, as they are when the
  request is made.

Superusers and system auditors can read every category; other users get
`403` with "You do not have permission to perform this action.", and an
unknown category gets `404` with "Not found.". Only superusers can change
settings, and only with a session, Basic authentication or an OAuth2 token
of `write` scope; a system auditor's `PUT`, `PATCH` or `DELETE` gets `403`.
The few settings everyone may see, the branding and
`LOGIN_REDIRECT_OVERRIDE`, are in `GET /api/` (`custom_logo`,
`custom_header_logo`, `custom_login_info`, `custom_title`,
`login_redirect_override`), which needs no login.

Each value is validated as the setting's type requires, with the messages
of the old API (for instance "Ensure this value is less than or equal to
65535." or `"verbose" is not a valid choice.`). Errors answer `400` keyed by
the setting's name; nothing is stored unless every value passes:

```json
{"LOG_AGGREGATOR_PORT": ["A valid integer is required."]}
```

Some categories also check their settings together, and report it under
`non_field_errors`:

- `authentication`: turning on `DISABLE_LOCAL_AUTH` while none of
  `AUTH_LDAP_SERVER_URI`, `SOCIAL_AUTH_SAML_ENABLED_IDPS` and the OAuth2
  providers' `SOCIAL_AUTH_*_KEY` is set fails with "There are no remote
  authentication systems configured."
- `logging`: turning on `LOG_AGGREGATOR_ENABLED` without a host or type fails
  with "Cannot enable log aggregator without providing host." or "Cannot
  enable log aggregator without providing type.".
- `system`: each entry of `CSRF_TRUSTED_ORIGINS` must have a scheme: "As of
  Django 4.0, the values in the CSRF_TRUSTED_ORIGINS setting must start with
  a scheme (usually http:// or https://) but found ascender.example.com. See
  the release notes for details."

A change made through `all` gets all three checks.

Read-only settings are ignored when they are sent. They are worked out by
Ascender: `INSTALL_UUID` (set once, when the database is created),
`AUTHENTICATION_BACKENDS` (the login methods whose required settings are
set), the SSO callback and metadata URLs (from `ASCENDER_URL_BASE`),
`NAMED_URL_FORMATS` and `NAMED_URL_GRAPH_NODES`, and `IS_K8S`,
`DEFAULT_CONTROL_PLANE_QUEUE_NAME` and `DEFAULT_EXECUTION_QUEUE_NAME` (from
the settings file).

Every change is recorded in the activity stream as the creation, update or
deletion of a `setting`. Creations and updates name the setting and its
category; a deletion records only the old value and the row's id.


## Secret settings

The passwords and client secrets (`LOG_AGGREGATOR_PASSWORD`, the LDAP
servers' `BIND_PASSWORD`, the OAuth2 providers' `SECRET`,
`SOCIAL_AUTH_SAML_SP_PRIVATE_KEY`) are stored encrypted, as
`$encrypted$UTF8$AESCBC$...`, with a key derived from `SECRET_KEY` and the
row's id (`src/internal/crypto/fernet.go`). The API shows a secret that is
set as `$encrypted$`, and one that is not as `""`. Sending `$encrypted$`
back, as a client does when it saves a whole category it read, keeps the
stored value; sending anything else replaces it. The activity stream shows
`hidden` in place of the value.

A secret that cannot be decrypted, usually because `SECRET_KEY` is not the
one it was written with, reads as unset, and the process logs "encrypted
setting could not be decrypted (is SECRET_KEY the one it was written
with?); it reads as unset" once for that setting. Set it again to store it
with the current key.


## Settings from a file

`ASCENDER_SETTINGS_FILE` names a JSON object, a setting's name to its value,
for what the deployment decides rather than an administrator:

```json
{"IS_K8S": true, "SESSION_COOKIE_AGE": 3600, "LOG_AGGREGATOR_HOST": "logs.example.com"}
```

Both processes read the file once, when they start, and should be given the
same one. A registered setting the file gives:

- takes the file's value whatever the database holds;
- is read-only in the API: `GET` shows the file's value, `PUT` and `PATCH`
  ignore it, `DELETE` leaves it, and `OPTIONS` marks it
  `"defined_in_file": true`, puts "This value has been set manually in a
  settings file." and a blank line before its help text (in the
  description too), and leaves it out of the `PUT` section and of the
  description's list of what may be modified. A secret from the file is
  shown as `$encrypted$` like any other.

The settings the registry holds as read-only (`IS_K8S`,
`DEFAULT_CONTROL_PLANE_QUEUE_NAME`, `DEFAULT_EXECUTION_QUEUE_NAME`) take the
file's value but are not marked `defined_in_file`, as in the old application.

The file can give any registered setting that is not read-only, and these,
which only the file can set (see [deploy/README.md](../deploy/README.md) for
what each does): `IS_K8S`, `ASCENDER_AUTO_DEPROVISION_INSTANCES`,
`DISABLE_ALL_SCHEDULES`, `DEFAULT_CONTROL_PLANE_QUEUE_NAME`,
`DEFAULT_EXECUTION_QUEUE_NAME`, `DEFAULT_EXECUTION_QUEUE_POD_SPEC_OVERRIDE`,
`DEFAULT_EXECUTION_QUEUE_MAX_FORKS`, `DEFAULT_EXECUTION_QUEUE_MAX_CONCURRENT_JOBS`,
`RECEPTOR_LOG_LEVEL`, `VMWARE_VALIDATE_CERTS`,
`ASCENDER_NOTIFICATION_REQUEST_TIMEOUT` (the notification backends'
per-operation timeout in seconds, default 30),
`GLOBAL_JOB_EXECUTION_ENVIRONMENTS` and `CONTROL_PLANE_EXECUTION_ENVIRONMENT`.

A file that cannot be read or is not a single JSON object stops the process
with an error. Within it, a setting that cannot apply is skipped and logged
as `settings file: setting ignored`, with the setting and the reason, and
the process starts with the rest. The reasons are:

- "is not a setting this application reads";
- "is worked out by the application and cannot be set", for a read-only
  setting;
- "expected <type>, got <type>", for a value of the wrong JSON type (`null`
  fits any setting);
- the errors a `PUT` of the value would get. The registered settings in the
  file are validated together, as one request, so the checks across a
  category apply too. A skipped setting is the database's again.


## How fast changes apply

A change applies to every process at once, every `ascender-web` replica and
every `ascender-task` process alike:

- Each process keeps the values in memory, so reading a setting costs no
  query.
- The process that makes a change reloads its copy before the request
  returns, so its response and everything it does afterwards see the new
  value. A reload that started earlier and finishes later is discarded,
  so the old value cannot come back.
- Every write to `conf_setting` (the settings API, the LDAP and SSO
  helpers, the UI's pages, which call the API, and code that stores a
  setting, such as the host metrics task) sends a PostgreSQL `NOTIFY` on
  the `ascender_settings` channel in the same transaction. PostgreSQL
  delivers it when the transaction commits, and never for one that rolls
  back.
- Every process holds one connection of its own, outside its connection
  pool, that `LISTEN`s on `ascender_settings`, and reloads its copy as soon
  as a notification arrives.
- When that connection drops, the process logs "settings: change listener
  disconnected; reconnecting", reconnects with a growing pause (up to 30
  seconds), and reloads once it is listening again, for any change made in
  the meantime. As a fallback the values are also read again when they are
  more than 15 seconds old, so a missed notification delays a change by
  about 15 seconds at most.

The external log destinations follow a change at once as well (see
[Logging Integration](logging_integration.md)).

The settings file is read only at startup; a change to it takes effect when
the processes restart.


## Adding a setting (developers)

A setting is data, not code. The registry, `src/internal/settings/registry.json`,
is compiled into both binaries; it was captured from the old application's
`OPTIONS /api/v2/settings/all/`, so the Go application serves the same
settings with the same types, labels, help texts, categories and defaults.
The order of its entries is the order of the settings in every category.

To add a setting:

1. Add an entry to `registry.json` where it should appear:

   ```json
   {
    "key": "EXAMPLE_TIMEOUT",
    "type": "integer",
    "label": "Example Timeout",
    "help_text": "Seconds to wait for the example service.",
    "category": "Jobs",
    "category_slug": "jobs",
    "defined_in_file": false,
    "read_only": false,
    "default": 30,
    "required": true,
    "min_value": 0,
    "unit": "seconds"
   }
   ```

   `type` is one of `string`, `boolean`, `integer`, `list`, `choice`,
   `datetime`, `nested object` or `field`; `choices`, `child`,
   `placeholder`, `min_value`, `max_value`, `min_length`, `max_length` and
   `unit` are optional. A new `category_slug` makes a new category (not
   `all` or `changed`, which the API adds). Provide a default whenever there
   is one: a `DELETE` returns settings to it.
2. Add its validation to `src/internal/api/metadata/setting_fields.json`:
   the old field class (`IntegerField`, `BooleanField`, `CharField`,
   `ChoiceField`, `URLField`, `StringListField`, ...) with its arguments
   (`allow_null`, `allow_blank`, `min_value`, `max_value`, `choices`, ...).
   `validateField` in `src/internal/api/settings.go` implements the classes.
   A setting with no entry is validated as a blank-allowed `CharField`.
3. Add it to the `OPTIONS` documents in `src/internal/api/metadata/settings/`:
   its category's file and `all.json` (which `changed` is served from),
   under `GET` and, unless it is read-only, `PUT`. Their labels and help
   texts are translated through `src/internal/api/locale/options/<lang>.json`.
4. For a secret, add its name to `EncryptedKeys` in
   `src/internal/settings/settings.go` and set `"encrypted": true` in its
   `setting_fields.json` entry: the first encrypts it in the database and
   hides it in the API, the second keeps `$encrypted$` from replacing it.
5. For a check across settings, add a case to `categoryValidate` in
   `src/internal/api/settings.go`.

Code reads a setting from the store, `api.Server.Settings` or the task
dispatcher's `Settings`, with `Get`, `String`, `Bool`, `Int` or `List`:

```go
timeout := s.Settings.Int(ctx, "EXAMPLE_TIMEOUT")
```

The value is the settings file's if it gives one, else the database's, else
the registry's default. A name the registry does not know reads as the zero
value, unless the settings file gives it. Values are read from the in-memory
copy, so reading a setting inside a transaction or on every request costs no
query. `Set` and `Delete` store a value from code outside the API, as the
host metrics task does for its last run time; inside a transaction, `Write`
and `Remove` do, followed by `Reload` once it commits. All four announce the
change to the other processes; a write to `conf_setting` that bypasses them
would not reach the other processes until their 15-second reload.

A setting that only the deployment should set, and that has no place in the
API, goes in `FileOnlyKeys` in `src/internal/settings/file.go` with its JSON
type instead of in the registry.

To remove a setting, undo the steps above: its registry entry, its
`setting_fields.json` entry, its place in the `OPTIONS` documents (and
`descriptions_html.json.gz`, regenerated by `render_descriptions.py`
beside them, since the views' descriptions list the fields) and its field
on the UI page. Existing `conf_setting` rows for it need no migration: the
store and the API read only the keys the registry has, so the API no longer
lists them in any category (`all` and `changed` included) and code reads
them as unknown.
