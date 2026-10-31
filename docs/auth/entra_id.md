# Microsoft Entra ID

Microsoft Entra ID is what Azure Active Directory has been called since 2023.
Same product, same tenants and app registrations, new name. Ascender has a
login of its own for it, under **Settings > Microsoft Entra ID (Azure AD) >
Microsoft Entra ID**, and all its settings start with `SOCIAL_AUTH_ENTRA_ID_`.

The two older Azure AD logins are still there, now marked as legacy, so nothing
breaks for anyone who uses them. They talk to the v1 endpoints and can only map
users to organizations and teams by username or email. The Entra ID login is
the one to pick for a new setup:

* it uses the v2.0 endpoints, and only ever of the one tenant you give it
* it knows a user by their object ID (`oid`), which never changes and is never
  handed to someone else, instead of a name that can be
* it can map users from their groups, their app roles or any other claim, the
  same way generic OIDC does (see [oidc.md](oidc.md))
* it can read the groups from Microsoft Graph, with no limit on how many
* it has a login rule, superuser and auditor flags, can strip the domain off
  usernames and can log the user out of Microsoft too
* it works in the sovereign clouds and in External ID tenants
* the client secret is optional with Azure Workload Identity, like the legacy
  logins

## Registering the application

1. In the Entra admin center, under *App registrations*, register a new
   application for accounts in this organizational directory only.
2. Add a *Web* redirect URI with the value of `SOCIAL_AUTH_ENTRA_ID_CALLBACK_URL`,
   which is `<base url>/sso/complete/entra-id/`. If you are going to log users
   out of Microsoft too, add the base URL of Ascender as well (see below).
3. Create a client secret under *Certificates & secrets*, or set up a federated
   credential if Ascender runs with Azure Workload Identity.
4. To use groups, add a groups claim under *Token configuration* (more on that
   below).

Then fill in:

| Setting | What it is |
|---|---|
| `SOCIAL_AUTH_ENTRA_ID_KEY` | the Application (client) ID |
| `SOCIAL_AUTH_ENTRA_ID_SECRET` | the client secret, blank with Workload Identity |
| `SOCIAL_AUTH_ENTRA_ID_TENANT_ID` | the Directory (tenant) ID, or a domain of the tenant such as `contoso.onmicrosoft.com` |
| `SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST` | the sign in host of the cloud the tenant lives in, `login.microsoftonline.com` by default |

The login shows up on the login page once the client ID, the tenant and either
the secret or a Workload Identity token are there.

`common`, `organizations` and `consumers` are not accepted as the tenant. With
any of them a token from any directory in the world would pass, and this login is
meant for the users of your tenant.

### Authority host

| Cloud | Authority host |
|---|---|
| Public | `login.microsoftonline.com` |
| Azure Government | `login.microsoftonline.us` |
| Azure operated by 21Vianet (China) | `login.partner.microsoftonline.cn` |
| External ID (customer) tenant | `<subdomain>.ciamlogin.com` |

Only the host goes there, no `https://` and no path.

## Usernames and emails

A new user's username comes from the claim named by
`SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY`, `preferred_username` by default, which in
Entra is the user principal name, such as `fernando.roca@contoso.com`. Turn on
`SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN` to keep only `fernando.roca`. Any
claim the ID token carries can be used instead, for example `samaccountname` if
you add it as an optional claim. If the claim is missing, the user principal name
is used.

The email is the `email` claim, which Entra only sends for users with a mailbox,
or else the user principal name when it looks like an address.

Whatever the username ends up being, the account is linked to the user's object
ID. Renaming someone in Entra, or changing their UPN, does not give them a new
account, and a UPN that is later given to another person does not open the old
one.

