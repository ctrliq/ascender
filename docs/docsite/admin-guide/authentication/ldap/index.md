---
title: LDAP Authentication
description: Integrate Ascender with an LDAP directory for user authentication and map LDAP groups to Ascender organizations and teams.
weight: 3
---

This page describes how to integrate LDAP authentication with Ascender.

<Hint type="note">

If the LDAP server you want to connect to has a certificate that is self-signed or signed by a corporate internal certificate authority (CA), paste the CA certificate (PEM) into the **LDAP CA Certificate** field of the LDAP settings, or click **Fetch from server** beside the field to fill it with the certificates the server presents, and check their fingerprints with your directory's administrators before saving. Certificates in this field are trusted beside the system trust store, so nothing needs to be added to the system's trusted CAs. Use the **Test** button on the LDAP settings form to check the connection, the bind and, optionally, a login before saving.

</Hint>

Administrators use LDAP as a source for account authentication information for Ascender users. User authentication is provided, but not the synchronization of user permissions and credentials. Organization membership (as well as the organization admin) and team memberships can be synchronized.

When so configured, a user who logs in with an LDAP username and password automatically gets an Ascender account created for them and they can be automatically placed into organizations as either regular users or organization administrators.

Users created locally in the user interface take precedence over those logging into Ascender for their first time with an alternative authentication solution. You must delete the local user if you want to re-use it with another authentication method, such as LDAP.

Users created through an LDAP login cannot change their username, given name, surname, or set a local password for themselves. You can also configure this to restrict editing of other field names.

To configure LDAP integration for Ascender:

1. First, create a user in LDAP that has access to read the entire LDAP structure.
2. Test if you can make successful queries to the LDAP server, use the `ldapsearch` command, which is a command line tool that can be installed on Ascender command line as well as on other Linux and OSX systems. Use the following command to query the LDAP server, where *josie* and *Josie4Cloud* are replaced by attributes that work for your setup:

    ```bash
    ldapsearch -x  -H ldap://win -D "CN=josie,CN=Users,DC=website,DC=com" -b "dc=website,dc=com" -w Josie4Cloud
    ```

    Here `CN=josie,CN=users,DC=website,DC=com` is the Distinguished Name of the connecting user.

    **Note:** The `ldapsearch` utility is not automatically pre-installed with Ascender, however, you can install it from the `openldap-clients` package.

3. In the Ascender user interface, click **Settings** from the left navigation and click to select **LDAP settings** from the list of Authentication options.

    Multiple LDAP configurations are not needed per LDAP server, but you can configure multiple LDAP servers from this page, otherwise, leave the server at **Default**:

    ![LDAP Default settings details page with tabs for the Default server and LDAP1 through LDAP5](/assets/images/configure-ascender-auth-ldap-servers.webp)

    The equivalent API endpoints will show `AUTH_LDAP_*` repeated: `AUTH_LDAP_1_*`, `AUTH_LDAP_2_*`, ..., `AUTH_LDAP_5_*` to denote server designations.

4. To enter or modify the LDAP server address to connect to, click **Edit** and enter in the **LDAP Server URI** field using the same format as the one prepopulated in the text field:

    ![LDAP Server URI field containing an ldap:// server address](/assets/images/configure-ascender-auth-ldap-server-uri.webp)

    **Note:** Multiple LDAP servers may be specified by separating each with spaces or commas. Click the **Help** (tooltip) icon to comply with proper syntax and rules.

5. Enter the password to use for the Binding user in the **LDAP Bind Password** text field. In this example, the password is "passme":

    ![LDAP Bind Password field with a masked password](/assets/images/configure-ascender-auth-ldap-bind-pwd.webp)

6. Click to select a group type from the **LDAP Group Type** drop-down menu list.

    LDAP Group Types include:

    - `PosixGroupType`
    - `GroupOfNamesType`
    - `GroupOfUniqueNamesType`
    - `ActiveDirectoryGroupType`
    - `OrganizationalRoleGroupType`
    - `MemberDNGroupType`
    - `NestedGroupOfNamesType`
    - `NestedGroupOfUniqueNamesType`
    - `NestedActiveDirectoryGroupType`
    - `NestedOrganizationalRoleGroupType`
    - `NestedMemberDNGroupType`
    - `PosixUIDGroupType`

    The group type says how a group lists its members: `MemberDNGroupType` in the attribute named by `member_attr`, `GroupOfNamesType` and `ActiveDirectoryGroupType` in `member`, `GroupOfUniqueNamesType` in `uniqueMember` and `OrganizationalRoleGroupType` in `roleOccupant`, all as DNs, and `PosixGroupType` in `memberUid`, as the user's `uid` (a group whose `gidNumber` is the user's `gidNumber` also counts). `PosixUIDGroupType` works as `PosixGroupType`, with the user attribute named by `ldap_group_user_attr`. Each `Nested` type also counts the groups that contain the user's groups, at any depth. To specify the parameters for the selected group type, see step 15 below.

