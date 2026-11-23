---
title: Overview
description: An overview of the main features of Ascender, from real-time playbook output and RBAC to workflows, notifications, and secret management.
weight: 2
---

Thank you for your interest in Ascender. Ascender makes it possible for users across an organization to share, vet, and manage automation content by means of a simple, powerful, and agentless technical implementation. IT managers can provide guidelines on how automation is applied to individual teams. Meanwhile, automation developers retain the freedom to write tasks that use existing knowledge, without the operational overhead of conforming to complex tools and frameworks. It is a more secure and stable foundation for deploying end-to-end automation solutions, from hybrid cloud to the edge.

Ascender allows users to define, operate, scale, and delegate automation across their organization.

## Real-time Playbook Output and Exploration

Watch playbooks run in real time, seeing each host as they check in. Easily go back and explore the results for specific tasks and hosts in great detail. Search for specific plays or hosts and see just those results, or quickly zero in on errors that need to be corrected.

## "Push Button" Automation

Access your favorite projects and re-trigger execution from the web interface with a minimum of clicking. Ascender will ask for input variables, prompt for your credentials, kick off and monitor the job, and display results and host history over time.

## Enhanced and Simplified Role-Based Access Control and Auditing

Ascender allows for the granting of permissions to perform a specific task (such as to view, create, or modify a file) to different teams or explicit users through role-based access control (RBAC).

Keep some projects private, while allowing some users to edit inventory and others to run playbooks against only certain systems—either in check (dry run) or live mode. You can also allow certain users to use credentials without exposing the credentials to them. Regardless of what you do, Ascender records the history of operations and who made them—including objects edited and jobs launched.

Permissions are assigned directly on the objects they cover. To let a user or team use a job template, assign them a role on the job template itself; they do not also need permissions on its inventory, project, and credentials. Credentials are objects in Ascender's RBAC system of their own, and can be assigned to any number of users and teams.