Unlike the other logins, Entra ID never links a first login to an existing
account by email. Entra does not verify the `email` claim: anyone who can edit a
user's mail attribute can put any address there, and a UPN, with the address
that goes with it, is often given to someone else once its owner leaves.
Linking by it would let that person into whichever Ascender account has the
address, a local superuser included. The only accounts an Entra ID login takes
over are those of the legacy Azure AD logins, and only when they belong to the
same person (see [Moving from the Azure AD logins](#moving-from-the-azure-ad-logins)).

## Groups and app roles

Entra only puts groups in the token once you ask for them, under *Token
configuration > Add groups claim*. A few things to know:

* By default groups come as object IDs, so the rules have to use those IDs:
  `{"groups": {"has_or": ["9f1b7c2e-..."]}}`. For groups synced from on-premises
  AD you can choose `sAMAccountName` instead and use names, since those are
  unique and only change in AD.
* A token only fits 200 groups. A user in more than that gets no groups at all
  and a pointer to Microsoft Graph instead. Ascender does not treat that as "no
  groups": every rule on groups is skipped for that user, so the login rule
  refuses them and maps and flags leave their roles alone. To avoid it, choose
  *Groups assigned to the application* in the groups claim and assign only the
  groups that matter to the app, or read the groups from Graph (below).
* App roles are often the cleaner option. Define roles such as
  `Ascender.Admin` and `Ascender.User` in the app registration, assign them to
  users or groups under *Enterprise applications*, and set
  `SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM` to `roles`. They always come by name and
  never overflow.

### Reading the groups from Microsoft Graph

The other way around both problems is to not take the groups from the token at
all. Turn on `SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH` and, at every login,
Ascender asks Microsoft Graph for the user's groups
(`/me/transitiveMemberOf`, every page of it) with the access token of that
login. What you get:

* no limit on how many groups
* nested groups too, since the membership is transitive
* no groups claim to set up in the token configuration

Those groups go in the `groups` claim by their object IDs, replacing whatever the
token had there, so leave `SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM` at `groups` and
write the rules with the IDs: `{"groups": {"has_or": ["9f1b7c2e-..."]}}`.

Display names are left out on purpose. They are not unique, and in a tenant with
the default settings any user can create a group, give it the name of your admin
group and add themselves to it. A rule on the name would make them an admin. If
you would rather write rules with names, use app roles: only admins can assign
them.

What it needs:

* the delegated Microsoft Graph permission `GroupMember.Read.All` on the app
  registration, under *API permissions*, with admin consent. Ascender asks for
  it at login, so without the consent users get a consent screen they cannot
  get past.
* Ascender has to reach Graph. The host comes from the authority host
  (`graph.microsoft.com`, `graph.microsoft.us` or
  `microsoftgraph.chinacloudapi.cn`); set `SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST` for
  any other, such as `dod-graph.microsoft.us`.

Asking only for groups is what Graph calls an advanced query, which it answers
from an index that can be a few minutes behind. Someone just added to a group
may need a few minutes before a new login picks it up.

If Graph cannot be asked at login, because it is down, the consent is missing
or it answers something odd, the user's groups are treated as unknown, the same
as with an overflowing token: the login rule refuses them and maps and flags on
groups leave their roles alone. The token's own groups are not used as a fallback,
since they may be only part of the list. The reason is in the log.

`SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM` picks which claim the `groups` part of a rule
looks at. Any other claim, `roles` included, can still be matched as an
attribute, so a rule can use both groups and roles.

## Who can log in, organizations, teams and flags

These work exactly as for generic OIDC, see [oidc.md](oidc.md):

* `SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS`, the rule a user has to match to log in
  at all
* `SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP` and `SOCIAL_AUTH_ENTRA_ID_TEAM_MAP`,
  with `triggers_admins`, `triggers_users` and `triggers` on top of the usual
  username and email expressions
* `SOCIAL_AUTH_ENTRA_ID_USER_FLAGS`, for superusers and system auditors

For example, with app roles:

```json
{
  "Default": {
    "triggers_admins": {"groups": {"has_or": ["Ascender.Admin"]}},
    "triggers_users": {"groups": {"has_or": ["Ascender.User", "Ascender.Admin"]}},
    "remove_admins": true,
    "remove_users": true
  }
}
```

One difference with generic OIDC: when the Entra ID maps are not set, the shared
`SOCIAL_AUTH_ORGANIZATION_MAP` and `SOCIAL_AUTH_TEAM_MAP` do not apply either.
Generic OIDC only falls back to them so configurations written before it had maps
of its own keep working, and Entra ID has no such history.

## Logging out of Microsoft

With `SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP` on, logging out of Ascender also ends
the user's Microsoft session, which logs them out of every other application
that uses it. Entra only sends the browser back to
`SOCIAL_AUTH_ENTRA_ID_POST_LOGOUT_REDIRECT_URL` (the base URL of Ascender unless
set) if that address is one of the redirect URIs of the app registration. A
session that times out for inactivity is only ended in Ascender.

## Moving from the Azure AD logins

The Entra ID login has its own callback URL, settings and identities, so it can
run next to an Azure AD one while you move over:

1. Add the new callback URL to the existing app registration, or register a new
   one.
2. Fill in the Entra ID settings and move the maps over, now with rules on groups
   or roles where you need them.
3. Log in with the new button. An Azure AD account is taken over by the first
   Entra ID login of the same person, which Ascender knows by the object ID and
   tenant in the ID token it kept from that account's last Azure AD login, so a
   reused UPN or address never gets someone else's account.
4. Once everyone is on it, clear the client ID of the Azure AD login so its
   button goes away.

Anyone who cannot be matched that way gets a new account on their first Entra
ID login: local accounts, Azure AD accounts with no ID token kept, or ones whose
UPN has changed since. Grant the new account what the old one had, or let the
maps do it, and remove the old one.
