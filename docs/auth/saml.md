# SAML
Security Assertion Markup Language, or SAML, is an open standard for exchanging authentication and/or authorization data between an identity provider (*i.e.*, LDAP) and a service provider (*i.e.*, Ascender). More concretely, Ascender can be configured to talk with SAML in order to authenticate (create/login/logout) users of Ascender. User Team and Organization membership can be embedded in the SAML response to Ascender.


# Configure SAML Authentication
Please see the [Tower documentation](https://docs.ansible.com/ansible-tower/latest/html/administration/ent_auth.html#saml-authentication-settings) as well as the [Ansible blog post](https://www.ansible.com/blog/using-saml-with-red-hat-ansible-tower) for basic SAML configuration. Note that Ascender's SAML implementation relies on `python-social-auth` which uses `python-saml`. Ascender exposes three fields which are directly passed to the lower libraries:
* `SOCIAL_AUTH_SAML_SP_EXTRA` is passed to the `python-saml` library configuration's `sp` setting.  
* `SOCIAL_AUTH_SAML_SECURITY_CONFIG` is passed to the `python-saml` library configuration's `security` setting.
* `SOCIAL_AUTH_SAML_EXTRA_DATA`

See https://python-social-auth.readthedocs.io/en/latest/backends/saml.html#advanced-settings for more information.


# Configure SAML for Team and Organization Membership
Ascender can be configured to look for particular attributes that contain Ascender Team and Organization membership to associate with users when they log in to Ascender. The attribute names are defined in Ascender settings. Specifically, the authentication settings tab and SAML sub category fields *SAML Team Attribute Mapping* and *SAML Organization Attribute Mapping*. The meaning and usefulness of these settings is best communicated through example.

### Example SAML Organization Attribute Mapping

Below is an example SAML attribute that embeds user organization membership in the attribute *member-of*.
```
<saml2:AttributeStatement>
    <saml2:Attribute FriendlyName="member-of" Name="member-of" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
   	 <saml2:AttributeValue>Engineering</saml2:AttributeValue>
   	 <saml2:AttributeValue>IT</saml2:AttributeValue>
   	 <saml2:AttributeValue>HR</saml2:AttributeValue>
   	 <saml2:AttributeValue>Sales</saml2:AttributeValue>
    </saml2:Attribute>
    <saml2:Attribute FriendlyName="administrator-of" Name="administrator-of" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
   	 <saml2:AttributeValue>IT</saml2:AttributeValue>
   	 <saml2:AttributeValue>HR</saml2:AttributeValue>
    </saml2:Attribute>
</saml2:AttributeStatement>
```
Below, the corresponding Ascender configuration:
```
{
  "saml_attr": "member-of",
  "saml_admin_attr": "administrator-of",
  "remove": true,
  'remove_admins': true
}
```
**saml_attr:** The SAML attribute name where the organization array can be found.

**remove:** Set this to `true` to remove a user from all organizations before adding the user to the list of Organizations. Set it to `false` to keep the user in whatever Organization(s) they are in while adding the user to the Organization(s) in the SAML attribute.

**saml_admin_attr:** The SAML attribute name where the organization administrators' array can be found.

**remove_admins:** Set this to `true` to remove a user from all organizations that they are administrators of before adding the user to the list of Organizations admins. Set it to `false` to keep the user in whatever Organization(s) they are in as admin while adding the user as an Organization administrator in the SAML attribute.

### Example SAML Team Attribute Mapping
Below is another example of a SAML attribute that contains a Team membership in a list:
```
  <saml:AttributeStatement>
     <saml:Attribute
       xmlns:x500="urn:oasis:names:tc:SAML:2.0:profiles:attribute:X500"
       x500:Encoding="LDAP"
       NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
       Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.1"
       FriendlyName="eduPersonAffiliation">
       <saml:AttributeValue
         xsi:type="xs:string">member</saml:AttributeValue>
       <saml:AttributeValue
         xsi:type="xs:string">staff</saml:AttributeValue>
     </saml:Attribute>
   </saml:AttributeStatement>
```

```
{
  "saml_attr": "eduPersonAffiliation",
  "remove": true,
  "team_org_map": [
    {
      "team": "member",
      "organization": "Default1"
    },
    {
      "team": "staff",
      "organization": "Default2"
    }
  ]
}
```
**saml_attr:** The SAML attribute name where the team array can be found.

**remove:** Set this to `true` to remove user from all Teams before adding the user to the list of Teams. Set this to `false` to keep the user in whatever Team(s) they are in while adding the user to the Team(s) in the SAML attribute.

**team_org_map:** An array of dictionaries of the form `{ "team": "<Ascender Team Name>", "organization": "<Ascender Org Name>" }` which defines mapping from Ascender Team -> Ascender Organization. This is needed because the same named Team can exist in multiple Organizations in Tower. The organization to which a team listed in a SAML attribute belongs to would be ambiguous without this mapping.


### Example SAML User Flags Attribute Mapping
SAML User flags can be set for users with global "System Administrator" (superuser) or "System Auditor" (system_auditor) permissions.

Below is an example of a SAML attribute that contains admin attributes:
```
<saml2:AttributeStatement>
    <saml2:Attribute FriendlyName="is_system_auditor" Name="is_system_auditor" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
   	 <saml2:AttributeValue>Auditor</saml2:AttributeValue>
    </saml2:Attribute>
    <saml2:Attribute FriendlyName="is_superuser" Name="is_superuser" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
   	 <saml2:AttributeValue>IT-Superadmin</saml2:AttributeValue>
    </saml2:Attribute>
</saml2:AttributeStatement>
```

These properties can be defined either by a role or an attribute with the following configuration options:
```
{
  "is_superuser_role": ["awx_admins"],
  "is_superuser_attr": "is_superuser",
  "is_superuser_value": ["IT-Superadmin"],
  "is_system_auditor_role": ["awx_auditors"],
  "is_system_auditor_attr": "is_system_auditor",
  "is_system_auditor_value": ["Auditor"]
}
```

**is_superuser_role:** Specifies a SAML role which will grant a user the superuser flag.

**is_superuser_attr:** Specifies a SAML attribute which will grant a user the superuser flag.

**is_superuser_value:** Specifies a specific value required for ``is_superuser_attr`` that is required for the user to be a superuser.

**is_system_auditor_role:** Specifies a SAML role which will grant a user the system auditor flag.

**is_system_auditor_attr:** Specifies a SAML attribute which will grant a user the system auditor flag.

**is_system_auditor_value:** Specifies a specific value required for ``is_system_auditor_attr`` that is required for the user to be a system auditor.


If `role` and `attr` are both specified for either superuser or system_auditor the settings for `attr` will take precedence over a `role`. The following table describes how the logic works.
| Has Role | Has Attr | Has Attr Value | Is Flagged |
|----------|----------|----------------|------------|
| No       | No       | N/A            | No         |
| Yes      | No       | N/A            | Yes        |
| No       | Yes      | Yes            | Yes        |
| No       | Yes      | No             | No         |
| No       | Yes      | Unset          | Yes        |
| Yes      | Yes      | Yes            | Yes        |
| Yes      | Yes      | No             | No         |
| Yes      | Yes      | Unset          | Yes        |


### SAML Debugging
You can enable logging messages for the SAML adapter the same way you can enable logging for LDAP. On the logging settings page change the log level to `Debug`. 
