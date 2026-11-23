---
title: Ascender Tips and Tricks
description: Practical tips for administering Ascender, from admin passwords and jump hosts to launching jobs with curl, callback plugins, and inventory imports.
weight: 99
---

## Using the Ascender CLI Tool

Ascender has a full-featured command line interface. Refer to the [Ascender Command Line Interface](https://github.com/ctrliq/ascender-kit/) documentation for configuration and usage instructions.

## Changing the Ascender Admin Password

During the installation process, you are required to enter an administrator password which is used for the `admin` superuser/first user created in Ascender. If you need to change this password at any point, you can rerun the installer with the new password, or run the following command on the Ascender Web container:

```bash
ascender-web update_password --username admin --password '<new password>'
```

The command does not prompt for the password. To keep the password off the command line, leave out `--password` and set the `ASCENDER_USER_PASSWORD` environment variable for the command instead. After that, the password you have entered will work as the admin password in the web UI.

To set policies for password validation, see [Password policies](../security-best-practices#password-policies) for detail.

## Creating an Ascender Admin from the commandline

Once in a while you may find it helpful to create an admin (superuser) account from the commandline. To create an admin, run the following command on the Ascender Web container, with the new admin's password in the `ASCENDER_SUPERUSER_PASSWORD` environment variable:

```bash
ASCENDER_SUPERUSER_PASSWORD='<password>' ascender-web createsuperuser --username <username> --email <email address>
```

The command does not prompt for anything. If `ASCENDER_SUPERUSER_PASSWORD` is not set, the admin is created but cannot log in until a password is set with `ascender-web update_password`.

## Setting up a jump host to use with Ascender

Credentials supplied by Ascender will not flow to the jump host via ProxyCommand. They are only used for the end-node once the tunneled connection is set up.

To make this work, configure a fixed user/keyfile in the Ascender user's SSH config in the ProxyCommand definition that sets up the connection through the jump host. For example:

```text
Host tampa
Hostname 10.100.100.11
IdentityFile [privatekeyfile]

Host 10.100..
Proxycommand ssh -W [jumphostuser]@%h:%p tampa
```

You can also add a jump host to your Ascender instance through Inventory variables. These variables can be set at either the inventory, group, or host level. To add this, navigate to your inventory and in the `variables` field of whichever level you choose, add the following variables:

```yaml
ansible_user: <user_name>
ansible_connection: ssh
ansible_ssh_common_args: '-o ProxyCommand="ssh -W %h:%p -q <user_name>@<jump_server_name>"'
```

## View Ansible outputs for JSON commands when using Ascender

When working with Ascender, you can use the API to obtain the Ansible outputs for commands in JSON format.

To view the Ansible outputs, browse to:

```text
https://<ascender server name>/api/v2/jobs/<job_id>/job_events/
```

## Locate and configure the Ansible configuration file

While Ansible does not require a configuration file, OS packages often include a default one in `/etc/ansible/ansible.cfg` for possible customization. In order to use a custom `ansible.cfg` file, place it at the root of your project. Ascender runs `ansible-playbook` from the root of the project directory, where it will then find the custom `ansible.cfg` file. An `ansible.cfg` anywhere else in the project will be ignored.

To learn which values you can use in this file, refer to the [configuration file on GitHub](https://github.com/ansible/ansible/blob/devel/examples/ansible.cfg).

Using the defaults is acceptable for starting out, but know that you can configure the default module path or connection type here, as well as other things.

Ascender overrides some `ansible.cfg` options. For example, Ascender stores the SSH ControlMaster sockets, the SSH agent socket, and any other per-job run items in a per-job temporary directory that is passed to the container used for job execution.

## View a listing of all `ansible_` variables

Ansible by default gathers "facts" about the machines under its management, accessible in Playbooks and in templates. To view all facts available about a machine, run the `setup` module as an ad hoc action:

```bash
ansible -m setup hostname
```

This prints out a dictionary of all facts available for that particular host. For more information, refer to the [Ansible documentation on facts](https://docs.ansible.com/ansible/playbooks_variables.html#information-discovered-from-systems-facts).

## The ALLOW_JINJA_IN_EXTRA_VARS variable

Setting `ALLOW_JINJA_IN_EXTRA_VARS = template` only works for saved job template extra variables. Prompted variables and survey variables are excluded from the 'template'. This parameter has three values: `template` to allow usage of Jinja saved directly on a job template definition (the default), `never` to disable all Jinja usage (recommended), and `always` to always allow Jinja (strongly discouraged, but an option for prior compatibility).

This parameter is configurable in the Jobs Settings screen of the Ascender UI:

![Jobs settings Edit Details page with the When can extra variables contain Jinja templates field set to Template](/assets/images/settings-jobs-jinja.webp)

## Using execution environments

See [Execution Environments](/user-guide/execution-environments) in the [Ascender user guides](/user-guide).

## Configuring the `ascenderhost` hostname for notifications

In the [System Settings](../configuration#system), you can replace `https://ascenderhost` in the **Base URL of the service** field with your preferred hostname to change the notification hostname.

![Miscellaneous System settings showing the Base URL of the service field](/assets/images/configure-ascender-system-misc-baseurl.webp)

New installations of Ascender should not have to set the hostname for notifications.

## Launching Jobs with curl

Launching jobs with the Ascender API is simple. Here are some easy to follow examples using the `curl` tool.

Assuming that your Job Template ID is '1', your Ascender IP is 192.168.42.100, and that `admin` and `awxsecret` are valid login credentials, you can create a new job this way:

```bash
curl -f -k -H 'Content-Type: application/json' -XPOST \
    --user admin:awxsecret \
    http://192.168.42.100/api/v2/job_templates/1/launch/
```

This returns a JSON object that you can parse and use to extract the 'id' field, which is the ID of the newly created job.

You can also pass extra variables to the Job Template call, such as is shown in the following example:

```bash
curl -f -k -H 'Content-Type: application/json' -XPOST \
    -d '{"extra_vars": {"foo": "bar"}}' \
    --user admin:awxsecret http://192.168.42.100/api/v2/job_templates/1/launch/
```

You can view the live API documentation by logging into `http://192.168.42.100/api/` and browsing around to the various objects available.

<Hint type="note">

The `extra_vars` parameter can be a JSON dictionary, as in the example above, or a string which contains JSON or YAML. When you pass a string, use caution when escaping the quotes, etc.

</Hint>

## Dynamic Inventory and private IP addresses

The Amazon EC2 inventory source runs the `amazon.aws.aws_ec2` inventory plugin, and its **Source variables** are options of that plugin. The plugin's `hostnames` option decides what each instance is named in the inventory. To list your VPC instances by their private IP addresses, perform the following steps:

- In the Ascender interface, select your inventory and click on the **Sources** tab.
- Click on the Amazon EC2 source, and click **Edit**.
- In the **Source variables** box, enter:

  ```yaml
  hostnames:
    - private-ip-address
  ```

Save and sync the source. You should now see your VPC instances listed by their private IP addresses.

<Hint type="note">

Ascender must be running inside the VPC with access to those instances in order to usefully configure them.

</Hint>

## Filtering instances returned by the dynamic inventory sources in Ascender

By default, the dynamic inventory sources in Ascender (AWS, Google, etc) return all instances available to the cloud credentials being used. They are automatically joined into groups based on various attributes. For example, AWS instances are grouped by region, by tag name and value, by security groups, etc. To target specific instances in your environment, write your playbooks so that they target the generated group names. For example:

```yaml
---
- hosts: tag_Name_webserver
  tasks:
  ...
```

You can also use the `Limit` field in the Job Template settings to limit a playbook run to a certain group, groups, hosts, or a combination thereof. The syntax is the same as the `--limit` parameter on the ansible-playbook command line.

You may also create your own groups by copying the auto-generated groups into your custom groups. Make sure that the `Overwrite` option is disabled on your dynamic inventory source, otherwise subsequent synchronization operations will delete and replace your custom groups.

## Using an unreleased module from Ansible source with Ascender

If there is a feature that is available in the latest Ansible core branch that you would like to leverage with your Ascender system, making use of it in Ascender is fairly simple.

First, determine which is the updated module you want to use from the available Ansible Core Modules or Ansible Extra Modules GitHub repositories.

Next, create a new directory, at the same directory level of your Ansible source playbooks, named `/library`.

Once this is created, copy the module you want to use and drop it into the `/library` directory. It will be consumed first over your system modules and can be removed once you have updated the stable version via your normal package manager.

## Using callback plugins with Ascender

Ansible has a flexible method of handling actions during playbook runs, called callback plugins. You can use these plugins with Ascender to do things like notify services upon playbook runs or failures, send emails after every playbook run, etc. For official documentation on the callback plugin architecture, refer to the [Ansible callback plugin documentation](http://docs.ansible.com/developing_plugins.html#callbacks).

<Hint type="note">

Ascender does not support the `stdout` callback plugin because Ansible only allows one, and it is already being used by Ascender for streaming event data.

</Hint>

You may also want to review some example plugins, which should be modified for site-specific purposes, such as those available at [https://github.com/ansible/ansible/tree/devel/lib/ansible/plugins/callback](https://github.com/ansible/ansible/tree/devel/lib/ansible/plugins/callback).

To use these plugins, put the callback plugin `.py` file into a directory called `/callback_plugins` alongside your playbook in your Ascender Project. Then, specify their paths (one path per line) in the **Ansible Callback Plugins** field of the Job settings, located towards the bottom of the screen:

![Jobs settings showing the Ansible Callback Plugins field](/assets/images/configure-ascender-jobs-callback.webp)

<Hint type="note">

To have most callbacks shipped with Ansible applied globally, you must add them to the `callback_whitelist` section of your `ansible.cfg`. If you have custom callbacks, refer to the Ansible documentation for [Enabling callback plugins](https://docs.ansible.com/ansible/latest/plugins/callback.html#enabling-callback-plugins).

</Hint>

## Connecting to Windows with winrm

By default Ascender attempts to `ssh` to hosts. You must add the `winrm` connection info to the group variables to which the Windows hosts belong. To get started, edit the Windows group in which the hosts reside and place the variables in the source/edit screen for the group.

To add `winrm` connection info:

Edit the properties for the selected group by clicking the **Edit** (pencil) icon to the right of the group name that contains the Windows servers. In the "variables" section, add your connection information as such: `ansible_connection: winrm`

Once done, save your edits. If Ansible was previously attempting an SSH connection and failed, you should re-run the job template.

## Importing existing inventory files and host/group vars into Ascender

To import an existing static inventory and the accompanying host and group vars into Ascender, your inventory should be in a structure that looks similar to the following:

```text
inventory/
|-- group_vars
|   `-- mygroup
|-- host_vars
|   `-- myhost
`-- hosts
```

Ascender has no command-line inventory import. To import these hosts and vars, sync them from source control:

1. Commit the inventory directory to a source control repository. If you only have a single flat file of inventory, a file called ansible-hosts, for example, commit that file instead.
2. Create a project for the repository.
3. Create the inventory, and on its **Sources** tab add a source with the source type **Sourced from a Project**. Select the project, and select the inventory directory or file as the **Inventory file**.
4. Save the source and sync it.

In case of conflicts, or to make the inventory match the files exactly on each sync, select **Overwrite** and **Overwrite variables** on the source.

For details on inventory sources that use source control, see [Inventory File Importing](../inventory-file-importing). You can also create hosts through the API, for example with `POST /api/v2/bulk/host_create/`.
