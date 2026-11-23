---
title: Security Best Practices
description: Best practices for securing Ascender, including access control, credential handling, auditing, external account stores, and password policies.
weight: 21
---

Ascender is deployed in a secure fashion for use to automate typical environments. However, managing certain operating system environments, automation, and automation platforms, may require some additional best practices to ensure security. This page describes best practices for automation in a secure manner.

## Understand the architecture of Ansible and Ascender

Ansible and Ascender comprise a general purpose, declarative, automation platform. That means that once an Ansible playbook is launched (via Ascender, or directly on the command line), the playbook, inventory, and credentials provided to Ansible are considered to be the source of truth. If policies are desired around external verification of specific playbook content, job definition, or inventory contents, these processes must be undertaken before the automation is launched (whether via the Ascender web UI, or the Ascender API).

These can take many forms. The use of source control, branching, and mandatory code review is best practice for Ansible automation. There are many tools that can help create process flow around using source control in this manner.

At a higher level, many tools exist that allow for creation of approvals and policy-based actions around arbitrary workflows, including automation; these tools can then use Ansible via Ascender's API to perform automation.

We recommend all customers of Ascender select a secure default administrator password at time of installation. See [Changing the Ascender admin password](../tips-and-tricks#changing-the-ascender-admin-password) for more information.

Ascender exposes services on certain well-known ports, such as port 80 for HTTP traffic and port 443 for HTTPS traffic. We recommend that you do not expose Ascender on the open internet, significantly reducing the threat surface of your installation.

## Granting access

Granting access to certain parts of the system exposes security risks. Apply the following practices to help secure access:

- [Minimize administrative accounts](#minimize-administrative-accounts)
- [Minimize local system access](#minimize-local-system-access)
- [Remove access to credentials from users](#remove-access-to-credentials-from-users)
- [Enforce separation of duties](#enforce-separation-of-duties)

### Minimize administrative accounts

Minimizing the access to system administrative accounts is crucial for maintaining a secure system. A system administrator/root user can access, edit, and disrupt any system application. Keep the number of people/accounts with root access to as small of a group as possible. Do not give out `sudo` to `root` or to the `ascender` service user (uid 1000) to untrusted users. Know that when restricting administrative access via mechanisms like `sudo`, that restricting to a certain set of commands may still give a wide range of access. Any command that allows for execution of a shell or arbitrary shell commands, or any command that can change files on the system, is fundamentally equivalent to full root access.

In an Ascender context, any Ascender "system administrator" or "superuser" account can edit, change, and update any inventory or automation definition in Ascender. Restrict this to the minimum set of users possible for low-level Ascender configuration and disaster recovery only.

### Minimize local system access

Ascender, when used with best practices, should not require local user access except for administrative purposes. Non-administrator users should not have access to the Ascender system.

### Remove access to credentials from users

If an automation credential is only stored in Ascender, it can be further secured. Services such as OpenSSH can be configured to only allow credentials on connections from specific addresses. Credentials used by automation can be different than credentials used by system administrators for disaster-recovery or other ad-hoc management, allowing for easier auditing.

### Enforce separation of duties

Different pieces of automation may need to access a system at different levels. For example, you may have low-level system automation that applies patches and performs security baseline checking, while a higher-level piece of automation deploys applications. By using different keys or credentials for each piece of automation, the effect of any one key vulnerability is minimized, while also allowing for easy baseline auditing.

## Available resources

Several resources exist in Ascender and elsewhere to ensure a secure platform. Consider utilizing the following functionality:

- [Audit and logging functionality](#audit-and-logging-functionality)
- [Existing security functionality](#existing-security-functionality)
- [External account stores](#external-account-stores)
- [Password policies](#password-policies)

### Audit and logging functionality

For any administrative access, it is key to audit and watch for actions.

For Ascender, this is done via the built-in Activity Stream support that logs all changes within Ascender, as well as via the automation logs.

Best practices dictate collecting logging and auditing centrally, rather than reviewing it on the local system. It is recommended that Ascender be configured to use whatever IDS and/or logging/auditing (Splunk) is standard in your environment. Ascender includes built-in logging integrations for Elastic Stack, Splunk, Sumologic, Loggly, and more. See [Logging](../logging) for more information.

### Existing security functionality

Do not disable SELinux, and do not disable Ascender's existing multi-tenant containment. Use Ascender's role-based access control (RBAC) to delegate the minimum level of privileges required to run automation. Use Teams in Ascender to assign permissions to groups of users rather than to users individually. See [Role-based access controls](/user-guide/security#role-based-access-controls) in the [Ascender user guides](/user-guide).

### External account stores

Maintaining a full set of users just in Ascender can be a time-consuming task in a large organization, prone to error. Ascender supports connecting to external account sources via [LDAP](../authentication/ldap), [SAML 2.0](../authentication/enterprise#saml-settings), and certain [OAuth providers](../authentication/social). Using this eliminates a source of error when working with permissions.

### Password policies

Ascender admins can set password policies that are checked whenever a user's password is set, through the API or the user interface. On the **Miscellaneous Authentication** settings screen, set the following:

| Setting | Requirement |
| --- | --- |
| **Minimum number of characters in local password** (`LOCAL_PASSWORD_MIN_LENGTH`) | Minimum number of characters |
| **Minimum number of digit characters in local password** (`LOCAL_PASSWORD_MIN_DIGITS`) | Minimum number of digits |
| **Minimum number of uppercase characters in local password** (`LOCAL_PASSWORD_MIN_UPPER`) | Minimum number of uppercase letters |
| **Minimum number of special characters in local password** (`LOCAL_PASSWORD_MIN_SPECIAL`) | Minimum number of characters that are neither letters nor digits |

Each defaults to `0`, which means no minimum. The policy applies to new and changed passwords; existing passwords are not checked again. Independently of these settings, a password longer than 128 characters is refused with `Password max length is 128`.

The same settings can be changed through the API at `/api/v2/settings/authentication/`.