7. The **LDAP Start TLS** is disabled by default. To enable TLS when the LDAP connection is not using SSL/TLS, click the toggle to **ON**.

    ![LDAP Start TLS toggle](/assets/images/configure-ascender-auth-ldap-start-tls.webp)

8. Enter the Distinguished Name in the **LDAP Bind DN** text field to specify the user that Ascender uses to connect (Bind) to the LDAP server. Below uses the example, `CN=josie,CN=users,DC=website,DC=com`:

    ![LDAP Bind DN field containing CN=josie,CN=users,DC=website,DC=com](/assets/images/configure-ascender-auth-ldap-bind-dn.webp)

9. Leave the **LDAP User DN Template** field empty unless every user's DN has the same form. The template is a full DN in which `%(user)s` stands for the username a user logs in with, for example `uid=%(user)s,ou=users,dc=website,dc=com`. When it is set, it is used instead of **LDAP User Search** to find the user's DN. When users must be found by searching, as with Active Directory, which stores the username in `sAMAccountName`, leave the template empty and put a filter such as `(sAMAccountName=%(user)s)` (or `(uid=%(user)s)` for OpenLDAP) in **LDAP User Search** (step 12).
10. Enter the group distinguish name to allow users within that group to access Ascender in the **LDAP Require Group** field, using the same format as the one shown in the text field, `CN=awx Users,OU=Users,DC=website,DC=com`.

    ![LDAP Require Group field containing a group distinguished name](/assets/images/configure-ascender-auth-ldap-req-group.webp)

11. Enter the group distinguish name to prevent users within that group to access Ascender in the **LDAP Deny Group** field, using the same format as the one shown in the text field. In this example, leave the field blank.
12. Enter where to search for users while authenticating in the **LDAP User Search** field using the same format as the one shown in the text field. In this example, use:

    ```json
    [
    "OU=Users,DC=website,DC=com",
    "SCOPE_SUBTREE",
    "(cn=%(user)s)"
    ]
    ```

    The first line specifies where to search for users in the LDAP tree. In the above example, the users are searched recursively starting from `OU=Users,DC=website,DC=com`.

    The second line specifies the scope where the users should be searched:

    - SCOPE_BASE: This value is used to indicate searching only the entry at the base DN, resulting in only that entry being returned
    - SCOPE_ONELEVEL: This value is used to indicate searching all entries one level under the base DN - but not including the base DN and not including any entries under that one level under the base DN.
    - SCOPE_SUBTREE: This value is used to indicate searching of all entries at all levels under and including the specified base DN.

    The third line specifies the key name where the user name is stored.

    ![LDAP User Search field containing the example search base, scope, and filter](/assets/images/configure-ascender-authen-ldap-user-search.webp)

    **Note:** For multiple search queries, the proper syntax is:

    ```json
    [
      [
      "OU=Users,DC=northamerica,DC=acme,DC=com",
      "SCOPE_SUBTREE",
      "(sAMAccountName=%(user)s)"
      ],
      [
      "OU=Users,DC=apac,DC=corp,DC=com",
      "SCOPE_SUBTREE",
      "(sAMAccountName=%(user)s)"
      ],
      [
      "OU=Users,DC=emea,DC=corp,DC=com",
      "SCOPE_SUBTREE",
      "(sAMAccountName=%(user)s)"
      ]
    ]
    ```

