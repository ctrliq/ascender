---
title: Troubleshooting Ascender
description: Built-in troubleshooting settings, extra_settings for error logging, and fixes for common Ascender connection, playbook, job, and inventory problems.
weight: 98
---

Some troubleshooting tools are built into the Ascender user interface that may help you address some issues you might encounter. To access these tools, navigate to **Settings** and select **Troubleshooting**.

![Settings page with the Troubleshooting option highlighted](/assets/images/settings-troubleshooting-highlighted.webp)

The options available are:

- **Enable or Disable tmp dir cleanup**: choose whether you want to clean up the `tmp` directory.
- **Release Receptor Work**: disables cleaning up job pods. If you disable this, the job pods will remain in your cluster indefinitely, allowing you to examine them post-run. If you are missing data there, run `kubectl logs <job-pod-name>` and provide the logs in an issue report.

Click **Edit** to modify the settings. Use the toggle to enable and disable the appropriate settings.

## Error logging and extra settings

Ascender server errors are streamed and not logged; however, you may be able to pass them in on the Ascender spec file.

With `extra_settings`, you can pass multiple custom settings via the Ascender Operator. The operator writes them, after its own settings, into the JSON settings file that both the web and task containers read (`ASCENDER_SETTINGS_FILE`), kept in the `<name>-app-credentials` secret, where `<name>` is the name of the Ascender resource.

Each entry names a setting that Ascender registers (the ones listed under `/api/v2/settings/all/`) and gives a value the API would accept for it. Each value is validated like a change through the API. A setting that fails validation, or that Ascender does not read, is skipped with a `settings file: setting ignored` line in the web and task containers' logs naming the setting and the reason, and keeps the value stored in the database.

| Name | Description | Default |
| --- | --- | --- |
| `extra_settings` | Extra settings | `''` |

Parameters configured in `extra_settings` are set as read-only settings in Ascender. As a result, they cannot be changed in the UI after deployment. If you need to change the setting after the initial deployment, you need to change it on the Ascender CR spec.

Example configuration of the `extra_settings` parameter:

```yaml
spec:
  extra_settings:
    - setting: SESSION_COOKIE_AGE
      value: 3600

    - setting: AUTH_LDAP_BIND_DN
      value: "cn=admin,dc=example,dc=com"

    - setting: LOG_AGGREGATOR_LEVEL
      value: DEBUG
```

Give each value as the API takes it: a number, a string, a boolean, or a list or dictionary of those.

## Problems connecting to your host

If you are unable to run the `helloworld.yml` example playbook from the [Quick Start](/user-guide/quick-start) or other playbooks due to host connection errors, try the following:

- Can you `ssh` to your host? Ansible depends on SSH access to the servers you are managing.
- Are your hostnames and IPs correctly added in your inventory file? (Check for typos.)

## Problems running a playbook

If you are unable to run the `helloworld.yml` example playbook from the [Quick Start](/user-guide/quick-start) or other playbooks due to playbook errors, try the following:

- Are you authenticating with the user currently running the commands? If not, check how the username has been set up or pass the `--user=username` or `-u username` commands to specify a user.
- Is your YAML file correctly indented? You may need to line up your whitespace correctly. Indentation level is significant in YAML. You can use `yamlint` to check your playbook. For more information, refer to the [YAML primer](http://docs.ansible.com/YAMLSyntax.html).
- Items beginning with a `-` are considered list items or plays. Items with the format of `key: value` operate as hashes or dictionaries. Ensure you don't have extra or missing `-` plays.

## Problems when running a job

If you are having trouble running a job from a playbook, you should review the playbook YAML file. When importing a playbook, either manually or via a source control mechanism, keep in mind that the host definition is controlled by Ascender and should be set to `hosts: all`.

## Playbooks aren't showing up in the "Job Template" drop-down

If your playbooks are not showing up in the Job Template drop-down list, here are a few things you can check:

- Make sure that the playbook is valid YML and can be parsed by Ansible.
- Make sure the playbooks has a "hosts:" section.

## Playbook stays in pending

If you are attempting to run a playbook Job and it stays in the "Pending" state indefinitely, try the following:

- Check **Administration** > **Instances** to make sure your instances are online, with a status of **Ready**, and have enough available capacity to run jobs. See [Managing Capacity With Instances](../instances#manage-instances).
- Check to ensure that the `/var/` partition has more than 1 GB of space available. Jobs will not complete with insufficient space on the `/var/` partition.

## Reusing an external database causes installations to fail

Instances have been reported where reusing the external DB during subsequent installation of nodes causes installation failures.

For example, say that you performed a clustered installation. Next, say that you needed to do this again and performed a second clustered installation reusing the same external database, only this subsequent installation failed.

When setting up an external database which has been used in a prior installation, the database used for the clustered node must be manually cleared before any additional installations can succeed.

## Private EC2 VPC Instances in the Ascender Inventory

An Amazon EC2 inventory source runs the `amazon.aws.aws_ec2` inventory plugin. By default, the plugin names each host by its public DNS name, or by its private DNS name when it has no public one. To name your VPC instances by their private IP addresses instead, perform the following steps:

1. In the Ascender interface, select your inventory and click the **Sources** tab.
2. Click the Amazon EC2 source, and click **Edit**.
3. In the **Source variables** box, enter:

   ```yaml
   hostnames:
     - private-ip-address
   ```

Next, click **Save** and then sync the source. Once this is done, the hosts in the inventory are named by their private IP addresses.

<Hint type="note">

Ascender must be running inside the VPC with access to those instances if you want to configure them.

</Hint>

## Troubleshooting "Error: provided hosts list is empty"

If you receive the message "Skipping: No Hosts Matched" when you are trying to run a playbook through Ascender, here are a few things to check:

- Make sure that your hosts declaration line in your playbook matches the name of your group/host in inventory exactly (these are case sensitive).
- If it does match and you are using Ansible Core 2.0 or later, check your group names for spaces and modify them to use underscores or no spaces to ensure that the groups can be recognized.
- Make sure that if you have specified a Limit in the Job Template that it is a valid limit value and still matches something in your inventory. The Limit field takes a pattern argument, described in the [Ansible patterns documentation](http://docs.ansible.com/intro_patterns.html).

Please file a support ticket if you still run into issues after checking these options.