Ascender includes an 'Auditor' type, who can see all aspects of the systems automation, but has no permission to run or change automation, for those that need a system-level auditor. (This may also be useful for a service account that scrapes automation information from the REST API.) Refer to [Role-Based Access Controls](../security#role-based-access-controls) for more information.

Subsequent releases of Ascender provide more granular permissions, making it easier to delegate inside your organizations and remove automation bottlenecks.

## Cloud & Autoscaling Flexibility

Ascender features a powerful provisioning callback feature that allows nodes to request configuration on demand. While optional, this is an ideal solution for a cloud auto-scaling scenario, integrating with provisioning servers like Cobbler, or when dealing with managed systems with unpredictable uptimes. Requiring no management software to be installed on remote nodes, the callback solution can be triggered via a simple call to `curl` or `wget`, and is easily embeddable in init scripts, kickstarts, or preseeds. Access is controlled such that only machines in inventory can request configuration.

## The Ideal RESTful API

The Ascender REST API is the ideal RESTful API for a systems management application, with all resources fully discoverable, paginated, searchable, and well modeled. A styled API browser allows API exploration from the API root at `http://<server name>/api/`, showing off every resource and relation. Everything that can be done in the user interface can be done in the API - and more.

## Backup and Restore

Ascender is backed up and restored through the Ascender Operator, which captures the database, the secrets that encrypt it, and the deployment configuration. See [Backup](/admin-guide/backup).

## Ansible Galaxy Integration

When it comes to describing your automation, everyone repeats the DRY mantra—"Don't Repeat Yourself." Using centralized copies of Ansible roles, such as in Ansible Galaxy, allows you to bring that philosophy to your playbooks. By including an Ansible Galaxy `requirements.yml` file in your project directory, Ascender automatically fetches the roles your playbook needs from Galaxy, GitHub, or your local source control. Refer to [Ansible Galaxy Support](../projects#ansible-galaxy-support) for more information.

## Inventory Support for OpenStack

Ansible is committed to making OpenStack simple for everyone to use. As part of that, dynamic inventory support has been added for OpenStack. This allows you to easily target any of the virtual machines or images that you're running in your OpenStack cloud.

## Remote Command Execution

Often times, you just need to do a simple task on a few hosts, whether it's add a single user, update a single security vulnerability, or restart a misbehaving service. Ascender includes remote command execution—any task that you can describe as a single Ansible play can be run on a host or group of hosts in your inventory, allowing you to get managing your systems quickly and easily. Plus, it is all backed by an RBAC engine and detailed audit logging, removing any questions regarding who has done what to what machines.

## System Tracking

You can collect facts by using the fact caching feature. Refer to [Fact Caching](../job-templates#fact-caching) for more detail.

## Integrated Notifications

Ascender allows you to easily keep track of the status of your automation. You can configure stackable notifications for job templates, projects, or entire organizations, and configure different notifications for job start, job success, job failure, and job approval (for workflow nodes). The following notification sources are supported:

- Email
- Grafana
- IRC
- Matrix
- Mattermost
- PagerDuty
- Rocket.Chat
- Slack
- Twilio
- Webhook (post to an arbitrary webhook, for integration into other tools)

Additionally, you can [customize notification messages](../notifications#create-custom-notifications) for each of the above notification types.

## Satellite Integration

Dynamic inventory sources for Red Hat Satellite 6 are supported.

## Run-time Job Customization

Bringing the flexibility of the Ansible command line, you can now prompt for any of the following:

- inventory
- credential
- job tags
- limits

## Enhanced User Interface

The layout of the user interface is organized with intuitive navigational elements. With information displayed at-a-glance, it is intuitive to find and use the automation you need. Compact and expanded viewing modes show and hide information as needed, and various built-in attributes make it easy to sort.

## Custom Virtual Environments

Custom Ansible environment support allows you to have different Ansible environments and specify custom paths for different teams and jobs.

## Authentication Enhancements

Ascender supports LDAP, SAML, and token-based authentication. Enhanced LDAP and SAML support allows you to integrate your enterprise account information in a more flexible manner. Token-based authentication allows for easy authentication of third-party tools and services with Ascender via integrated OAuth 2 token support.

## Cluster Management

Run-time management of cluster groups allows for easily configurable scaling.

## Container Platform Support

Ascender is available as a containerized pod service for Kubernetes environments that can be scaled up and down easily as needed.

## Workflow Enhancements

In order to better model your complex provisioning, deployment, and orchestration workflows, Ascender expanded workflows in a number of ways:

- **Inventory overrides for Workflows**. You can now override an inventory across a workflow at workflow definition time, or even at launch time. Define your application deployment workflow, and then easily re-use them in multiple environments.
- **Convergence nodes for Workflows**. When modeling complex processes, you sometimes need to wait for multiple steps to finish before proceeding. Now Ascender workflows can easily replicate this; workflow steps can now wait for any number of prior workflow steps to complete properly before proceeding.
- **Workflow Nesting**. Re-use individual workflows as components of a larger workflow. Examples include combining provisioning and application deployment workflows into a single master workflow.
- **Workflow Pause and Approval**. You can build workflows containing approval nodes that require user intervention. This makes it possible to pause workflows in between playbooks so that a user can give approval (or denial) for continuing on to the next step in the workflow.

## Job Distribution

As automation moves enterprise-wide, the need to automate at scale grows. Ascender offers the ability to take a fact gathering or configuration job running across thousands of machines and slice it into individual job slices that can be distributed across your Ascender cluster for increased reliability, faster job completion, and better cluster utilization. If you need to change a parameter across 15,000 switches at scale, or gather information across your multi-thousand-node RHEL estate, you can now do so easily.

## Support for deployment in a FIPS-enabled environment

If you require running your environment in restricted modes such as FIPS, Ascender deploys and runs in such environments.

## Limit the number of hosts per organization

Lots of large organizations have instances shared among many organizations, and do not want any one organization using all the hosts. A superuser can set an upper limit on an organization by writing `max_hosts` through the API, at `/api/v2/organizations/N/`; there is no field for it in the web interface. Bulk host creation refuses to take an organization past that limit.

## Inventory Plugins

Ascender's cloud inventory sources use the following inventory plugins from upstream collections:

- `amazon.aws.aws_ec2`
- `community.vmware.vmware_vm_inventory`
- `azure.azcollection.azure_rm`
- `google.cloud.gcp_compute`
- `theforeman.foreman.foreman`
- `openstack.cloud.openstack`
- `cloud.terraform.terraform_state`
- `ctrliq.ascender.controller`

## Secret Management System

With a secret management system, external credentials are stored and supplied for use in Ascender so you don't have to provide them directly. See [Secret Management System](../secret-management).
