---
title: Authentication
description: Overview of the authentication methods Ascender supports, including social, enterprise, LDAP, Kerberos, OAuth 2 tokens, and session settings.
weight: 10
---

Through the Ascender user interface, you can set up a simplified login through various authentication types: GitHub, Google, LDAP, SAML, and OIDC. After you create and register your developer application with the appropriate service, you can set up authorizations for them.

1. From the left navigation bar, click **Settings**.
2. The left side of the Settings window is a set of configurable Authentication settings. Select from the following options:

   - [Microsoft Entra ID (Azure AD) settings](enterprise#microsoft-entra-id-azure-ad-settings)
   - [GitHub settings](social#github-settings)
   - [Google OAuth 2 settings](social#google-oauth2-settings)
   - [LDAP settings](ldap)
   - [SAML settings](enterprise#saml-settings)
   - [Generic OIDC settings](enterprise#generic-oidc-settings)

   Different authentication types require you to enter different information. Be sure to include all the information as required.

3. Click **Save** to apply the settings or **Cancel** to abandon the changes.

## Authentication topics

- [Social authentication](social): GitHub (including organizations, teams, and GitHub Enterprise) and Google OAuth2 single sign-on, and organization and team mapping for social and enterprise users.
- [Enterprise authentication](enterprise): Microsoft Entra ID (Azure AD), SAML, and generic OIDC.
- [LDAP authentication](ldap): LDAP directory integration, LDAP organization and team mapping, and LDAP logging.
- [Kerberos authentication](kerberos): Active Directory and Kerberos tickets for automation against Windows hosts.
- [Token-based authentication](oauth2-tokens): OAuth 2 applications, personal access tokens, and application tokens.
- [Session timeouts and limits](sessions): idle timeout and the maximum number of simultaneous sessions.
