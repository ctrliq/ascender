# Generic OIDC

Ascender can log users in through any OpenID Connect provider, such as Keycloak,
Entra ID, Okta, Authentik or Dex. The settings live under **Settings > Generic
OIDC**, and all of them start with `SOCIAL_AUTH_OIDC_`.

The login flow is in `src/internal/sso/social.go` (the `oidc` backend), the
steps that run after it (finding or creating the account, maps and flags) in
`src/internal/api/sso_social.go`, and the trigger rules in
`src/internal/sso/triggers.go`.

## Connecting to the provider

Create a confidential client at the provider and register
`SOCIAL_AUTH_OIDC_CALLBACK_URL` (shown on the settings page, it is
`<base url>/sso/complete/oidc/`) as one of its redirect URIs. Then fill in:

| Setting | What it is |
|---|---|
| `SOCIAL_AUTH_OIDC_KEY` | the client ID |
| `SOCIAL_AUTH_OIDC_SECRET` | the client secret |
| `SOCIAL_AUTH_OIDC_OIDC_ENDPOINT` | the issuer URL, the part before `/.well-known/openid-configuration`, without a trailing slash |
| `SOCIAL_AUTH_OIDC_VERIFY_SSL` | whether to check the provider's certificate, on by default |
| `SOCIAL_AUTH_OIDC_SCOPE` | scopes to ask for on top of `openid`, `profile` and `email` |
| `SOCIAL_AUTH_OIDC_USERNAME_KEY` | the claim a new user's username comes from, `preferred_username` by default |
| `SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN` | keep only the part before the `@` of that claim, off by default |
| `SOCIAL_AUTH_OIDC_GROUPS_CLAIM` | the claim holding the user's groups, `groups` by default |

The login button appears once the client ID, the secret and the provider URL
are set.

Everything else, the authorization, token and userinfo endpoints, the issuer
and the signing keys, is read from the provider's discovery document. The
client authenticates to the token endpoint with HTTP basic auth
(`client_secret_basic`) unless the discovery document lists only other
methods, in which case the secret is sent in the form (`client_secret_post`).

The `redirect_uri` Ascender sends is built from the address the browser used
to reach it: the `Host` header, and `https` when the connection is TLS or a
proxy in front sends `X-Forwarded-Proto: https`. It has to match the redirect
URI registered at the provider, so a proxy must pass the original `Host` on.
The callback URL on the settings page is built from `ASCENDER_URL_BASE`
instead, and is only right when that is the address users use.

Before it trusts a login, Ascender checks the ID token: its signature against
the provider's keys, the issuer, the audience (and `azp`), `at_hash`, `nbf`,
an `iat` no older than ten minutes, and the nonce it sent, which can be used
once. The userinfo response must be for the same `sub`.

The claims Ascender matches against are the ones in the ID token together with
the ones the userinfo endpoint returns. Where both carry the same claim, the
userinfo one wins. Many providers only send groups to clients that ask for them,
either through a scope (add it to `SOCIAL_AUTH_OIDC_SCOPE`) or through a mapper
configured on the client.

`SOCIAL_AUTH_OIDC_GROUPS_CLAIM` can name a nested claim by its dotted path. With
Keycloak, for instance, realm roles arrive as
`{"realm_access": {"roles": [...]}}`, and setting the claim to
`realm_access.roles` makes those roles usable as groups. A claim whose name
itself contains dots, like the schema URLs Entra ID uses, is found by its full
name first.

A token that carries no groups claim at all is not read as "member of no
groups". It usually means the scope or the mapper that sends groups is gone, or,
with Entra ID, that the user is in more than 200 groups and the token points at
a `_claim_sources` endpoint instead of listing them. In that case every rule that
matches on groups is ignored and logged: the login rule refuses the user, and
maps and flags leave the user's roles as they were. With Entra ID, users in that
many groups need the groups filtered on the application (for example to the
groups assigned to it) so they fit in the token.

Only match on claims the provider controls. Some, like `name`, custom profile
attributes in Keycloak, or an `email` the provider has not verified, can be
changed by the users themselves. Pair `email` with `email_verified` when a rule
depends on it.

