# SAML

Security Assertion Markup Language (SAML) is an open standard for exchanging
authentication and authorization data between an identity provider (IdP),
such as Keycloak, Okta, ADFS or Entra ID, and a service provider (SP), here
Ascender. Ascender can sign users in through one or more SAML 2.0 IdPs,
create their accounts at their first login, and set their organizations,
teams and flags from the attributes the IdP sends.

The protocol (requests, metadata, response validation) is
`src/internal/sso/saml.go`; the login views and what a login does with the
account are `src/internal/api/sso_saml.go` and
`src/internal/api/sso_social.go`.


## Configuring SAML

The settings are under `/api/v2/settings/saml/` and on the SAML settings page
of the UI. SAML is enabled when all of these are set:

| Setting | Meaning |
| --- | --- |
| `SOCIAL_AUTH_SAML_SP_ENTITY_ID` | Ascender's entity ID, the audience the IdP's assertions must name. Usually Ascender's URL. |
| `SOCIAL_AUTH_SAML_SP_PUBLIC_CERT`, `SOCIAL_AUTH_SAML_SP_PRIVATE_KEY` | Ascender's key pair, PEM. Used to sign requests and decrypt assertions when the security settings ask for that, and published in the metadata. |
| `SOCIAL_AUTH_SAML_ORG_INFO` | The organization in the metadata, per language: `{"en-US": {"name": "ascender", "displayname": "Ascender", "url": "https://ascender.example.com"}}`. |
| `SOCIAL_AUTH_SAML_TECHNICAL_CONTACT`, `SOCIAL_AUTH_SAML_SUPPORT_CONTACT` | `{"givenName": "...", "emailAddress": "..."}`. |
| `SOCIAL_AUTH_SAML_ENABLED_IDPS` | The IdPs; see below. |

Two read-only settings give the addresses to register with the IdP:
`SOCIAL_AUTH_SAML_CALLBACK_URL`, the Assertion Consumer Service (ACS) URL
`/sso/complete/saml/`, and `SOCIAL_AUTH_SAML_METADATA_URL`, the SP metadata at
`/sso/metadata/saml/`. The ACS URL that requests carry, and that responses are
checked against, is built from the address the browser used: the `Host`
header, and `https` when the connection is TLS or a proxy sends
`X-Forwarded-Proto: https`. A proxy in front of Ascender must pass the `Host`
header through.

### Identity providers

`SOCIAL_AUTH_SAML_ENABLED_IDPS` maps a name for each IdP to its settings. The
name must be a short slug (no spaces or colons); it is how logins and user IDs
refer to the IdP.

```json
{
  "keycloak": {
    "entity_id": "https://idp.example.com/realms/example",
    "url": "https://idp.example.com/realms/example/protocol/saml",
    "x509cert": "MIIC...",
    "attr_user_permanent_id": "name_id",
    "attr_username": "username",
    "attr_email": "email",
    "attr_first_name": "first_name",
    "attr_last_name": "last_name",
    "label": "Example SSO"
  }
}
```

| Key | Meaning |
| --- | --- |
| `entity_id` | The IdP's entity ID; responses and assertions must be issued by it. |
| `url` | The IdP's single sign-on URL (HTTP-Redirect binding). |
| `x509cert` | The IdP's signing certificate. For a key rollover, `x509certMulti` with `{"signing": [cert, ...]}` adds more; a signature by any of them is accepted. |
| `attr_user_permanent_id` | The attribute that identifies the user permanently; default the `urn:oid:0.9.2342.19200300.100.1.1` attribute, else the NameID. A login without it fails. |
| `attr_username`, `attr_email`, `attr_first_name`, `attr_last_name`, `attr_full_name` | The attributes for the account's details; see [User details](#user-details). |
| `label` | The text of the IdP's login button. |

The login page shows a button for each IdP; `GET /api/v2/auth/` lists each as
`saml:<name>` with its `login_url`, `/sso/login/saml/?idp=<name>`.

### SP metadata

