---
title: Best Practices
description: Recommendations for source control, inventory, variables, scaling, and CI/CD integration when automating with Ascender.
weight: 85
---

## Use Source Control

While Ascender supports playbooks stored directly on the server, best practice is to store your playbooks, roles, and any associated details in source control. This way you have an audit trail describing when and why you changed the rules that are automating your infrastructure. Plus, it allows for easy sharing of playbooks with other parts of your infrastructure or team.

## Ansible file and directory structure

Please review the [Ansible Tips and Tricks](https://docs.ansible.com/ansible/latest/user_guide/playbooks_best_practices.html) from the Ansible documentation. If creating a common set of roles to use across projects, these should be accessed via source control submodules, or a common location such as `/opt`. Projects should not expect to import roles or content from other projects.

<Hint type="note">

Playbooks should not use the `vars_prompt` feature, as Ascender does not interactively allow for `vars_prompt` questions. If you must use `vars_prompt`, refer to and make use of the [Surveys](../job-templates#surveys) functionality.

</Hint>

<Hint type="note">

Playbooks should not use the `pause` feature of Ansible without a timeout, as Ascender does not allow for interactively cancelling a pause. If you must use `pause`, ensure that you set a timeout.

</Hint>

Jobs run use the playbook directory as the current working directory, although jobs should be coded to use the `playbook_dir` variable rather than relying on this.

## Use Dynamic Inventory Sources

If you have an external source of truth for your infrastructure, whether it is a cloud provider or a local CMDB, it is best to define an inventory sync process and use the support for dynamic inventory (including cloud inventory sources). This ensures your inventory is always up to date.

<Hint type="note">

Edits and additions to Inventory host variables persist beyond an inventory sync as long as `--overwrite_vars` is **not** set.

</Hint>

## Variable Management for Inventory

Keeping variable data along with the hosts and groups definitions (see the inventory editor) is encouraged, rather than using `group_vars/` and `host_vars/`. If you use dynamic inventory sources, Ascender can sync such variables with the database as long as the **Overwrite Variables** option is not set.

## Autoscaling

Using the "callback" feature to allow newly booting instances to request configuration is very useful for auto-scaling scenarios or provisioning integration.

## Larger Host Counts

Consider setting "forks" on a job template to larger values to increase parallelism of execution runs. For more information on tuning Ansible, see [the Ansible blog](http://www.ansible.com/blog/ansible-performance-tuning).

## Continuous integration / Continuous Deployment

For a Continuous Integration system, such as Jenkins, to spawn a job, it should make a curl request to a job template. The credentials to the job template should not require prompting for any particular passwords. Refer to the [Ascender CLI documentation](https://github.com/ctrliq/ascender-kit/) for configuration and usage instructions.