## Usernames

A new user's username is taken from the claim named by
`SOCIAL_AUTH_OIDC_USERNAME_KEY`. Many providers only offer an address there:
Entra ID's `preferred_username` is the user principal name, such as
`fernando.roca@example.com`. Turn on `SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN` to
keep only the part before the `@`, so that user is created as `fernando.roca`.
The same works with `SOCIAL_AUTH_OIDC_USERNAME_KEY` set to `email`. When the
claim is missing, the user gets a random username.

This only shapes accounts as they are created. An existing account is found by
the provider's `sub` claim, not by name, so turning it on later does not rename
anyone and does not split anyone's account in two. Rules match on claims, not on
the username, so they are not affected.

The email is set when the account is created. The first and last name are
updated from the `given_name` and `family_name` claims at every login.

When the username a new user would get is already taken, Ascender adds a random
suffix to it. With `SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS` on (**Settings >
Miscellaneous Authentication**), that first login fails instead. The user sees
a message with the request ID of the failed sign-in. The same ID is on the
warning logged for the refusal (logger `ascender.sso.social_base_pipeline`),
with the blocking account and the incoming identity, and in the failed
request's `X-API-Request-Id` header. A login whose email matches exactly one
existing account skips the username check, since it would link to that
account rather than create one (whether it may is decided as described
below); one whose email matches several accounts is refused. Entra ID is the
exception: it never links a first login by email, so the email part of the
check is skipped for it and only the username is checked.

> **Note:** these username checks ignore case: `Alice` counts as taken when
> `alice` exists. The old application compared usernames exactly, which let an
> SSO login create `Alice` beside an LDAP user `alice`, who could then no
> longer log in.

## Linking to existing accounts

On a first login (no account has this `sub` yet), Ascender looks for an active
account with the same email, ignoring case, and links the identity to it only
when all of these hold:

* exactly one account has that email;
* the account is not a superuser or system auditor;
* the account has no usable password, so it is not an ordinary local account;
* the account is not already linked to another login (LDAP, SAML or another
  social or OIDC provider);
* the provider does not say the email is unverified (`email_verified` false in
  the userinfo response or the ID token).

What this is for is an account an administrator created without a password
for someone before their first login. When an account with that email exists but cannot be
linked, the login is refused rather than given a second account; the user sees
"Sign-in could not be completed" and the log says `The given email address is
associated with another account`. To let that person in, clear or change the
email on the existing account, or link the provider from that account's own
session: a login through `/sso/login/oidc/` started by a browser that is
already signed in to Ascender links the identity to the signed-in account
(the UI has no button for this).

> **Note:** the old application linked a first login to any account with the
> same email, local accounts and superusers included. Ascender only links the
> accounts listed above, since the email is only what the provider says.

