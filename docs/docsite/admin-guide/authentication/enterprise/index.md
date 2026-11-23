---
title: Enterprise Authentication
description: Set up Microsoft Entra ID (Azure AD), SAML, and generic OIDC authentication for Ascender enterprise users.
weight: 2
---

This page describes setting up authentication for the following enterprise systems:

- [Microsoft Entra ID (Azure AD) settings](#microsoft-entra-id-azure-ad-settings)
- [LDAP Authentication](#ldap-authentication)
- [SAML settings](#saml-settings)
- [Generic OIDC settings](#generic-oidc-settings)

<Hint type="note">

For LDAP authentication, see [LDAP authentication](../ldap).

</Hint>

Users created by a SAML login are categorized as "Enterprise" users. The following rules apply to Enterprise users:

- Enterprise users can only be created via the first successful login attempt from remote authentication backend.
- When the username a login provides is already taken by another account, the new account gets that username with 16 random hexadecimal characters added. With **Prevent username collisions on first login** (`SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS`) turned on in the Miscellaneous Authentication settings, the login is refused instead.
- Enterprise users have no Ascender password, and a password set for one is ignored. An enterprise user cannot be converted to a local Ascender user, whether or not SAML is still configured.

## Microsoft Entra ID (Azure AD) settings

Microsoft Entra ID is the name Azure Active Directory (Azure AD) has had since 2023. The **Microsoft Entra ID (Azure AD) settings** page has three tabs: **Microsoft Entra ID**, the login to use for a new setup, and **Azure AD Default (legacy)** and **Azure AD Tenant (legacy)**, the older Azure AD logins, kept for existing setups (see [Legacy Azure AD logins](#legacy-azure-ad-logins)).

To set up the Microsoft Entra ID login, you register an application for Ascender in your tenant. Each application's client ID and secret must belong to that one application and cannot be shared or reused between different authentication backends. For application registering basics, refer to [Register an application in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

1. Click **Settings** from the left navigation bar.
2. On the left side of the Settings window, click **Microsoft Entra ID (Azure AD) settings** from the list of Authentication options. The page opens on the **Microsoft Entra ID** tab.
3. The **Entra ID Callback URL** field is already pre-populated and non-editable. In the Microsoft Entra admin center, under **App registrations**, register a new application for accounts in this organizational directory only, and add a **Web** redirect URI with the value of the **Entra ID Callback URL** field.
4. Under **Certificates & secrets**, create a client secret for the application.
5. Click **Edit** and enter information in the following fields:

    - **Entra ID Client ID**: the Application (client) ID of the application.
    - **Entra ID Client Secret**: the client secret. Leave it blank when using Azure Workload Identity.
    - **Entra ID Tenant**: the Directory (tenant) ID, or one of the tenant's domains such as `contoso.onmicrosoft.com`. Only users of this tenant can log in, so `common`, `organizations` and `consumers` are not accepted.
    - **Entra ID Authority Host**: the sign in host of the cloud the tenant lives in. Leave the default, `login.microsoftonline.com`, for the public cloud.

6. Optionally fill in the other fields: **Entra ID Username Claim** (the claim a new user's username is taken from, `preferred_username` by default), **Strip the Domain from Entra ID Usernames**, **Entra ID Groups Claim**, **Read Entra ID Groups from Microsoft Graph**, **Entra ID Login Rule**, **Entra ID Organization Map**, **Entra ID Team Map**, **Entra ID User Flags**, **Log Out of Entra ID** and **Entra ID Post Logout Redirect URL**. The login rule, maps and flags work as they do for [Generic OIDC](#generic-oidc-settings), and each field's help text describes it.
7. Click **Save** when done.
8. To verify that the authentication was configured correctly, logout of Ascender and the login screen will now display the Microsoft Azure logo to allow logging in with those credentials.

![Ascender login screen displaying the Microsoft Azure logo for authentication](/assets/images/configure-ascender-auth-azure-logo.webp)

### Legacy Azure AD logins

The **Azure AD Default (legacy)** and **Azure AD Tenant (legacy)** tabs keep the older Azure AD logins working for existing setups. Use the **Microsoft Entra ID** tab for a new setup. On the **Azure AD Default (legacy)** tab:

1. The **Azure AD OAuth2 Callback URL** field is already pre-populated and non-editable. Register it with the application in Azure.
2. Click **Edit** and copy and paste the application's Application ID to the **Azure AD OAuth2 Key** field, and its secret to the **Azure AD OAuth2 Secret** field.
3. For details on completing the mapping fields, see [Organization and Team Mapping](../social#organization-and-team-mapping).
4. Click **Save** when done.

The **Azure AD Tenant (legacy)** tab has the same fields, prefixed **Azure AD Tenant OAuth2**, and an **Azure AD Tenant ID** field.

## LDAP Authentication

Refer to the [LDAP authentication](../ldap) page.

## SAML settings

SAML allows the exchange of authentication and authorization data between an Identity Provider (IdP - a system of servers that provide the Single Sign On service) and a Service Provider (in this case, Ascender). Ascender can be configured to talk with SAML in order to authenticate (create/login/logout) Ascender users. User Team and Organization membership can be embedded in the SAML response to Ascender.

![Diagram depicting the SAML topology for Ascender, with the identity provider exchanging authentication data with the Ascender cluster](/assets/images/configure-ascender-auth-saml-topology.webp)

The following instructions describe Ascender as the service provider.

To setup SAML authentication:

1. Click **Settings** from the left navigation bar.
2. On the left side of the Settings window, click **SAML settings** from the list of Authentication options.
3. The **SAML Assertion Consumer Service (ACS) URL** and **SAML Service Provider Metadata URL** fields are pre-populated and are non-editable. Contact the Identity Provider administrator and provide the information contained in these fields.
4. Click **Edit** and set the **SAML Service Provider Entity ID** to be the same as the **Base URL of the service** field that can be found in the Miscellaneous System settings screen by clicking **Settings** from the left navigation bar. Through the API, it can be viewed in the `/api/v2/settings/system`, under the `ASCENDER_URL_BASE` variable. The Entity ID can be set to any one of the individual Ascender cluster nodes, but it is good practice to set it to the URL of the Service Provider. Ensure that the Base URL matches the FQDN of the load balancer (if used).

    **Note:** The Base URL is one value for the whole installation, shared by every node in a cluster. Commonly, a load balancer will sit in front of many Ascender cluster nodes to provide a single entry point, the Ascender Cluster FQDN, and the Base URL should be that FQDN. The SAML Service Provider must be able establish an outbound connection and route to the Ascender Cluster Node or the Ascender Cluster FQDN set in the SAML Service Provider Entity ID.

    In this example, the Service Provider is the Ascender cluster, and therefore, the ID is set to the Ascender Cluster FQDN.

    ![SAML Service Provider Entity ID field set to the Ascender cluster FQDN](/assets/images/configure-ascender-auth-saml-spentityid.webp)

5. Create a server certificate for the Ascender cluster. Typically when an Ascender cluster is configured, Ascender nodes will be configured to handle HTTP traffic only and the load balancer will be an SSL Termination Point. In this case, an SSL certificate is required for the load balancer, and not for the individual Ascender Cluster Nodes. SSL can either be enabled or disabled per individual Ascender node, but should be disabled when using an SSL terminated load balancer. It is recommended to use a non-expiring self signed certificate to avoid periodically updating certificates. This way, authentication will not fail in case someone forgets to update the certificate.

    **Note:** The **SAML Service Provider Public Certificate** field should contain the entire certificate, including the `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`.

    If you are using a CA bundle with your certificate, include the entire bundle in this field.

    ![SAML Service Provider Public Certificate field containing a PEM certificate](/assets/images/configure-ascender-auth-saml-cert.webp)

    As an example for public certs:

    ```text
    -----BEGIN CERTIFICATE——
    ... cert text ...
    -----END CERTIFICATE——
    ```

6. Create the private key for Ascender to use as a service provider (SP), the key that matches the public certificate above, and enter it in the **SAML Service Provider Private Key** field. The private key is required: SAML is not enabled until it is set, along with the entity ID, the public certificate, the organization info, the technical and support contacts, and the enabled identity providers.

    As an example for private keys:

    ```text
    -----BEGIN PRIVATE KEY--
    ... key text ...
    -----END PRIVATE KEY——
    ```

7. Provide the IdP with some details about the Ascender cluster during the SSO process in the **SAML Service Provider Organization Info** field.

    ```json
    {
      "en-US": {
        "url": "http://www.example.com",
        "displayname": "Example",
        "name": "example"
      }
    }
    ```

    For example:

    ![SAML Service Provider Organization Info field containing an example JSON object](/assets/images/configure-ascender-auth-saml-org-info.webp)

    **Note:** These fields are required in order to properly configure SAML within Ascender.

8. Provide the IdP with the technical contact information in the **SAML Service Provider Technical Contact** field. Do not remove the contents of this field.

    ```json
    {
    "givenName": "Some User",
    "emailAddress": "suser@example.com"
    }
    ```

    For example:

    ![SAML Service Provider Technical Contact field containing an example JSON object](/assets/images/configure-ascender-auth-saml-techcontact-info.webp)

9. Provide the IdP with the support contact information in the **SAML Service Provider Support Contact** field. Do not remove the contents of this field.

    ```json
    {
    "givenName": "Some User",
    "emailAddress": "suser@example.com"
    }
    ```

    For example:

    ![SAML Service Provider Support Contact field containing an example JSON object](/assets/images/configure-ascender-auth-saml-suppcontact-info.webp)

10. In the **SAML Enabled Identity Providers** field, provide information on how to connect to each Identity Provider listed. Ascender expects the following SAML attributes in the example below:

    ```text
    Username(urn:oid:0.9.2342.19200300.100.1.1)
    Email(urn:oid:0.9.2342.19200300.100.1.3)
    FirstName(urn:oid:2.5.4.42)
    LastName(urn:oid:2.5.4.4)
    ```

    If these attributes are not known, map existing SAML attributes to lastname, firstname, email and username.

    Configure the required keys for each IdP:

    - `attr_user_permanent_id` - the unique identifier for the user. It can be configured to match any of the attribute sent from the IdP. Usually, it is set to `name_id` if `SAML:nameid` attribute is sent to the Ascender node or it can be the username attribute, or a custom unique identifier.
    - `entity_id` - the Entity ID provided by the Identity Provider administrator. The admin creates a SAML profile for Ascender and it generates a unique URL.
    - `url` - the Single Sign On (SSO) URL Ascender redirects the user to, when SSO is activated.
    - `x509cert` - the certificate provided by the IdP admin generated from the SAML profile created on the Identity Provider. Remove the `--BEGIN CERTIFICATE--` and `--END CERTIFICATE--` headers, then enter the cert as one non-breaking string. For a key rollover, `x509certMulti`, with `{"signing": [cert, ...]}`, adds more certificates; a signature by any of them is accepted.

    Multiple SAML IdPs are supported. Some IdPs may provide user data using attribute names that differ from the default OIDs ([https://github.com/omab/python-social-auth/blob/master/social/backends/saml.py](https://github.com/omab/python-social-auth/blob/master/social/backends/saml.py)). The SAML `NameID` is a special attribute used by some Identity Providers to tell the Service Provider (Ascender cluster) what the unique user identifier is. If it is used, set the `attr_user_permanent_id` to `name_id` as shown in the example. Other attribute names may be overridden for each IdP as shown below.

    ```json
    {
    "myidp": {
      "entity_id": "https://idp.example.com",
      "url": "https://myidp.example.com/sso",
      "x509cert": ""
    },
    "onelogin": {
      "entity_id": "https://app.onelogin.com/saml/metadata/123456",
      "url": "https://example.onelogin.com/trust/saml2/http-post/sso/123456",
      "x509cert": "",
      "attr_user_permanent_id": "name_id",
      "attr_first_name": "User.FirstName",
      "attr_last_name": "User.LastName",
      "attr_username": "User.email",
      "attr_email": "User.email"
      }
    }
    ```

    ![SAML Enabled Identity Providers field containing an example IdP definition](/assets/images/configure-ascender-auth-saml-idps.webp)

    **Warning:** A user's first SAML login links to an existing Ascender account with the same email address only when that account has no local password, is neither a System Administrator nor a System Auditor, and is not already linked to LDAP or another login. Otherwise a new account is created, so a SAML login cannot take over a System Administrator account by its email address. You can add (or remove) System Administrator and System Auditor privileges based on SAML mappings, as described in subsequent steps.

    **Note:** The IdP provides the email, last name and firstname using the well known SAML urn. The IdP uses a custom SAML attribute to identify a user, which is an attribute that Ascender is unable to read. Instead, Ascender can understand the unique identifier name, which is the URN. Use the URN listed in the SAML "Name" attribute for the user attributes as shown in the example below.

    ![SAML Enabled Identity Providers field mapping user attributes to SAML URNs](/assets/images/configure-ascender-auth-saml-idps-urn.webp)

11. Optionally provide the **SAML Organization Map**. For further detail, see [Organization and Team Mapping](../social#organization-and-team-mapping).
12. Ascender can be configured to look for particular attributes that contain Team and Organization membership to associate with users when they log into Ascender. The attribute names are defined in the **SAML Organization Attribute Mapping** and the **SAML Team Attribute Mapping** fields.

    **Example SAML Organization Attribute Mapping**

    Below is an example SAML attribute that embeds user organization membership in the attribute *member-of*.

    ```xml
    <saml2:AttributeStatement>
        <saml2:Attribute FriendlyName="member-of" Name="member-of"
    NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
            <saml2:AttributeValue>Engineering</saml2:AttributeValue>
            <saml2:AttributeValue>IT</saml2:AttributeValue>
            <saml2:AttributeValue>HR</saml2:AttributeValue>
            <saml2:AttributeValue>Sales</saml2:AttributeValue>
        </saml2:Attribute>
        <saml2:Attribute FriendlyName="admin-of" Name="admin-of"
    NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">
            <saml2:AttributeValue>Engineering</saml2:AttributeValue>
        </saml2:Attribute>
    </saml2:AttributeStatement>
    ```

    Below is the corresponding Ascender configuration.

    ```json
    {
      "saml_attr": "member-of",
      "saml_admin_attr": "admin-of",
      "remove": true,
      "remove_admins": false
    }
    ```

    `saml_attr`: is the SAML attribute name where the organization array can be found and `remove` is set to **True** to remove a user from all organizations before adding the user to the list of Organizations. To keep the user in whatever Organization(s) they are in while adding the user to the Organization(s) in the SAML attribute, set `remove` to **False**.

    `saml_admin_attr`: Similar to the `saml_attr` attribute, but instead of conveying organization membership, this attribute conveys admin organization permissions.

    **Example SAML Team Attribute Mapping**

    Below is another example of a SAML attribute that contains a Team membership in a list.

    ```xml
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

    ```json
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

    - `saml_attr`: The SAML attribute name where the team array can be found.
    - `remove`: Set `remove` to **True** to remove user from all Teams before adding the user to the list of Teams. To keep the user in whatever Team(s) they are in while adding the user to the Team(s) in the SAML attribute, set `remove` to **False**.
    - `team_org_map`: An array of dictionaries of the form `{ "team": "<Ascender Team Name>", "organization": "<Ascender Org Name>" }` that defines mapping from Ascender Team -> Ascender Organization. This is needed because the same named Team can exist in multiple Organizations in Ascender. The organization to which a team listed in a SAML attribute belongs to, would be ambiguous without this mapping.

    You could create an alias to override a Team name in the **SAML Team Attribute Mapping**. An entry of `team_org_map` accepts only `team`, `team_alias` and `organization`, where `team_alias` is the name of the Ascender team when it differs from the name in the SAML attribute. This option becomes very handy in cases when the SAML backend sends out complex group names, like in the example below:

    ```json
    {
     "remove": false,
     "team_org_map": [
      {
       "team": "internal:unix:domain:admins",
       "organization": "Default",
       "team_alias": "Administrators"
      },
      {
       "team": "Domain Users",
       "organization": "Default"
      }
     ],
     "saml_attr": "member-of"
    }
    ```

    Once the user authenticates, the user is a member of the `Administrators` team when the attribute lists `internal:unix:domain:admins`. Organizations are aliased in the **SAML Organization Map** instead: an entry there with an `organization_alias` names the Ascender organization when it differs from the entry's name, and the alias is also used for an organization that the **SAML Organization Attribute Mapping** lists under the entry's name.

13. Optionally provide team membership mapping in the **SAML Team Map** field. For further detail, see [Organization and Team Mapping](../social#organization-and-team-mapping).
14. Optionally provide security settings in the **SAML Security Config** field. This field is the equivalent to the `SOCIAL_AUTH_SAML_SECURITY_CONFIG` field in the API. Refer to the [OneLogin's SAML Python Toolkit](https://github.com/onelogin/python-saml#settings) for further detail.

15. The **SAML Service Provider Extra Configuration Data** field is equivalent to the `SOCIAL_AUTH_SAML_SP_EXTRA` in the API. Only these keys are used, and others have no effect:

    - `NameIDFormat`: the NameID format the service provider asks for. Defaults to `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`.
    - `assertionConsumerService`: `url` and `binding`, which replace the ACS URL that authentication requests and the metadata give.
    - `attributeConsumingService`: the attributes the service provider requests, described in the metadata: `serviceName`, `serviceDescription` (optional) and `requestedAttributes`, each with a `name` and, optionally, `nameFormat`, `friendlyName`, `isRequired` and `attributeValue`. Its `index` (default `1`) is put in the authentication request. With a service that has no `serviceName` or `requestedAttributes`, or an attribute without a `name`, SAML logins fail.

16. The **SAML IDP to EXTRA_DATA Attribute Mapping** field is equivalent to the `SOCIAL_AUTH_SAML_EXTRA_DATA` in the API. See Python's [SAML Advanced Settings](https://python-social-auth.readthedocs.io/en/latest/backends/saml.html#advanced-settings) documentation for more information.
17. The **SAML User Flags Attribute Mapping** field allows you to map SAML roles and attributes to special user flags. The following attributes are valid in this field:

    - `is_superuser_role`: Specifies one or more SAML roles which will grant a user the superuser flag
    - `is_superuser_attr`: Specifies a SAML attribute which will grant a user the superuser flag
    - `is_superuser_value`: Specifies one or more values required for `is_superuser_attr` that is required for the user to be a superuser
    - `remove_superusers`: Boolean indicating if the superuser flag should be removed for users or not. Defaults to `true`. (See below for more details)
    - `is_system_auditor_role`: Specifies one or more SAML roles which will grant a user the system auditor flag
    - `is_system_auditor_attr`: Specifies a SAML attribute which will grant a user the system auditor flag
    - `is_system_auditor_value`: Specifies one or more values required for `is_system_auditor_attr` that is required for the user to be a system auditor
    - `remove_system_auditors`: Boolean indicating if the system_auditor flag should be removed for users or not. Defaults to `true`. (See below for more details)

    The `role` and `value` fields are lists and are *or* logic. So if you specify two roles: `[ "Role 1", "Role 2" ]` and the SAML user has either role the logic will consider them to have the required role for the flag. This is the same with the `value` field, if you specify: `[ "Value 1", "Value 2"]` and the SAML user has either value for their attribute the logic will consider their attribute value to have matched.

    If `role` and `attr` are both specified for either `superuser` or `system_auditor`, the settings for `attr` will take precedence over a `role`. System Admin and System Auditor roles are evaluated at login for a SAML user. If you grant a SAML user one of these roles through the UI and not through the SAML settings, the roles will be removed on the user's next login unless the `remove` flag is set to false. The remove flag, if `false`, will never allow the SAML adapter to remove the corresponding flag from a user. The following table describes how the logic works.

    | Has one or more roles | Has Attr | Has one or more Attr Values | Remove Flag | Previous Flag | Is Flagged |
    | --- | --- | --- | --- | --- | --- |
    | No | No | N/A | True | False | No |
    | No | No | N/A | False | False | No |
    | No | No | N/A | True | True | No |
    | No | No | N/A | False | True | Yes |
    | Yes | No | N/A | True | False | Yes |
    | Yes | No | N/A | False | False | Yes |
    | Yes | No | N/A | True | True | Yes |
    | Yes | No | N/A | False | True | Yes |
    | No | Yes | Yes | True | False | Yes |
    | No | Yes | Yes | False | False | Yes |
    | No | Yes | Yes | True | True | Yes |
    | No | Yes | Yes | False | True | Yes |
    | No | Yes | No | True | False | No |
    | No | Yes | No | False | False | No |
    | No | Yes | No | True | True | No |
    | No | Yes | No | False | True | Yes |
    | No | Yes | Unset | True | False | Yes |
    | No | Yes | Unset | False | False | Yes |
    | No | Yes | Unset | True | True | Yes |
    | No | Yes | Unset | False | True | Yes |
    | Yes | Yes | Yes | True | False | Yes |
    | Yes | Yes | Yes | False | False | Yes |
    | Yes | Yes | Yes | True | True | Yes |
    | Yes | Yes | Yes | False | True | Yes |
    | Yes | Yes | No | True | False | No |
    | Yes | Yes | No | False | False | No |
    | Yes | Yes | No | True | True | No |
    | Yes | Yes | No | False | True | Yes |
    | Yes | Yes | Unset | True | False | Yes |
    | Yes | Yes | Unset | False | False | Yes |
    | Yes | Yes | Unset | True | True | Yes |
    | Yes | Yes | Unset | False | True | Yes |

    Each time a SAML user authenticates to Ascender, these checks will be performed and the user flags will be altered as needed. If `System Administrator` or `System Auditor` is set for a SAML user within the UI, the SAML adapter will override the UI setting based on the rules above. If you would prefer that the user flags for SAML users do not get removed when a SAML user logs in, you can set the `remove_` flag to `false`. With the remove flag set to `false`, a user flag set to `true` through either the UI, API or SAML adapter will not be removed. However, if a user does not have the flag, and the above rules determine the flag should be added, it will be added, even if the flag is `false`.

    Example:

    ```json
    {
        "is_superuser_attr": "blueGroups",
        "is_superuser_role": ["is_superuser"],
        "is_superuser_value": ["cn=My-Sys-Admins,ou=memberlist,ou=mygroups,o=myco.com"],
        "is_system_auditor_attr": "blueGroups",
        "is_system_auditor_role": ["is_system_auditor"],
        "is_system_auditor_value": ["cn=My-Auditors,ou=memberlist,ou=mygroups,o=myco.com"]
    }
    ```

18. Click **Save** when done.
19. To verify that the authentication was configured correctly, load the auto-generated URL found in the **SAML Service Provider Metadata URL** into a browser. It should output XML output, otherwise, it is not configured correctly.

    Alternatively, logout of Ascender and the login screen will now display the SAML logo to indicate it as an alternate method of logging into Ascender.

    ![Ascender login screen displaying the SAML logo for authentication](/assets/images/configure-ascender-auth-saml-logo.webp)

### Transparent SAML Logins

For transparent logins to work, you must first get IdP-initiated logins to work. To achieve this:

1. Set the `RelayState` on the IdP to the key of the IdP definition in the `SAML Enabled Identity Providers` field as previously described. In the example given above, `RelayState` would need to be either `myidp` or `onelogin`.
2. Once this is working, specify the redirect URL for non-logged-in users to somewhere other than the default Ascender login page by using the **Login redirect override URL** field in the Miscellaneous Authentication settings window of the **Settings** menu, accessible from the left navigation bar. This should be set to `/sso/login/saml/?idp=<name-of-your-idp>` for transparent SAML login, as shown in the example.

    ![Login redirect override URL field in the Miscellaneous Authentication settings](/assets/images/configure-ascender-system-login-redirect-url.webp)

    **Note:** The above is a sample of a typical IdP format, but may not be the correct format for your particular case. You may need to reach out to your IdP for the correct transparent redirect URL as that URL is not the same for all IdPs.

3. After transparent SAML login is configured, to log in using local credentials or a different SSO, go directly to `https://<your-ascender-server>/login`. This provides the standard Ascender login page, including SSO authentication buttons, and allows you to log in with any configured method.

### Enabling Logging for SAML

SAML messages are written to the standard output of `ascender-web`, as LDAP's are. A failed SAML login shows the user only "Sign-in could not be completed. Please try again."; the reason (an invalid response, a signature that does not verify, a missing permanent ID, and so on) is logged at the `error` level with the logger name `social`. To also see debug messages, set `ASCENDER_LOG_LEVEL` to `debug` as described in [Enabling Logging for LDAP](../ldap#enabling-logging-for-ldap).

## Generic OIDC settings

Similar to SAML, OpenID Connect (OIDC) uses the OAuth 2.0 framework. It allows third-party applications to verify the identity and obtain basic end-user information. The main difference between OIDC and SAML is that SAML has a service provider (SP)-to-IdP trust relationship, whereas OIDC establishes the trust with the channel (HTTPS) that is used to obtain the security token. To obtain the credentials needed to setup OIDC with Ascender, refer to the documentation from the identity provider (IdP) of your choice that has OIDC support.

To configure OIDC in Ascender:

1. Click **Settings** from the left navigation bar.
2. On the left side of the Settings window, click **Generic OIDC settings** from the list of Authentication options.
3. Click **Edit** and enter information in the following fields:

    - **OIDC Key**: Client ID from your 3rd-party IdP.
    - **OIDC Secret**: Client Secret from your IdP.
    - **OIDC Provider URL**: URL for your OIDC provider.
    - **Verify OIDC Provider Certificate**: Use the toggle to enable/disable the OIDC provider SSL certificate verification.
    - **OIDC Username Claim**: The claim a new user's username is taken from. Defaults to `preferred_username`.
    - **Strip the Domain from OIDC Usernames**: Use the toggle to keep only the part before the `@` of the username claim when a user is created, so `fernando.roca@example.com` becomes `fernando.roca`.
    - **OIDC Groups Claim**: The claim holding the user's groups. Defaults to `groups`. A nested claim can be named by its dotted path, such as `realm_access.roles` for Keycloak realm roles.
    - **OIDC Additional Scopes**: Scopes to request on top of `openid`, `profile` and `email`, for example `groups`.
    - **OIDC Login Rule**: Optional. A trigger rule a user must match to log in through OIDC at all.
    - **OIDC Organization Map** and **OIDC Team Map**: Optional. Which organizations and teams OIDC users belong to, based on their groups and claims. When they are not set, the shared social auth maps apply.
    - **OIDC User Flags**: Optional. Trigger rules that make an OIDC user a superuser or a system auditor.
    - **Log Out of the OIDC Provider**: Use the toggle to also end the user's session at the provider when they log out of Ascender.
    - **OIDC Post Logout Redirect URL**: Where the provider sends the browser after that logout. Defaults to the Base URL of Ascender.

    Register the **OIDC Callback URL** shown on the settings page as a redirect URI of the client at your IdP.

    The example below shows specific values associated to GitHub as the generic IdP:

    ![Generic OIDC settings form filled in with example values for GitHub as the identity provider](/assets/images/configure-ascender-auth-oidc.webp)

4. Click **Save** when done.

    **Note:** The rules and maps use the same trigger syntax as the LDAP organization and team maps. See [`docs/auth/oidc.md`](https://github.com/ctrliq/ascender/blob/main/docs/auth/oidc.md) in the Ascender repository for examples with Keycloak, Entra ID and Dex. When the username an OIDC login provides is already taken by another account, the new account gets that username with 16 random hexadecimal characters added, so the two are considered different users. With **Prevent username collisions on first login** (`SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS`) turned on, the login is refused instead.

5. To verify that the authentication was configured correctly, logout of Ascender and the login screen will now display the OIDC logo to indicate it as an alternate method of logging into Ascender.

    ![Ascender login screen displaying the OpenID Connect (OIDC) logo for authentication](/assets/images/configure-ascender-auth-oidc-logo.webp)