13. In the **LDAP Group Search** text field, specify which groups should be searched and how to search them. In this example, use:

    ```json
    [
    "dc=example,dc=com",
    "SCOPE_SUBTREE",
    "(objectClass=group)"
    ]
    ```

    - The first line specifies the BASE DN where the groups should be searched.
    - The second lines specifies the scope and is the same as that for the user directive.
    - The third line specifies what the `objectclass` of a group object is in the LDAP you are using.

    ![LDAP Group Search field containing the example search base, scope, and filter](/assets/images/configure-ascender-authen-ldap-group-search.webp)

14. Enter the user attributes in the **LDAP User Attribute Map** the text field. In this example, use:

    ```json
    {
    "first_name": "givenName",
    "last_name": "sn",
    "email": "mail"
    }
    ```

    The above example retrieves users by last name from the key `sn`. You can use the same LDAP query for the user to figure out what keys they are stored under.

    ![LDAP User Attribute Map field mapping first_name, last_name, and email to LDAP attributes](/assets/images/configure-ascender-auth-ldap-user-attrb-map.webp)

15. The **LDAP Group Type Parameters** field (`AUTH_LDAP_GROUP_TYPE_PARAMS`) is a dictionary of parameters for the selected **LDAP Group Type**. Each group type accepts only its own parameters:

    | LDAP Group Type | Parameters |
    | --- | --- |
    | `MemberDNGroupType`, `NestedMemberDNGroupType` | `member_attr` (required), the group attribute that lists the members' DNs, and `name_attr` |
    | `PosixUIDGroupType` | `name_attr` and `ldap_group_user_attr` (default `uid`), the user attribute that a group's `memberUid` holds |
    | All other types | `name_attr` |

    `name_attr` is accepted for every type but has no effect. The default, for the default `MemberDNGroupType`, is:

    ```json
    {"name_attr": "cn", "member_attr": "member"}
    ```

    When you select another group type, remove the parameters it does not accept (such as `member_attr` for `GroupOfNamesType`); otherwise saving fails with an "Invalid key(s)" error.

16. Enter the user profile flags in the **LDAP User Flags by Group** the text field. In this example, use the following syntax to set LDAP users as "Superusers" and "Auditors":

    ```json
    {
    "is_superuser": "cn=superusers,ou=groups,dc=website,dc=com",
    "is_system_auditor": "cn=auditors,ou=groups,dc=website,dc=com"
    }
    ```

    The above example retrieves users who are flagged as superusers or as auditor in their profile.

    ![LDAP User Flags by Group field mapping is_superuser and is_system_auditor to LDAP groups](/assets/images/configure-ascender-auth-ldap-user-flags.webp)