`RESTRICT_USER_IDENTITY_TO_SUPERUSERS` (**Settings > System**) is off by
default. Turned on, only superusers can set the email of a new user or change
the email or username of any user, their own included
(`superuserOnlyIdentity` in `src/internal/api/users.go`); anyone else gets
`Only a superuser can change the username of a user.` (or `email`, or `Only a
superuser can set the email of a user.`). That keeps organization
administrators from renaming or re-addressing an account to match a map entry
or a username list, and it is what makes the username lists of
`SOCIAL_AUTH_OIDC_USER_FLAGS` and `SOCIAL_AUTH_ENTRA_ID_USER_FLAGS` trustworthy
(see [Superusers and system auditors](#superusers-and-system-auditors)).

## Who can log in

By default anyone the provider authenticates gets an account the first time
they log in. `SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS` narrows that down to the users a
rule matches:

```json
{"groups": {"has_or": ["ascender-users", "ascender-admins"]}}
```

A user the rule does not match is refused before an account is created for them,
and an existing user who stops matching can no longer log in through OIDC. The
rule uses the same trigger syntax as the maps below. A rule that cannot be
evaluated, including a value that is not a JSON object and a rule on groups
for a user whose groups are not known, refuses everyone it is evaluated for,
since letting everyone in because of a typo is the worse way to fail. The API refuses a malformed rule when it is
saved, so that only happens with a rule written into the settings file
(`ASCENDER_SETTINGS_FILE`).

## Organizations and teams

`SOCIAL_AUTH_OIDC_ORGANIZATION_MAP` and `SOCIAL_AUTH_OIDC_TEAM_MAP` work like the
shared social auth maps, with usernames, emails and regular expressions, and on
top of that accept trigger rules that match on the user's groups and claims. They
are evaluated at every login, so a change at the provider shows up the next time
the user logs in. Organizations and teams the maps name are created if they do
not exist.

```json
{
  "Default": {
    "triggers_admins": {"groups": {"has_or": ["ascender-admins"]}},
    "triggers_users": {"groups": {"has_or": ["ascender-users"]}},
    "remove_admins": true,
    "remove_users": true
  }
}
```

```json
{
  "Network Operators": {
    "organization": "Default",
    "triggers": {"groups": {"has_or": ["netops"]}},
    "remove": true
  },
  "Auditors from Finance": {
    "organization": "Default",
    "triggers": {
      "attributes": {
        "join_condition": "and",
        "department": {"equals": "Finance"},
        "email_verified": {"equals": "true"}
      }
    }
  }
}
```

The trigger syntax, and how a rule and the older `users` and `admins`
expressions combine, are the same as for LDAP and are described in
[the LDAP document](ldap.md#trigger-rules). The differences are that the groups
are whatever the groups claim holds rather than directory DNs, and the
attributes are the claims. Nested claims can be matched by their dotted path,
and boolean claims are compared as `"true"` and `"false"`.

When an OIDC map is not set, OIDC logins use the shared
`SOCIAL_AUTH_ORGANIZATION_MAP` or `SOCIAL_AUTH_TEAM_MAP` instead, which is what
they did before these settings existed. Once an OIDC map is set, even to `{}`,
the shared one no longer applies to OIDC.

## Superusers and system auditors

`SOCIAL_AUTH_OIDC_USER_FLAGS` hands out the two system wide flags. Each flag
can be driven by a trigger rule, by a list of usernames, or by both:

```json
{
  "triggers_superuser": {"groups": {"has_or": ["ascender-superusers"]}},
  "is_superuser": ["fernando.roca"],
  "triggers_system_auditor": {"groups": {"has_or": ["ascender-auditors"]}},
  "is_system_auditor": ["auditor"],
  "remove_superusers": true,
  "remove_system_auditors": true
}
```

When both are given for a flag, the trigger rule is evaluated first and the
usernames can grant a user the rule says nothing about, the same precedence the
organization and team maps use. Only a list without a rule revokes the users it
does not name; with a rule, an explicit deny revokes regardless of the `remove_`
key, which only keeps a rule that skips a user from revoking. `is_superuser` and
`is_system_auditor` are lists of usernames, the Ascender usernames, and are
matched exactly and case-sensitively; they do not take the booleans,
emails or regular expressions the organization and team maps do. Every entry
must be a non-blank string; surrounding whitespace is trimmed and duplicate
names are ignored. A bare string is not a list, so write the value as a JSON
array even for one username. Use the trigger rules for matching on the
provider's claims. The API rejects a value that is not an array of non-blank
strings, but a value written into the settings file is only checked to be an
object: at login, non-list values and blank or non-string entries are ignored
with a warning, and the list is evaluated from the names that remain.

A flag with neither a rule nor a username list is left alone. A list with no
rule is authoritative: a user it does not name loses the flag at their next
login unless the matching `remove_` key is false. An empty list is ignored with
a warning, like `null`, so a list that ends up empty by mistake cannot strip the
flag from every user. To deliberately revoke a flag from everyone, use a trigger
rule that denies everyone:

```json
{"triggers_superuser": {"never": {}}}
```

This revokes the flag at each user's next login whatever the `remove_` key says,
and it overrides any username list for that flag. With a trigger rule, the list never
revokes: a user the rule skips is still handled by the rule's own `remove_` key,
and when the rule cannot be evaluated, listed users are still granted while
everyone else is left alone. An empty rule (`{}`) is treated as no rule, so a
username list alongside it decides by itself. A list that contains only blank
or non-string entries is ignored with a warning rather than treated as an empty
list. Each flag is handled independently, so this decides `is_superuser` and
`is_system_auditor` separately.

Usernames are the Ascender usernames, which
`SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN` may have shortened to the part before
the `@` when the account was created, and an existing account keeps the name it
had. List a user by the name Ascender shows, not by the claim the provider
sent.

The lists are only honored while `RESTRICT_USER_IDENTITY_TO_SUPERUSERS` is on.
When it is off, Ascender ignores them with a warning, because an organization
administrator could otherwise rename their own or another account, or create a
local user, to take a listed name and the flags that come with it. This applies
to Entra ID as well. Trigger rules still work. Even with the setting on, a
username only says which Ascender account it is, not that the provider vouches
for it: treat the lists as a convenience rather than a proof of identity, and
for a grant that has to
follow an immutable identifier, use a trigger rule on the provider's `sub`
claim or on a group instead.

Keep a local superuser that does not log in through OIDC. A first login is
never linked by email to a superuser, but an account that is linked to OIDC
has its flags follow the rules at every login like any other.

## Logging out of the provider

Logging out of Ascender only ends the Ascender session. The provider's session
stays open, so the next visit logs the user straight back in. Turn on
`SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP` to end that one too: when a user who logged
in through OIDC logs out, the browser is sent to the provider's
`end_session_endpoint`, with the client ID, the user's ID token as a hint and
`SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL` as where to come back to. When that
is blank, it is `ASCENDER_URL_BASE`, or, when the base URL was never set, the
address the logout was asked from. That URL has to be registered at the
provider as a valid post logout redirect URI.

Ending the provider session usually logs the user out of every other
application that uses it, which is why this is off by default. A session that
times out for inactivity is only ended in Ascender, never at the provider.

For API clients nothing changes unless the option is on and the session came
from an OIDC login. In that case `POST /api/logout/` answers a request that
accepts HTML with a redirect to the provider, and any other request with
`{"logout_url": "..."}`, the address the client should send the browser to.

Turning the OIDC login off (clearing the client ID, secret or provider URL)
ends the sessions it started: they are no longer accepted.

## Keycloak

1. Create an OpenID Connect client with client authentication on, and add the
   callback URL to its valid redirect URIs and the base URL to its valid post
   logout redirect URIs.
2. To use groups, add a *Group Membership* mapper to the client's dedicated
   scope, with the token claim name `groups` and *Full group path* off. To use
   realm roles instead, set `SOCIAL_AUTH_OIDC_GROUPS_CLAIM` to
   `realm_access.roles`.
3. Set the provider URL to `https://<keycloak>/realms/<realm>`.

## Entra ID

Entra ID has a login of its own now, described in [entra_id.md](entra_id.md),
which takes care of the tenant, the cloud and app roles for you. Going through
generic OIDC still works:

1. Register an application with a web redirect URI pointing at the callback URL,
   and create a client secret.
2. Under *Token configuration*, add a groups claim. Entra ID sends group object
   IDs by default, so the rules have to name those IDs rather than group names.
3. Set the provider URL to `https://login.microsoftonline.com/<tenant id>/v2.0`.

## Dex

1. Add a static client with the callback URL among its `redirectURIs`.
2. Dex only sends groups to clients that ask for them, so set
   `SOCIAL_AUTH_OIDC_SCOPE` to `["groups"]`. Without it the token carries no
   groups claim and every rule on groups is ignored.
3. Dex does not send `preferred_username` unless the connector is told where to
   take it from (`preferredUsernameAttr` on the LDAP connector's user search).
   Without it new users get a random username, so either set that attribute
   or set `SOCIAL_AUTH_OIDC_USERNAME_KEY` to `email`, together with
   `SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN` if the short name is wanted.
4. Dex has no `end_session_endpoint`, so with
   `SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP` on, logging out still only ends the
   Ascender session.