`GET /sso/metadata/saml/` returns the SP metadata as XML: the entity ID, the
ACS URL (HTTP-POST binding), the NameID format, the certificate, the
organization and the contacts. When SAML is not enabled,
or the settings are incomplete, it returns the reason as plain text instead.

Signing the metadata (`signMetadata`) is not supported: with it on, the
metadata URL returns "signing the SP metadata is not supported".

### Security settings

`SOCIAL_AUTH_SAML_SECURITY_CONFIG` takes the keys python3-saml's `security`
settings took. These have an effect:

| Key | Default | Effect |
| --- | --- | --- |
| `authnRequestsSigned` | `false` | Sign the authentication request (the signature goes in the redirect URL). |
| `signatureAlgorithm` | RSA-SHA256 | The request signature's algorithm: RSA with SHA-1, SHA-256, SHA-384 or SHA-512. |
| `wantAssertionsSigned` | `false` | The assertion must be signed. |
| `wantMessagesSigned` | `false` | The response must be signed. |
| `wantAssertionsEncrypted` | `false` | The assertion must be encrypted (to the SP certificate). |
| `wantNameIdEncrypted` | `false` | The NameID must be encrypted; the request asks for an encrypted NameID. |
| `wantNameId` | `true` | The assertion must carry a non-empty NameID. |
| `wantAttributeStatement` | `true` | The assertion must carry an `AttributeStatement`. |
| `requestedAuthnContext` | `true` | `true` asks for `PasswordProtectedTransport`; a list asks for those classes; `false` asks for none. The setting's default value, `{"requestedAuthnContext": false}`, turns it off; a value that leaves the key out turns it back on. |
| `requestedAuthnContextComparison` | `exact` | The comparison the request asks for. |
| `failOnAuthnContextMismatch` | `false` | Refuse an assertion whose authentication context is not one of the requested list. |
| `rejectDeprecatedAlgorithm` | `false` | Refuse signatures and digests that use SHA-1. |
| `allowRepeatAttributeName` | `false` | Accept an attribute that appears more than once (its values are joined). |
| `allowSingleLabelDomains` | `false` | Accept URLs whose host has no dot. |
| `metadataValidUntil`, `metadataCacheDuration` | none, `P10D` | The metadata's `validUntil` and `cacheDuration`. |

`nameIdEncrypted`, `logoutRequestSigned` and `logoutResponseSigned` only make
the settings check require the matching certificate; Ascender sends no
encrypted NameIDs and no logout messages. `signMetadata` is not supported
(above), and `digestAlgorithm` is not used.

`SOCIAL_AUTH_SAML_SP_EXTRA` takes the keys of python3-saml's `sp` settings.
Only these are used: `NameIDFormat` (default
`urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`),
`assertionConsumerService` (`url` and `binding`, replacing the ACS URL that
requests and the metadata give), and `attributeConsumingService`. The
service's `index` (default `1`) is put in the request, and the metadata
describes it as python3-saml did: an `AttributeConsumingService` element with
`serviceName`, `serviceDescription` (when given) and a `RequestedAttribute` for
each entry of `requestedAttributes` (`name`, and when set `nameFormat`,
`friendlyName`, `isRequired` and `attributeValue`). A service without a
`serviceName` or `requestedAttributes`, or with an attribute without a `name`,
is refused when the settings are checked.


## How a login works

1. The login button posts the CSRF token and `idp=<name>` to
   `/sso/login/saml/`. A `GET` of that URL is refused, so a link or bookmark
   cannot start a login.
2. Ascender redirects the browser to the IdP's `url` with an authentication
   request (HTTP-Redirect binding). The `RelayState` carries the IdP's name,
   where to go after the login, and a sealed reference to the browser's
   session.
3. The IdP posts its response to the ACS URL (HTTP-POST binding; other
   bindings are not supported). Ascender validates it (see below), finds or
   creates the account, and signs the browser in.

