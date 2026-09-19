# LDAP
The Lightweight Directory Access Protocol (LDAP) is an open, vendor-neutral, industry-standard application protocol for accessing and maintaining distributed directory information services over an Internet Protocol (IP) network. Directory services play an important role in developing intranet and Internet applications by allowing the sharing of information about users, systems, networks, services, and applications throughout the network.


# Configure LDAP Authentication

Please see the [Tower documentation](https://docs.ansible.com/ansible-tower/latest/html/administration/ldap_auth.html) as well as [Ansible blog post](https://www.ansible.com/blog/getting-started-ldap-authentication-in-ansible-tower) for basic LDAP configuration.

LDAP Authentication provides duplicate sets of configuration fields for authentication with up to six different LDAP servers.
The default set of configuration fields take the form `AUTH_LDAP_<field name>`. Configuration fields for additional LDAP servers are numbered `AUTH_LDAP_<n>_<field name>`.


## Test Environment Setup

Please see `README.md` of this repository: https://github.com/ansible/deploy_ldap


# Basic Setup for FreeIPA

LDAP Server URI (append if you have multiple LDAPs)    
`ldaps://{{serverip1}}:636`

LDAP BIND DN (How to create a bind account in [FreeIPA](https://www.freeipa.org/page/Creating_a_binddn_for_Foreman)   
`uid=awx-bind,cn=sysaccounts,cn=etc,dc=example,dc=com`

LDAP BIND PASSWORD   
`{{yourbindaccountpassword}}`

LDAP USER DN TEMPLATE   
`uid=%(user)s,cn=users,cn=accounts,dc=example,dc=com`

LDAP GROUP TYPE   
`NestedMemberDNGroupType`

LDAP GROUP SEARCH
```
[
"cn=groups,cn=accounts,dc=example,dc=com",
"SCOPE_SUBTREE",
"(objectClass=groupOfNames)"
]
```

LDAP USER ATTRIBUTE MAP
```
{
"first_name": "givenName",
"last_name": "sn",
"email": "mail"
}
```

LDAP USER FLAGS BY GROUP
```
{
"is_superuser": "cn={{superusergroupname}},cn=groups,cn=accounts,dc=example,dc=com"
}
```

LDAP ORGANIZATION MAP
```
{
"{{yourorganizationname}}": {
"admins": "cn={{admingroupname}},cn=groups,cn=accounts,dc=example,dc=com",
"remove_admins": false
}
}
```


# Mapping users to organizations and teams

`AUTH_LDAP_ORGANIZATION_MAP` and `AUTH_LDAP_TEAM_MAP` decide which organizations
and teams a user belongs to, and they are evaluated every time that user logs in.

The usual form names group DNs. A user is given the role if they are a member of
any of the groups listed:

```json
{
  "Patching Viewers": {
    "organization": "Example Org",
    "users": ["CN=viewers,OU=Groups,DC=example,DC=com"],
    "remove": true
  }
}
```

## Trigger rules

Naming a single person that way means creating a group of one in the directory.
A rule can instead match on the user themselves, using the same trigger syntax
the platform's authenticator maps use:

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

Organization maps take one rule per role, named after the role it decides:

```json
{
  "Example Org": {
    "triggers_admins": {"attributes": {"department": {"equals": "Private Cloud"}}},
    "triggers_users": {"groups": {"has_or": ["CN=staff,OU=Groups,DC=example,DC=com"]}},
    "triggers_auditors": {"never": {}}
  }
}
```

A rule is one of four things:

| Trigger | Matches |
|---|---|
| `attributes` | the attributes of the user's directory entry |
| `groups` | the DNs of the groups they belong to, with `has_or`, `has_and` or `has_not` |
| `always` | everyone who logs in |
| `never` | nobody |

Attributes are matched with `equals`, `matches` (a regular expression),
`contains`, `ends_with` or `in` (a list). An attribute given an empty condition
matches anyone who has that attribute at all. `matches` ignores case, while the
rest do not, so `{"matches": "^private cloud$"}` and
`{"equals": "Private Cloud"}` are not the same rule. Several attributes are combined
with `join_condition`, either `or` (the default) or `and`:

```json
{
  "attributes": {
    "join_condition": "and",
    "mail": {"ends_with": "@example.com"},
    "department": {"equals": "Private Cloud"}
  }
}
```

The attribute names are the directory's own, not the names they are mapped to in
`AUTH_LDAP_USER_ATTR_MAP`, and any attribute of the entry can be matched. Spell
them the way the directory returns them, `sAMAccountName` rather than
`samaccountname`, which is what `AUTH_LDAP_USER_ATTR_MAP` already asks for.

Only one trigger, and one group operator within `groups`, is evaluated. Writing
more than one is refused rather than half applied, and so is a rule that could
not match anyone: an empty body, or a pattern that does not compile.

## How a rule and a group DN list fit together

An entry may carry both. The rule is evaluated first:

* `always`, or a rule the user matches, gives them the role.
* `never` takes it away, whatever the group DNs say.
* A rule that says nothing about the user falls through to the group DNs beside
  it, and then to `remove`.

`remove` (or `remove_admins`, `remove_users` and `remove_auditors` on an
organization) still decides what happens to a user who matches nothing. It
defaults to true, so a user who no longer meets the rule loses the role at their
next login.

An entry with no rule behaves exactly as it always has.
