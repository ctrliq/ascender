# Generic OIDC

Ascender can log users in through any OpenID Connect provider, such as Keycloak,
Entra ID, Okta, Authentik or Dex. The settings live under **Settings > Generic
OIDC**, and all of them start with `SOCIAL_AUTH_OIDC_`.

## Connecting to the provider

Create a confidential client at the provider and register
`SOCIAL_AUTH_OIDC_CALLBACK_URL` (shown on the settings page, it is
`<base url>/sso/complete/oidc/`) as one of its redirect URIs. Then fill in:

| Setting | What it is |
|---|---|
| `SOCIAL_AUTH_OIDC_KEY` | the client ID |
| `SOCIAL_AUTH_OIDC_SECRET` | the client secret |
| `SOCIAL_AUTH_OIDC_OIDC_ENDPOINT` | the issuer URL, the part before `/.well-known/openid-configuration` |
| `SOCIAL_AUTH_OIDC_VERIFY_SSL` | whether to check the provider's certificate |
| `SOCIAL_AUTH_OIDC_SCOPE` | scopes to ask for on top of `openid`, `profile` and `email` |
| `SOCIAL_AUTH_OIDC_USERNAME_KEY` | the claim a new user's username comes from, `preferred_username` by default |
| `SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN` | keep only the part before the `@` of that claim, off by default |
| `SOCIAL_AUTH_OIDC_GROUPS_CLAIM` | the claim holding the user's groups, `groups` by default |

Everything else the provider needs, such as the authorization, token and
userinfo endpoints and the signing keys, is read from its discovery document.

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
The same works with `SOCIAL_AUTH_OIDC_USERNAME_KEY` set to `email`.

This only shapes accounts as they are created. An existing account is found by
the provider's `sub` claim, not by name, so turning it on later does not rename
anyone and does not split anyone's account in two. Two users whose addresses
differ only in the domain would come out with the same name; the second one to
log in gets a random suffix added to it, as social auth does for any name that
is already taken. Rules match on claims, not on the username, so they are not
affected.

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
evaluated refuses everyone, since letting everyone in because of a typo is the
worse way to fail. The API refuses such a rule when it is saved, so this only
happens with a rule written straight into a settings file.

## Organizations and teams

`SOCIAL_AUTH_OIDC_ORGANIZATION_MAP` and `SOCIAL_AUTH_OIDC_TEAM_MAP` work like the
shared social auth maps, with usernames, emails and regular expressions, and on
top of that accept trigger rules that match on the user's groups and claims. They
are evaluated at every login, so a change at the provider shows up the next time
the user logs in.

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

When neither OIDC map is set, OIDC logins keep using the shared
`SOCIAL_AUTH_ORGANIZATION_MAP` and `SOCIAL_AUTH_TEAM_MAP`, which is what they
did before these settings existed. Once an OIDC map is set, even to `{}`, the
shared one no longer applies to OIDC.

## Superusers and system auditors

`SOCIAL_AUTH_OIDC_USER_FLAGS` hands out the two system wide flags:

```json
{
  "triggers_superuser": {"groups": {"has_or": ["ascender-superusers"]}},
  "triggers_system_auditor": {"groups": {"has_or": ["ascender-auditors"]}},
  "remove_superusers": true,
  "remove_system_auditors": true
}
```

A flag without a rule is left alone. With a rule, a user who matches gets the
flag and a user who does not loses it at their next login, unless the matching
`remove_` key is false.

Keep a local superuser that does not log in through OIDC. The social auth
pipeline links an OIDC identity to an existing account with the same email, and
once linked that account's flags follow the rules like any other.

## Logging out of the provider

Logging out of Ascender only ends the Ascender session. The provider's session
stays open, so the next visit logs the user straight back in. Turn on
`SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP` to end that one too: when a user who logged
in through OIDC logs out, the browser is sent to the provider's
`end_session_endpoint`, with the user's ID token as a hint and
`SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL` (the base URL of Ascender unless set)
as where to come back to (when the base URL was never set, the address the
logout was asked from is used instead). That URL has to be registered at the
provider as a valid post logout redirect URI.

Ending the provider session usually logs the user out of every other
application that uses it, which is why this is off by default. A session that
times out for inactivity is only ended in Ascender, never at the provider.

For API clients nothing changes unless the option is on and the session came
from an OIDC login. In that case `POST /api/logout/` answers a request that
accepts HTML with a redirect to the provider, and any other request with
`{"logout_url": "..."}`, the address the client should send the browser to.

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