The login is also bound to the browser that started it: a cookie named after
the session cookie with `_saml` added (`ascender_sessionid_saml` by default)
is set when the login starts, and a response that comes back to a browser
without it is refused ("the login was not started in this browser"). The
login must finish within an hour: a response to a login started longer ago
is refused, and the login page says that the login took too long and has
expired, so the user signs in again. (An IdP-initiated response, which answers
no login started here, is not affected.) The cookie has to be `SameSite=None`, which
browsers allow only on Secure cookies, so there is no such check when cookies
are not Secure (`ASCENDER_SESSION_COOKIE_SECURE` off, as it is when
`ASCENDER_MODE` is `development`).

A session made by a SAML login lasts only while SAML is enabled: when one of
the settings that enable it is cleared, the session ends at the user's next
request.

### IdP-initiated logins

A response that answers no request from Ascender (IdP-initiated sign-on) is
accepted by default, unless the browser is already signed in. Starting the web
server with `ASCENDER_SAML_REJECT_UNSOLICITED` on refuses them: a response is
then accepted only when its `InResponseTo` names the request this browser
sent and a signature covers it (the response is signed, or the signed
assertion's subject confirmation names the same request). Another site can
post a captured IdP-initiated response to sign a browser in as someone else,
so turn this on when the IdP does not need IdP-initiated logins.

Each assertion signs in once: its ID is remembered, in the
`ascender_saml_assertion` table, until the assertion expires (a day when it
gives no expiry), and an assertion posted again is refused ("the assertion
has already been used").

### Response validation

A response is refused unless:

* it is SAML 2.0, has an ID, and its status is `Success`;
* it contains exactly one assertion, decrypted with the SP private key when
  it is encrypted;
* the response, the assertion, or both are signed, and each signature
  verifies against the IdP's `x509cert` (or one of `x509certMulti`'s signing
  certificates). Certificates in the signature's `KeyInfo` are ignored, and
  the IdP certificate's validity dates are not checked;
* `InResponseTo`, when present, names the request this browser sent;
* the assertion's `Conditions` are current (`NotBefore`, `NotOnOrAfter`,
  with five minutes of clock drift allowed), its `AudienceRestriction`, if
  any, includes `SOCIAL_AUTH_SAML_SP_ENTITY_ID`, and the response's and
  assertion's issuers are the IdP's `entity_id`;
* the `Destination`, when present, is the ACS URL the response arrived at;
* the assertion has exactly one `AuthnStatement`, whose `SessionNotOnOrAfter`
  has not passed;
* a bearer `SubjectConfirmation` is current and, when it names a recipient,
  names this ACS URL;
* the security settings above are met.

The response is not validated against the SAML XML schema. Encrypted
attributes (`EncryptedAttribute`) are refused. Single logout is not
supported: logging out of Ascender does not end the IdP session, and the
IdP's `slo_url` is only checked to be a URL.


## User details

The account's details come from the assertion's attributes, read by their
`Name`. Each `attr_*` key of the IdP's settings names the attribute to use;
without one, the first of these that the assertion has is used:

| Key | Default attributes, in order |
| --- | --- |
| `attr_user_permanent_id` | `urn:oid:0.9.2342.19200300.100.1.1`, `name_id` (the NameID) |
| `attr_username` | `urn:oid:0.9.2342.19200300.100.1.1`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name`, `subjectNameID`, `username` |
| `attr_email` | `urn:oid:0.9.2342.19200300.100.1.3`, `http://schemas.xmlsoap.org/claims/EmailAddress`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`, `email`, `mail` |
| `attr_first_name` | `urn:oid:2.5.4.42`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`, `first_name`, `firstname`, `firstName`, `given_name`, `givenname`, `givenName` |
| `attr_last_name` | `urn:oid:2.5.4.4`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`, `last_name`, `lastname`, `lastName`, `surname` |
| `attr_full_name` | `urn:oid:2.5.4.3`, `http://schemas.xmlsoap.org/claims/CommonName`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/fullname`, `http://schemas.microsoft.com/identity/claims/displayname`, `full_name`, `fullname`, `fullName` |

The first value of the attribute is used. A username, email or name that
cannot be found is logged as a warning naming the setting to fix.

