# Authentication

This folder describes how users sign in to Ascender: with a password checked
against an LDAP directory or Ascender's own accounts, or through an external
identity provider (OAuth2, OpenID Connect or SAML). It also covers browser
sessions and OAuth2 tokens.

* [LDAP](ldap.md)
* [SAML](saml.md)
* [Generic OpenID Connect (OIDC)](oidc.md)
* [Microsoft Entra ID](entra_id.md)
* [Sessions](session.md)
* [OAuth2 tokens](oauth.md)

RADIUS and TACACS+ logins are not supported.


## Password logins

The login page, `POST /api/login/` and HTTP Basic authentication (when
`AUTH_BASIC_ENABLED` is on) all take a username and password and check them
the same way (`authenticatePassword` in `src/internal/api/sso_ldap.go`):

1. The LDAP servers, in order: the default server (`AUTH_LDAP_*`), then
   servers 1 to 5 (`AUTH_LDAP_1_*` to `AUTH_LDAP_5_*`). A server takes part
   only when its `SERVER_URI` is set.
2. Ascender's own accounts, unless `DISABLE_LOCAL_AUTH` is on.

The first method that accepts the username and password signs the user in.
A server that does not find the user, refuses the password, or cannot be
reached or used (the error is logged) passes the login on to the next one.

Each login, and each failed one, is logged with the user name and the
client's address: the first address among the `REMOTE_HOST_HEADERS` (the
custom `HTTP_` ones only from a `PROXY_IP_ALLOWED_LIST` proxy when that list
is set), or the connection's own address when none gives one, so a login
through a proxy or ingress names the user's machine and not the proxy.

A username that belongs to a local account (one without an LDAP DN) is never
sent to LDAP; the name is compared without regard to case, so `Admin` cannot
be used to sign in to the local `admin` through a directory. Only the local
password can sign that account in.

The read-only `AUTHENTICATION_BACKENDS` setting lists the methods that are
configured, the same test the logins themselves use: an Azure AD or Entra ID
login whose client secret is replaced by a federated token (workload identity)
is listed.


## Logins through an identity provider

These logins send the browser to the provider and back. The login page shows a
button for each one that is configured; `GET /api/v2/auth/` lists them with
their `login_url`, and with the error of the last failed attempt in this
browser. A login starts with a `POST` of the CSRF token to the `login_url`
(`/sso/login/<backend>/`); a `GET` is refused with 405, so a link or bookmark
cannot start one.

`LOGIN_REDIRECT_OVERRIDE` (Settings > Miscellaneous Authentication) sends a
signed-out visitor of any page other than the login page there instead of to
the login page, when it is a path on this server or an http or https URL. When
it is this server's `/sso/login/<backend>/` (for example
`/sso/login/saml/?idp=corp`), the visitor gets a page that posts the CSRF
token and the page they asked for (`next`) to it at once, so they go straight
to the identity provider and come back to that page. Any other value is a
plain redirect. `/login` itself still shows the login form, so local accounts
can sign in (`protected`, `ssoAutoLogin` in `src/internal/web/web.go`).

* Google OAuth2
* GitHub OAuth2
* GitHub Organization OAuth2
* GitHub Team OAuth2
* GitHub Enterprise OAuth2
* GitHub Enterprise Organization OAuth2
* GitHub Enterprise Team OAuth2
* Microsoft Entra ID, formerly Azure Active Directory, see [entra_id.md](entra_id.md)
* Microsoft Azure Active Directory (AD) OAuth2 (legacy)
* Microsoft Azure Active Directory (AD) Tenant OAuth2 (legacy)
* Generic OpenID Connect (OIDC), see [oidc.md](oidc.md)
* SAML 2.0, see [saml.md](saml.md)

The protocols are in `src/internal/sso` (`oauth.go`, `jwt.go`, `social.go`,
`saml.go`); what a login does with the account is in
`src/internal/api/sso_social.go` and `src/internal/api/sso_saml.go`.


## External accounts

An account that an external login created or is linked to is an external
account. The user API shows its kind in `external_account`:

| `external_account` | Account |
| --- | --- |
| `enterprise` | Created by a SAML login |
| `social` | Linked to an OAuth2 or OIDC login (including Entra ID and Azure AD) |
| `ldap` | Has an LDAP DN and no usable password: created by an LDAP login |
| `null` | A local account |

(`externalAccount` in `src/internal/api/oauth2.go`.) The following rules apply
to external accounts:

* An external account is created by the user's first successful login through
  that method. Before creating one, an OAuth2, OIDC or SAML login may link to
  an existing account whose email address matches what the provider sends,
  but only an account that has no usable password, is neither a system
  administrator nor a system auditor, and is not already linked to LDAP or
  another login; a provider that marks the address as unverified links
  nothing. An account linked this way is `social`, not `enterprise`.
* An LDAP login uses the account whose username matches, without regard to
  case, if it has an LDAP DN; a new one is created with the username in lower
  case.
* When a provider's username is already taken by another account, the new
  account gets the username with 16 random hexadecimal characters added. With
  `SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS` on, the login is refused instead,
  with a request ID that the logs repeat.
* With `SOCIAL_AUTH_USER_FIELDS` set to an empty list, OAuth2, OIDC and SAML
  logins create no accounts: only users whose account is already linked, or
  can be linked by email address as above, can sign in.
* External accounts have no Ascender password. The user API leaves `password`
  out of them, and a password sent when updating one is ignored. This holds
  whether or not the login method is still configured, so an external account
  cannot be turned into a local one through the API.
* The username, and the fields that `AUTH_LDAP_USER_ATTR_MAP` and
  `AUTH_LDAP_USER_FLAGS_BY_GROUP` set, cannot be changed on an LDAP user while
  `AUTH_LDAP_SERVER_URI` is set ("Unable to change ... on user managed by
  LDAP."). Each login sets those fields from the directory again anyway.
* External accounts cannot create OAuth2 tokens unless
  `ALLOW_OAUTH2_FOR_EXTERNAL_USERS` is on.
* With `DISABLE_LOCAL_AUTH` on, external accounts still sign in. Local-only
  accounts cannot: their password and Basic logins are refused, their sessions
  end at their next request, and their OAuth2 tokens stop working.
