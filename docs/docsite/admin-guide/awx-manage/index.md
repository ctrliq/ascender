---
title: Command-Line Administration
description: Run the ascender-web setup and node management commands, and find the API and management job equivalents of the older awx-manage commands.
weight: 80
---

Ascender has no `awx-manage` utility. The commands an installation is set up and maintained with are subcommands of the `ascender-web` binary, the program in the web container. `ascender-web help` lists them.

Each command is one run of the binary, with the same environment as the web server: the database connection, the secret key, and the settings file. The setup commands are safe to repeat. The Ascender Operator runs the setup commands (`migrate`, `createsuperuser`, `register_default_execution_environments`, and `create_preload_data`) itself, in its migration job, when it installs or upgrades Ascender.

## Running a command

The web image has no shell, so run the binary directly in the web container. With the Ascender installer's defaults, the namespace is `ascender` and the web deployment is `ascender-app-web`:

```bash
kubectl -n ascender exec deployment/ascender-app-web -- ascender-web help
```

Use your `ASCENDER_NAMESPACE` instead of `ascender` if you changed it. The containers run as the `ascender` user (uid 1000).

## Commands

| Command | What it does |
| --- | --- |
| `migrate` | Creates the schema in an empty database, checks that an existing one is at the level this version needs, and applies this version's own migrations, waiting for them |
| `createsuperuser --username NAME [--email ADDRESS] [--if-missing]` | Creates a system administrator. It never prompts: the password is read from the `ASCENDER_SUPERUSER_PASSWORD` environment variable, and without one the account cannot log in until it is given a password. With `--if-missing`, a user of that name is left as it is |
| `update_password --username NAME [--password PASSWORD]` | Sets a user's password, read from `ASCENDER_USER_PASSWORD` when `--password` is not given, and ends every session of that user |
| `register_default_execution_environments [--registry-url URL --registry-username NAME --registry-password PASSWORD] [--verify-ssl BOOL]` | Creates or updates the default execution environments named in the deployment's settings, with a registry credential when one is given. The registry password may come from `ASCENDER_REGISTRY_PASSWORD` |
| `create_preload_data` | Creates the Default organization and the Ansible Galaxy credential in an installation that has none |
| `provision_instance --hostname NAME [--node_type TYPE]` | Registers a node: `hop`, `execution`, `control`, or `hybrid` (the default) |
| `register_queue --queuename NAME [--instance_percent N] [--instance_minimum N] [--hostnames NAME,...]` | Creates an instance group, or updates its policy, and adds the named instances to it |
| `add_receptor_address --instance NAME --address ADDRESS [--port N] [--protocol PROTOCOL] [--websocket_path PATH] [--is_internal] [--canonical] [--peers_from_control_nodes]` | Adds a receptor address to a registered node. The protocol is `tcp` (the default), `ws`, or `wss` |
| `deprovision_instance --hostname NAME` | Removes a node |
| `rotate_workload_identity_key [--keep N]` | Starts signing [workload identity](../workload-identity) tokens with a new key |

The task container has one command of its own, `ascender-task check_instance_ready`, which exits with status 0 when the node's instance is ready. The operator's readiness probe for the task container runs it.

## Resetting a password

To set a user's password, for example the administrator's:

```bash
kubectl -n ascender exec deployment/ascender-app-web -- \
  ascender-web update_password --username admin --password '<new password>'
```

A password given with `--password` shows in the process list and in your shell history. In a Kubernetes Job, give it in the `ASCENDER_USER_PASSWORD` environment variable instead, from a secret, and leave out `--password`.

## Inventory import

There is no command-line inventory import. To import an inventory file, script, or directory, keep it in a project and add an inventory source that reads it from the project; see [Inventory File Importing](../inventory-file-importing). Each sync of the source imports the inventory.

## Cleanup of old data

Old data is cleaned up with the [Management Jobs](../management-jobs), which you can launch or schedule:

- **Cleanup Job Details** permanently deletes the job details and job output for jobs older than a specified number of days.
- **Cleanup Activity Stream** permanently deletes any [Activity Stream](/user-guide/user-interface#activity-stream) data older than a specified number of days.

## Cluster management

`provision_instance`, `register_queue`, `add_receptor_address`, and `deprovision_instance` register and remove nodes and instance groups from outside the API. Each task container registers its own node when it starts, so these are only needed for nodes Ascender does not run itself. To add execution and hop nodes, see [Managing Capacity With Instances](../instances).

<Hint type="note">

Do not run the cluster management commands unless instructed by CIQ Support.

</Hint>

## Token and session management

OAuth 2 tokens are managed through the API and the user interface; see [Token-Based Authentication](../authentication/oauth2-tokens).

- **Create a token**: users create their own personal access tokens from the **Tokens** tab of their user details, or with `POST /api/v2/users/<id>/personal_tokens/`. See [Applications](/user-guide/applications) for tokens issued to an application.
- **Revoke a token**: delete it from its details in the **Tokens** tab, or send `DELETE /api/v2/tokens/<id>/`. An application can also revoke a token by its value at `/api/o/revoke_token/`.
- **Clear expired tokens**: the **Cleanup Expired OAuth 2 Tokens** management job deletes expired access tokens that no refresh token points at, and refresh tokens that were revoked, or whose access token expired, longer ago than the refresh token lifetime. A new installation runs it weekly.
- **End a user's sessions**: changing a user's password, in the user interface, through the API, or with `update_password`, logs that user out of every session. A user who changes their own password stays logged in to the session they changed it from.
- **Clear expired sessions**: Ascender deletes expired sessions every five minutes. The **Cleanup Expired Sessions** management job deletes them on demand.

## Host metrics

The number of unique hosts automated is reported by the **Host Metrics** page and by the API, at `/api/v2/host_metrics/` for each host and `/api/v2/host_metric_summary_monthly/` for each month.
