---
title: Admin Guide
description: Configure, secure, scale, and maintain Ascender.
weight: 2
---

These guides cover configuring, securing, scaling, and maintaining Ascender. For installing and upgrading Ascender, see the [Installation Guide](/installation). For day-to-day use, see the [Ascender user guides](/user-guide).

## Configuration

- [Ascender Configuration](configuration): system, job, and UI settings.
- [Supported Architectures](supported-architectures): x86_64 and ARM64 image support.
- [Starting, Stopping, and Restarting Ascender](service-management): managing Ascender services.
- [Custom Branding](custom-branding): custom logos, browser tab title, and login notice.

## Authentication and Security

- [Authentication](authentication): overview of the supported authentication methods, including social, enterprise (SAML, OIDC, Azure AD), LDAP, Kerberos, OAuth 2 tokens, and session settings.
- [Secret Handling and Connection Security](secret-handling): how Ascender protects secrets and connections.
- [Security Best Practices](security-best-practices): hardening recommendations.
- [Workload Identity](workload-identity): short-lived tokens that let jobs log in to HashiCorp Vault and cloud providers as themselves.

## Capacity and Execution

- [Clustering](clustering): scaling Ascender across multiple nodes.
- [Managing Capacity With Instances](instances): adding and managing instances and execution nodes.
- [Container and Instance Groups](container-instance-groups): running jobs on Kubernetes container groups and instance groups.
- [Topology Viewer](topology-viewer): visualizing your Automation Mesh topology.

## Inventories and Credentials

- [Custom Inventory Scripts](custom-inventory-scripts): migrating custom inventory scripts.
- [Inventory File Importing](inventory-file-importing): importing inventory files from source control.
- [Multi-Credential Assignment](multi-credential-assignment): attaching multiple credentials to job templates.

## Operations

- [Management Jobs](management-jobs): clean up old job history, activity stream data, expired sessions, and OAuth 2 tokens.
- [Logging](logging) and [Metrics](metrics): send logs to external aggregators and monitor Ascender.
- [Improving Ascender Performance](performance): tuning capacity and performance.
- [Proxy Support](proxy-support): running Ascender behind a load balancer or proxy.
- [Command-Line Administration](awx-manage): the `ascender-web` setup and node management commands.
- [Backup](backup) and [Restore](restore): protecting and recovering an Ascender deployment.
- [Upgrade Considerations](upgrade-considerations): what to check before upgrading.
- [Troubleshooting](troubleshooting) and [Tips and Tricks](tips-and-tricks): diagnosing common problems.