The user is identified by `<idp name>:<permanent id>`. At the first login an
account is created with the username (or the email, when
`SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL` is on; a random name when there is
neither), less any characters other than ASCII letters, digits and
`@.+-_`, and with the email, and is recorded as an enterprise account; it may
instead be linked to an existing account by email address. The first and last
names are updated at every login; the email is not. The rules for usernames that are taken, linking
by email, and passwords are in [External accounts](README.md#external-accounts).

`SOCIAL_AUTH_SAML_EXTRA_DATA` lists attributes to keep with the user's SAML
link (`social_auth_usersocialauth.extra_data`): an attribute name, or
`[name, alias]`, or `[name, alias, discard_if_empty]`. Each kept attribute is
its list of values. The NameID and session index are always kept.


## Organization and team membership

Every SAML login sets the user's organization roles and team memberships from
four settings, in this order, and then creates the organizations and teams
they name that do not exist yet (a new organization gets the managed Ansible
Galaxy credential).

**The defaults take membership over.** With
`SOCIAL_AUTH_SAML_ORGANIZATION_ATTR` empty, its `remove`, `remove_admins` and
`remove_auditors` default to true, so each SAML login removes the user from
the member, admin and auditor roles of every organization that the settings
below do not grant. Set them to `false` to keep roles granted in Ascender.

### Organizations from an attribute

`SOCIAL_AUTH_SAML_ORGANIZATION_ATTR` names the attributes that list
organization names. For this assertion:

```xml
<saml2:AttributeStatement>
  <saml2:Attribute Name="member-of" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
    <saml2:AttributeValue>Engineering</saml2:AttributeValue>
    <saml2:AttributeValue>IT</saml2:AttributeValue>
    <saml2:AttributeValue>HR</saml2:AttributeValue>
    <saml2:AttributeValue>Sales</saml2:AttributeValue>
  </saml2:Attribute>
  <saml2:Attribute Name="administrator-of" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
    <saml2:AttributeValue>IT</saml2:AttributeValue>
    <saml2:AttributeValue>HR</saml2:AttributeValue>
  </saml2:Attribute>
</saml2:AttributeStatement>
```

the setting would be:

```json
{
  "saml_attr": "member-of",
  "saml_admin_attr": "administrator-of",
  "remove": true,
  "remove_admins": true
}
```

| Key | Meaning |
| --- | --- |
| `saml_attr` | The attribute listing the organizations the user is a member of. |
| `saml_admin_attr` | The attribute listing the organizations the user administers. |
| `saml_auditor_attr` | The attribute listing the organizations the user audits. |
| `remove` | `true` (the default): remove the user from the member role of every organization the attribute does not list. `false`: only add. |
| `remove_admins` | The same for the admin role. |
| `remove_auditors` | The same for the auditor role. |

When an entry of `SOCIAL_AUTH_SAML_ORGANIZATION_MAP` (below) named after a
listed organization has an `organization_alias`, the alias is used instead.

### Teams from an attribute

`SOCIAL_AUTH_SAML_TEAM_ATTR` names the attribute that lists team names. Team
names are unique only within an organization, so `team_org_map` says which
organization each team is in; teams it does not list are ignored.

```xml
<saml:AttributeStatement>
  <saml:Attribute NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
      Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.1" FriendlyName="eduPersonAffiliation">
    <saml:AttributeValue xsi:type="xs:string">member</saml:AttributeValue>
    <saml:AttributeValue xsi:type="xs:string">staff</saml:AttributeValue>
  </saml:Attribute>
</saml:AttributeStatement>
```

```json
{
  "saml_attr": "urn:oid:1.3.6.1.4.1.5923.1.1.1.1",
  "remove": true,
  "team_org_map": [
    {"team": "member", "organization": "Default1"},
    {"team": "staff", "team_alias": "Staff", "organization": "Default2"}
  ]
}
```

Attributes are found by `Name`, not `FriendlyName`, so `saml_attr` is the
attribute's `Name`.

| Key | Meaning |
| --- | --- |
| `saml_attr` | The attribute listing the user's teams. Nothing happens without it. |
| `team_org_map` | `{"team": ..., "organization": ...}` for each team, with an optional `team_alias`: the name of the Ascender team when it differs from the name in the attribute. |
| `remove` | `true` (the default): remove the user from every team in Ascender before adding the listed ones. `false`: leave teams outside `team_org_map` alone. A team in `team_org_map` that the attribute does not list is removed either way. |

### Organization and team maps

`SOCIAL_AUTH_SAML_ORGANIZATION_MAP` and `SOCIAL_AUTH_SAML_TEAM_MAP` (when
unset, `SOCIAL_AUTH_ORGANIZATION_MAP` and `SOCIAL_AUTH_TEAM_MAP`) decide roles
by the user's username and email. An organization entry has `admins`, `users`
and `auditors`; a team entry has `organization` and `users`. Each takes `true`
(everyone), a username or email, a `/regular expression/flags` matched against
both, or a list of these. A role the expression does not grant is removed when
`remove` (or `remove_admins`, `remove_users`, `remove_auditors`) is true, the
default, including when the key is left out. `organization_alias` names the
Ascender organization when it differs from the entry's name.

A role that the attribute mappings granted is not taken away by the
organization map.

### Creating organizations and teams

With `SAML_AUTO_CREATE_OBJECTS` on (the default), the organizations and teams
that the attributes and maps name are created when they do not exist. With it
off nothing is created: the maps still grant and remove roles in the
organizations and teams that exist, and pass over the ones that do not.


## User flags

`SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR` sets the system administrator
(`is_superuser`) and system auditor (`is_system_auditor`) flags at every
login. For this assertion:

```xml
<saml2:AttributeStatement>
  <saml2:Attribute Name="is_system_auditor" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
    <saml2:AttributeValue>Auditor</saml2:AttributeValue>
  </saml2:Attribute>
  <saml2:Attribute Name="is_superuser" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
    <saml2:AttributeValue>IT-Superadmin</saml2:AttributeValue>
  </saml2:Attribute>
</saml2:AttributeStatement>
```

the setting could be:

```json
{
  "is_superuser_role": ["ascender_admins"],
  "is_superuser_attr": "is_superuser",
  "is_superuser_value": ["IT-Superadmin"],
  "is_system_auditor_role": ["ascender_auditors"],
  "is_system_auditor_attr": "is_system_auditor",
  "is_system_auditor_value": ["Auditor"],
  "remove_superusers": true,
  "remove_system_auditors": true
}
```

| Key | Meaning |
| --- | --- |
| `is_superuser_role` | Values of the assertion's `Role` attribute that make the user a superuser. |
| `is_superuser_attr` | An attribute that makes the user a superuser when the user has it. |
| `is_superuser_value` | Values of `is_superuser_attr`, one of which the user must have. |
| `remove_superusers` | `true` (the default): a user the settings do not flag loses the flag. `false`: the flag is only ever added. |

The `is_system_auditor_*` keys and `remove_system_auditors` do the same for
the system auditor flag.

When both a role and an attribute are set, the attribute decides whenever the
user has it:

| Has role | Has attr | Has attr value | Is flagged |
|----------|----------|----------------|------------|
| No       | No       | N/A            | No         |
| Yes      | No       | N/A            | Yes        |
| No       | Yes      | Yes            | Yes        |
| No       | Yes      | No             | No         |
| No       | Yes      | Unset          | Yes        |
| Yes      | Yes      | Yes            | Yes        |
| Yes      | Yes      | No             | No         |
| Yes      | Yes      | Unset          | Yes        |

"Unset" means `is_<flag>_value` is not set. A user who ends up unflagged
loses the flag unless `remove_<flag>s` is `false`; this includes an empty
setting, so with the defaults a SAML login takes away flags given to the user
in Ascender.


## Debugging

`ascender-web` logs to standard output; `ASCENDER_LOG_LEVEL=debug` adds the
debug messages. A failed SAML login shows the user only "Sign-in could not be
completed. Please try again."; the reason (an invalid response, a signature
that does not verify, a missing permanent ID, ...) is logged at `error` on the
`social` logger. Missing user details are logged at `warn` on
`ascender.sso.backends`, and the organizations and teams a login creates at
`info` on `ascender.sso.common`.
