# LDAP

Ascender can check usernames and passwords against an LDAP directory, such as
Active Directory, FreeIPA or OpenLDAP, and keep each directory user's
Ascender account, organizations and teams in step with the directory at every
login.

Up to six LDAP servers can be configured. The default server's settings are
named `AUTH_LDAP_<field>`; the others are numbered `AUTH_LDAP_1_<field>` to
`AUTH_LDAP_5_<field>`. All six are under `/api/v2/settings/ldap/` and on the
LDAP settings pages of the UI. A server is used only while its
`SERVER_URI` is set. Where LDAP comes in the order of password logins is
described in the [overview](README.md#password-logins).

The directory client is `src/internal/sso/ldap.go`; what a login does with
the account is `src/internal/api/sso_ldap.go`.


## How a login works

For each configured server in turn:

1. **The username.** A username that belongs to a local account (one without
   an LDAP DN, compared without regard to case) is never sent to LDAP. An
   empty password is refused without contacting the server.
2. **Connect.** `SERVER_URI` may list several servers, separated by spaces or
   commas; the first that accepts a connection is used. An `ldaps://` server
   speaks TLS from the start; an `ldap://` server is switched to TLS with
   Start TLS when `START_TLS` is on, and is otherwise unencrypted. See
   [TLS and certificates](#tls-and-certificates).
3. **Find the user's DN.** When `USER_DN_TEMPLATE` is set, the DN is the
   template with `%(user)s` replaced by the username (DN-escaped), and
   `USER_SEARCH` is not used. Otherwise each search of `USER_SEARCH` is run,
   bound as `BIND_DN` (anonymously when `BIND_DN` and `BIND_PASSWORD` are
   empty), with `%(user)s` in its filter replaced by the username. The login
   goes on only if exactly one entry is found in all; a search that fails is
   logged and skipped.
4. **Bind as the user** with the password. A refused password ends the login
   at this server.
5. **Group requirements.** The user must be a member of `REQUIRE_GROUP` when
   it is set, and must not be a member of `DENY_GROUP`.
6. **The account.** The Ascender account whose username matches, without
   regard to case, is used; a new one is created with the username in lower
   case and no usable password. Its first name, last name and email are set
   from `USER_ATTR_MAP`, its flags from `USER_FLAGS_BY_GROUP`, its
   organizations and teams from `ORGANIZATION_MAP` and `TEAM_MAP`, and its
   LDAP DN is recorded.

An account that the directory accepts but that is inactive in Ascender is
refused ("This account is inactive.").

A session made by an LDAP login lasts only while that server is configured:
when its `SERVER_URI` is cleared, the session ends at the user's next request.

The fields LDAP sets cannot be edited on the user afterwards; see
[External accounts](README.md#external-accounts).


## Settings

The names below are the default server's; the numbered servers have the same
settings with their number after `AUTH_LDAP_`.

| Setting | Meaning |
| --- | --- |
| `AUTH_LDAP_SERVER_URI` | One or more `ldap://` or `ldaps://` URIs, separated by spaces or commas. Empty disables this server. |
| `AUTH_LDAP_BIND_DN`, `AUTH_LDAP_BIND_PASSWORD` | The account that searches the directory. Both empty: an anonymous bind. |
| `AUTH_LDAP_START_TLS` | Start TLS on `ldap://` servers. |
| `AUTH_LDAP_CA_CERT` | PEM certificates trusted for this server beside the system trust store. |
| `AUTH_LDAP_CONNECTION_OPTIONS` | Connection options; see below. |
| `AUTH_LDAP_USER_SEARCH` | `[base DN, scope, filter]`, or a list of them, to find the user. The scope is `SCOPE_BASE`, `SCOPE_ONELEVEL` or `SCOPE_SUBTREE`; the filter contains `%(user)s`. |
| `AUTH_LDAP_USER_DN_TEMPLATE` | A DN with `%(user)s`, used instead of the search when set. |
| `AUTH_LDAP_USER_ATTR_MAP` | `first_name`, `last_name` and `email`, each mapped to a directory attribute. The attribute's first value is used; a missing attribute is logged and leaves the field alone. Names are cut to 150 characters. |
| `AUTH_LDAP_GROUP_SEARCH` | `[base DN, scope, filter]` for the user's groups. Required. |
| `AUTH_LDAP_GROUP_TYPE`, `AUTH_LDAP_GROUP_TYPE_PARAMS` | How group membership is recorded; see [Group types](#group-types). Required. |
| `AUTH_LDAP_REQUIRE_GROUP`, `AUTH_LDAP_DENY_GROUP` | A group DN the user must, or must not, belong to. |
| `AUTH_LDAP_USER_FLAGS_BY_GROUP` | `is_superuser` and `is_system_auditor`, each a group DN or a list of them. A flag listed here is set at every login: on when the user belongs to any of its groups, off when not. |
| `AUTH_LDAP_ORGANIZATION_MAP`, `AUTH_LDAP_TEAM_MAP` | Organization and team membership; see [Mapping users to organizations and teams](#mapping-users-to-organizations-and-teams). |

### Connection options

`AUTH_LDAP_CONNECTION_OPTIONS` accepts the option names python-ldap defined,
but only these have an effect:

| Option | Effect |
| --- | --- |
| `OPT_NETWORK_TIMEOUT` | Seconds to wait for a connection (default 30). |
| `OPT_TIMEOUT` | Seconds to wait for each operation (no limit by default). |
| `OPT_X_TLS_REQUIRE_CERT` | `0` (never) or `3` (allow), or `false`, turns off certificate verification. Any other value verifies, as when the option is absent. |
| `OPT_X_TLS_CACERTFILE` | A PEM file, on the web server's file system, whose certificates replace the system trust store for this server. `AUTH_LDAP_CA_CERT` is still added to them. |

Referrals are never followed, whatever `OPT_REFERRALS` says.

### Group types

| `GROUP_TYPE` | A group lists its members in |
| --- | --- |
| `MemberDNGroupType` | the attribute named by `member_attr` in `GROUP_TYPE_PARAMS` (required), as DNs |
| `GroupOfNamesType`, `ActiveDirectoryGroupType` | `member`, as DNs |
| `GroupOfUniqueNamesType` | `uniqueMember`, as DNs |
| `OrganizationalRoleGroupType` | `roleOccupant`, as DNs |
| `PosixGroupType` | `memberUid`, as the user's `uid`; a group whose `gidNumber` is the user's `gidNumber` also counts |
| `PosixUIDGroupType` | as `PosixGroupType`, with the user attribute named by `ldap_group_user_attr` in `GROUP_TYPE_PARAMS` (default `uid`) |

Each DN-based type has a `Nested` form (`NestedMemberDNGroupType`,
`NestedGroupOfNamesType`, `NestedActiveDirectoryGroupType`,
`NestedGroupOfUniqueNamesType`, `NestedOrganizationalRoleGroupType`) that
also counts the groups that contain the user's groups, at any depth. The
user's groups are the entries under `GROUP_SEARCH` that match its filter and
list the user (or, for a nested type, one of the user's groups). The default
is `MemberDNGroupType` with `{"member_attr": "member", "name_attr": "cn"}`;
`name_attr` is accepted but not used.

Group DNs are compared without regard to case everywhere: in
`REQUIRE_GROUP`, `DENY_GROUP`, the flags and the maps.


## TLS and certificates

The server's certificate is verified against the system trust store and the
certificates in `AUTH_LDAP_CA_CERT`, and must name the host in the server
URI. TLS 1.2 is the oldest version accepted.

`AUTH_LDAP_CA_CERT` takes PEM certificates only (`-----BEGIN
CERTIFICATE-----`), at least one, with nothing after the last. Put in the
certificate authority that issued the server's certificate, and any
intermediate ones; the server's own certificate also works, but has to be
replaced when it is renewed.

The certificate field on the LDAP settings form has a **Fetch from server**
button, which reads what the server presents and fills the field. It uses:

```
POST /api/v2/settings/ldap/certificate/
{"server_uri": "ldaps://ldap.example.com"}
```

`server_uri` takes what `AUTH_LDAP_SERVER_URI` takes; the first server that
answers within 10 seconds is read, `ldaps://` servers as they connect and
`ldap://` servers after Start TLS (whatever `START_TLS` says). The chain is
read without verifying it, and no bind or search is sent. The response:

```json
{
  "server": "ldap.example.com:636",
  "trusted": false,
  "verify_error": "x509: certificate signed by unknown authority",
  "leaf_only": false,
  "certificates": [
    {"subject": "CN=ldap.example.com", "issuer": "CN=Example CA", "not_before": "...", "not_after": "...",
     "sha256_fingerprint": "AB:CD:...", "is_ca": false},
    {"subject": "CN=Example CA", "issuer": "CN=Example CA", "not_before": "...", "not_after": "...",
     "sha256_fingerprint": "12:34:...", "is_ca": true}
  ],
  "ca_cert": "-----BEGIN CERTIFICATE-----\n..."
}
```

`trusted` says whether the system trust store already accepts the server for
that host, and `verify_error` why not. `ca_cert` is what to put in
`AUTH_LDAP_CA_CERT`: the certificates the server sent after its own, or its
own certificate when it sent nothing else (`leaf_only`). Check the
fingerprints with the directory's administrators before trusting them. A
server that cannot be read gets a 400 with `{"error": "..."}`.

The endpoint and the certificate setting were added in this implementation
(`src/internal/api/settings_ldap_cert.go`, `src/internal/sso/ldap_cert.go`).
Only a system administrator, with write access, can use it.


## Testing a server

The **Test** button on each LDAP settings page connects and binds with the
settings on the form, saved or not, and can also try a login. Nothing is
saved and no account is created or changed. It uses:

```
POST /api/v2/settings/ldap/test/
{
  "server": "default",
  "AUTH_LDAP_START_TLS": true,
  "username": "jdoe",
  "password": "..."
}
```

* `server` is `"default"` or a server number from `"1"` to `"5"`.
* The server's saved settings are used, except those given by their full
  names. The test takes `SERVER_URI`, `BIND_DN`, `BIND_PASSWORD`,
  `START_TLS`, `CA_CERT`, `USER_SEARCH`, `USER_DN_TEMPLATE`, `USER_ATTR_MAP`,
  `GROUP_SEARCH`, `GROUP_TYPE`, `GROUP_TYPE_PARAMS`, `REQUIRE_GROUP`,
  `DENY_GROUP` and `USER_FLAGS_BY_GROUP`; they are validated as a save would
  validate them.
* A `BIND_PASSWORD` of `$encrypted$`, or none, means the saved password,
  which is only sent to the saved `SERVER_URI`. To test another URI with a
  bind password, send the password.
* `username` and `password` are optional. With them, a login as that user is
  tried as the login page would try it.

The connection and bind succeed with a 200:

```json
{
  "server_uri": "ldaps://ldap.example.com",
  "tls": "ldaps",
  "anonymous": false,
  "bind_dn": "cn=ascender-bind,ou=services,dc=example,dc=com",
  "whoami": "dn:cn=ascender-bind,ou=services,dc=example,dc=com",
  "login": { ... }
}
```

`tls` is `ldaps`, `start_tls` or `none` (passwords cross the network
unencrypted). `whoami` is the server's answer to the "Who am I?" operation,
or null. A failure is a 400 with the `stage` it stopped at (`connect`, `bind`
or `configuration`), the `error`, and a `hint` when there is a usual fix
(an untrusted certificate, a host name the certificate does not list, a
server that requires TLS, an unreachable server, refused credentials).

`login`, present when a username was given, reports how far the login got:

* `dn_from` (`USER_DN_TEMPLATE` or `USER_SEARCH`), `dn`, `matches` (entries
  the search found) and `search_errors`;
* on success, `ok: true` with the `attributes` that `USER_ATTR_MAP` would
  set (null for one missing from the directory), the user's `groups`, and
  the `flags` that `USER_FLAGS_BY_GROUP` would give;
* otherwise `ok: false` with the `stage` (`local_account`, `search`,
  `user_bind`, `require_group`, `deny_group`, `groups`, `flags`,
  `configuration`), the `reason` or `error`, and a `hint`. When a group
  requirement refused the login, `member_of` (the user's `memberOf` values,
  direct memberships only) and `groups` (the groups `GROUP_SEARCH` and
  `GROUP_TYPE` find) show what the directory reported.

The organization and team maps are not evaluated. The endpoint was added in
this implementation (`src/internal/api/settings_ldap_cert.go`); only a system
administrator, with write access, can use it.


## Example: FreeIPA

Server URI (append further servers with spaces or commas):

```
ldaps://ipa1.example.com:636
```

Bind DN (see [creating a bind account in
FreeIPA](https://www.freeipa.org/page/Creating_a_binddn_for_Foreman)) and
password:

```
uid=ascender-bind,cn=sysaccounts,cn=etc,dc=example,dc=com
```

CA certificate: the FreeIPA CA (`/etc/ipa/ca.crt` on an enrolled host), or
**Fetch from server**.

User DN template:

```
uid=%(user)s,cn=users,cn=accounts,dc=example,dc=com
```

Group type `NestedMemberDNGroupType`, with the default parameters
`{"member_attr": "member", "name_attr": "cn"}`.

Group search:

```json
[
  "cn=groups,cn=accounts,dc=example,dc=com",
  "SCOPE_SUBTREE",
  "(objectClass=groupOfNames)"
]
```

User attribute map:

```json
{
  "first_name": "givenName",
  "last_name": "sn",
  "email": "mail"
}
```

User flags by group:

```json
{
  "is_superuser": "cn=ascender-admins,cn=groups,cn=accounts,dc=example,dc=com"
}
```

Organization map:

```json
{
  "Example Org": {
    "admins": "cn=example-org-admins,cn=groups,cn=accounts,dc=example,dc=com",
    "remove_admins": false
  }
}
```


## Mapping users to organizations and teams

`AUTH_LDAP_ORGANIZATION_MAP` and `AUTH_LDAP_TEAM_MAP` decide which
organizations and teams a user belongs to, and they are evaluated every time
that user logs in. Organizations and teams they name that do not exist yet are
created at the login (a new organization gets the managed Ansible Galaxy
credential).

An organization map entry is named after the organization and decides three
roles: `admins`, `users` (members) and `auditors`. A team map entry is named
after the team, must give its `organization`, and decides membership with
`users`. Each role takes:

| Value | Meaning |
| --- | --- |
| a group DN, or a list of them | members of any of the groups have the role |
| `true` | everyone who logs in through this server has the role |
| `false` | nobody is given the role |
| `null`, or the key left out | the role is left as it is |

A user that a role's groups do not name loses the role when `remove` is on.
`remove` defaults to true. An organization entry can set `remove` for all
three roles and `remove_admins`, `remove_users` and `remove_auditors` for
one.

```json
{
  "Patching Viewers": {
    "organization": "Example Org",
    "users": ["CN=viewers,OU=Groups,DC=example,DC=com"],
    "remove": true
  }
}
```

The groups are the user's groups as `GROUP_SEARCH` and `GROUP_TYPE` find
them (`src/internal/sso/maps.go`, `src/internal/api/sso_ldap.go`).

### Trigger rules

Naming a single person with a group DN means creating a group of one in the
directory. A rule can instead match on the user themselves. A team map entry
takes one in `triggers`:

```json
{
  "Patching Viewers": {
    "organization": "Example Org",
    "triggers": {
      "attributes": {
        "mail": {"equals": "someone@example.com"}
      }
    },
    "remove": true
  }
}
```

Organization map entries take one rule per role, named after the role it
decides:

```json
{
  "Example Org": {
    "triggers_admins": {"attributes": {"department": {"equals": "Private Cloud"}}},
    "triggers_users": {"groups": {"has_or": ["CN=staff,OU=Groups,DC=example,DC=com"]}},
    "triggers_auditors": {"never": {}}
  }
}
```

A rule is one of four things (`src/internal/sso/triggers.go`):

| Trigger | Matches |
|---|---|
| `attributes` | the attributes of the user's directory entry |
| `groups` | the DNs of the groups they belong to, with `has_or` (any of them), `has_and` (all of them) or `has_not` (none of them) |
| `always` | everyone who logs in |
| `never` | nobody |

Attributes are matched with one of `equals`, `matches` (a Python regular
expression, matched from the start of the value), `contains`, `ends_with` or
`in` (a list). Each value of a multi-valued attribute is a condition of its
own, combined by `join_condition` below: with `or` any value may match, with
`and` every value must. An attribute given an empty condition (`{}`) matches anyone who has that
attribute at all. `matches` ignores case, while the rest do not, so
`{"matches": "^private cloud$"}` and `{"equals": "Private Cloud"}` are not the
same rule. A match that runs longer than one second counts as no match.
Several attributes are combined with `join_condition`, either `or` (the
default) or `and`:

```json
{
  "attributes": {
    "join_condition": "and",
    "mail": {"ends_with": "@example.com"},
    "department": {"equals": "Private Cloud"}
  }
}
```

The attribute names are the directory's own, not the names they are mapped to
in `AUTH_LDAP_USER_ATTR_MAP`, and any attribute of the entry can be matched.
They are matched without regard to case, as LDAP treats them, so
`sAMAccountName` and `samaccountname` name the same attribute. Group DNs are
compared without regard to case too. The attribute values are not: `equals`,
`contains`, `ends_with` and `in` are case sensitive unless the web server is
started with `ASCENDER_AUTH_MAP_CASE_INSENSITIVE` on (see
[deploy/README.md](../../deploy/README.md)).

Only one trigger, one group operator within `groups`, and one operator per
attribute are evaluated. Saving a rule with more than one is refused rather
than half applied.

So is a rule that constrains nothing, because it still decides. An empty body,
an empty operand, or a pattern that does not compile would either hand the role
to everyone who logs in or take it from everyone, and `remove` then carries that
across the whole directory. A rule that is stored but cannot be evaluated is
logged at each login ("The trigger rule in mapping ... will be ignored") and
treated as absent.

### How a rule and a group DN list fit together

An entry may carry both. The rule is evaluated first:

* `always`, or a rule the user matches, gives them the role.
* `never` takes it away, whatever the group DNs say.
* A rule that says nothing about the user falls through to the group DNs
  beside it, and then to `remove`.

An entry with no rule is decided by its group DNs and `remove` alone.


## Logging

`ascender-web` logs to standard output; `ASCENDER_LOG_LEVEL` sets the level.
LDAP messages carry the logger name `ascender.sso.backends` and start with the
server's backend name (`LDAPBackend`, `LDAPBackend1`, ...). Why a login was
refused (no single entry found for the username, the password rejected, a
group requirement not met) is logged at `info`; a directory or configuration
error at `error`, as "Encountered an error authenticating to LDAP" with the
error.


## Development tests

The directory client's tests (`src/internal/sso/ldap_test.go`) run against a
directory seeded with `src/internal/sso/testdata/zz-seed.ldif` when
`ASCENDER_TEST_LDAP_URI` names it, and are skipped otherwise.