17. For details on completing the mapping fields, see [LDAP Organization and Team Mapping](#ldap-organization-and-team-mapping).

    ![LDAP Organization Map and LDAP Team Map fields](/assets/images/configure-ldap-orgs-teams-mapping.webp)

18. Click **Save** when done.

With these values entered on this form, you can now make a successful authentication with LDAP.

<Hint type="note">

Ascender does not actively sync users, but they are created during their initial login. Every LDAP login updates the user's attributes, user flags, and organization and team memberships from the directory.

</Hint>

## LDAP Organization and Team Mapping

You can control which users are placed into which organizations based on LDAP attributes (mapping out between your organization admins/users and LDAP groups).

Keys are organization names. Organizations will be created if not present. Values are dictionaries defining the options for each organization's membership. For each organization, it is possible to specify what groups are automatically users of the organization and also what groups can administer the organization.

**admins**: None, True/False, string or list/tuple of strings.

- If **None**, organization admins will not be updated based on LDAP values.
- If **True**, all users in LDAP will automatically be added as admins of the organization.
- If **False**, no LDAP users will be automatically added as admins of the organization.
- If a string or list of strings, specifies the group DN(s) that will be added of the organization if they match any of the specified groups.

**remove_admins**: True/False. Defaults to the value of **remove**.

- When **True**, a user who is not a member of the given groups will be removed from the organization's administrative list at each login.

**users**: None, True/False, string or list/tuple of strings. Same rules apply as for **admins**.

**remove_users**: True/False. Defaults to the value of **remove**. Same rules apply as **remove_admins**.

**auditors**: None, True/False, string or list/tuple of strings. Same rules apply as for **admins**, for the organization's auditors.

**remove_auditors**: True/False. Defaults to the value of **remove**. Same rules apply as **remove_admins**.

**remove**: True/False. Defaults to **True**. The default for **remove_admins**, **remove_users** and **remove_auditors** when they are not given. With the defaults, a user who is not in the groups for a role loses that role at their next login; set the matching `remove_` key to **False** to only add users.

```json
{
"LDAP Organization": {
  "admins": "cn=engineering_admins,ou=groups,dc=example,dc=com",
  "remove_admins": false,
  "users": [
    "cn=engineering,ou=groups,dc=example,dc=com",
    "cn=sales,ou=groups,dc=example,dc=com",
    "cn=it,ou=groups,dc=example,dc=com"
  ],
  "remove_users": false
},
"LDAP Organization 2": {
  "admins": [
    "cn=Administrators,cn=Builtin,dc=example,dc=com"
  ],
  "remove_admins": false,
  "users": true,
  "remove_users": false
}
}
```

Mapping between team members (users) and LDAP groups. Keys are team names (will be created if not present). Values are dictionaries of options for each team's membership, where each can contain the following parameters:

**organization**: string. The name of the organization to which the team belongs. The team will be created if the combination of organization and team name does not exist. The organization will first be created if it does not exist.

**users**: None, True/False, string or list/tuple of strings.

- If **None**, team members will not be updated.
- If **True/False**, all LDAP users will be added/removed as team members.
- If a string or list of strings, specifies the group DN(s). User will be added as a team member if the user is a member of ANY of these groups.

**remove**: True/False. Defaults to **True**. When **True**, a user who is not a member of the given groups will be removed from the team.

```json
{
"LDAP Engineering": {
  "organization": "LDAP Organization",
  "users": "cn=engineering,ou=groups,dc=example,dc=com",
  "remove": true
},
"LDAP IT": {
  "organization": "LDAP Organization",
  "users": "cn=it,ou=groups,dc=example,dc=com",
  "remove": true
},
"LDAP Sales": {
  "organization": "LDAP Organization",
  "users": "cn=sales,ou=groups,dc=example,dc=com",
  "remove": true
}
}
```

## Enabling Logging for LDAP

LDAP messages are written to the standard output of `ascender-web` (the web container's log), with the logger name `ascender.sso.backends`, and start with the name of the server's backend (`LDAPBackend`, `LDAPBackend1`, and so on). Why a login was refused (no single entry found for the username, the password rejected, a group requirement not met) is logged at the `info` level, which is logged by default. A directory or configuration error is logged at `error`, as "Encountered an error authenticating to LDAP" with the error.

For more detail, set the `ASCENDER_LOG_LEVEL` environment variable of `ascender-web` to `debug` and restart it. The variable takes `debug`, `info` (the default), `warn` or `error`.

The **Logging Aggregator Level Threshold** field of the Logging settings does not change what `ascender-web` writes to its output: it only decides which messages are sent to an external log aggregator, when one is enabled. See [Logging and aggregation](../../logging).

## Referrals

Active Directory returns "referrals" when the queried object is not in its database. Ascender never follows referrals, whatever `OPT_REFERRALS` is set to, so there is nothing to disable.

Other connection options are set in **LDAP Connection Options** (`AUTH_LDAP_CONNECTION_OPTIONS`), through the API at `/api/v2/settings/ldap/`. Only these options have an effect:

| Option | Effect |
| --- | --- |
| `OPT_NETWORK_TIMEOUT` | Seconds to wait for a connection (default 30). |
| `OPT_TIMEOUT` | Seconds to wait for each operation (no limit by default). |
| `OPT_X_TLS_REQUIRE_CERT` | `0` (never) or `3` (allow), or `false`, turns off certificate verification. Any other value verifies, as when the option is absent. |
| `OPT_X_TLS_CACERTFILE` | A PEM file, on the web server's file system, whose certificates replace the system trust store for this server. The **LDAP CA Certificate** field is still added to them. |
