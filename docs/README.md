# Ascender documentation

How Ascender works and how to run it. Deployment and configuration are in
[deploy/README.md](../deploy/README.md). The installation, administration
and user guides are the documentation site in `docsite/`, which
`ascender-web` serves under `/docs/` (see
[The documentation site](development/README.md#the-documentation-site)).

## Start here

- [Overview](overview.md): the Ansible concepts Ascender builds on, and the
  processes it runs as
- [Developing Ascender](development/README.md): running from source, the
  checks and the tests
- [Building the images](build_images.md) and [releasing](release_process.md)

## Running jobs

- [Tasks](tasks.md): what the task process does, and its periodic work
- [Task manager](task_manager_system.md): claiming, blocking rules,
  dependencies and placement
- [Ansible runner integration](ansible_runner_integration.md): how a run is
  started, its private data directory and the callback plugin
- [Job events](job_events.md) and the [job monitor lease](job_monitor_lease.md)
- [Fact cache](fact_cache.md)
- [Prompting](prompting.md), [schedules](schedules.md),
  [workflows](workflow.md), [job slicing](job_slicing.md),
  [branch override](job_branch_override.md) and
  [relaunch by host status](retry_by_status.md)
- [Bulk API](bulk_api.md)

## Clusters and execution

- [Clustering](clustering.md), [capacity](capacity.md) and
  [instance groups on inventory sources](inventory_source_instance_groups.md)
- [Container groups](container_groups/README.md)
- [Execution environments](execution_environments.md)
- [Websockets](websockets.md) and [subsystem metrics](subsystem_metrics.md)

## Content

- [Inventories](inventory/README.md): smart, constructed, federated and SCM
  inventories, inventory plugins
- [Credentials](credentials/README.md): lookup plugins, custom types,
  multiple credentials
- [Collections and roles](collections.md) and
  [project signing](project_signing.md)
- [Copying resources](resource_copy.md) and [named URLs](named_url.md)

## Access and administration

- [Authentication](auth/README.md): LDAP, SAML, OIDC, Entra ID, sessions and
  OAuth2 tokens
- [Role-based access control](rbac.md)
- [Settings](settings.md), [CORS](cors.md)
- [Notifications](notification_system.md) and
  [external logging](logging_integration.md)
- [Debugging](debugging/README.md)
