---
title: User Guide
description: Day-to-day use of Ascender, from the quick start to inventories, credentials, job templates, and workflows.
weight: 3
---

Ascender is an automation platform built on Ansible. It provides a web UI, a REST API, and role-based access control for running and monitoring Ansible automation across teams and environments. These guides cover everyday use of Ascender. For system configuration, see the [Ascender admin guides](/admin-guide).

## Getting Started

- [Quick Start](quick-start): log in, create an inventory, credential, project, and job template, and launch your first job.
- [Overview](overview): the main features of Ascender and how they fit together.
- [User Interface](user-interface): logging in, navigating the UI, and searching.

## Access Control

- [Organizations](organizations): group users, teams, projects, and inventories.
- [Users](users): create users and manage their roles and tokens.
- [Teams](teams): assign permissions to groups of users.

## Credentials and Execution

- [Credentials](credentials): store secrets used to connect to hosts, cloud providers, and source control.
- [Custom Credential Types](credential-types): define your own credential types and how they are injected.
- [Secret Management System](secret-management): look up credentials from external secret stores such as HashiCorp Vault and CyberArk.
- [Applications](applications): OAuth 2 applications for external access to Ascender.
- [Execution Environments](execution-environments): the container images that run your automation.

## Projects and Inventories

- [Projects](projects): connect Ascender to playbooks in source control.
- [Project Signing and Verification](project-signing): verify project content with signed manifests.
- [Inventories](inventories): manage hosts and groups, including smart and constructed inventories.
- [Inventory Plugin Templates](inventory-plugin-templates): example configurations for supported inventory plugins.
- [Labels](labels): tag job templates and workflows, and use labels as pseudo-folders.

## Running Automation

- [Job Templates](job-templates): define and launch playbook runs.
- [Job Slicing](job-slicing): split a job across many hosts into parallel slices.
- [Jobs](jobs): monitor job output, results, and capacity.
- [Workflows](workflows) and [Workflow Job Templates](workflow-templates): chain job templates, approvals, and updates into multi-step workflows.
- [Instance Groups](instance-groups): control where jobs run.
- [Schedules](schedules): run templates and updates on a recurring schedule.

## Integrations and Notifications

- [Webhooks](webhooks): launch job templates from GitHub, GitLab, and Bitbucket Data Center events.
- [Notifications](notifications) and [Notification Attributes](notification-attributes): send job results to email, Slack, webhooks, and more.

## Reference

- [Security](security): role-based access control in depth.
- [Best Practices](best-practices): recommendations for structuring automation in Ascender.
- [REST API](rest-api): browse, query, and authenticate to the Ascender API.
- [Glossary](glossary): Ascender terminology.
