# Execution Environments

Jobs, ad hoc commands, inventory updates and project updates run in containers, for
environment consistency and security. Compliant images are referred to as Execution
Environments (EEs). System jobs are the exception: they run inside `ascender-task` itself.

For more information about the EE technology as well as how to build and test EEs, see:
- [Getting started with Execution Environments guide](https://ansible.readthedocs.io/en/latest/getting_started_ee/index.html)
- [Ansible Builder documentation](https://ansible.readthedocs.io/projects/builder/en/latest/)

The Execution Environment model has an `image` field for the image reference that jobs will
use, a `pull` option (`always`, `missing`, `never`, or empty for the container runtime's
default), and an optional Container Registry `credential` used to pull the image. The job
details view links to the execution environment that the job used.

## Creating and using EEs

Users with an organization's `execution_environment_admin_role` can create new EEs in that
organization, and change or delete them. The RBAC rules follow the standard rules for
org-scoped resources. The organization of an EE cannot be changed once it is created.

EEs without an organization (null in the API) are global EEs. Only superusers can create,
change or delete global EEs. Global EEs can become the default for jobs, as described below.

EEs with `managed` set are created by `register_default_execution_environments` (below).
They cannot be deleted, and only their `pull` field can be changed.

### Pre-created EEs

Installers should run `ascender-web register_default_execution_environments` to populate the
system with the EEs the settings file names (`src/internal/api/manage.go`). It creates or
updates, by name:

 - the global job EEs: each `{"name": ..., "image": ...}` entry of the
   `GLOBAL_JOB_EXECUTION_ENVIRONMENTS` setting (default: "Ascender EE (latest)",
   `ghcr.io/ctrliq/ascender-ee:latest`);
 - the control plane EE, "Control Plane Execution Environment", with the image of the
   `CONTROL_PLANE_EXECUTION_ENVIRONMENT` setting (default `ghcr.io/ctrliq/ascender-ee:latest`),
   which is `managed`.

Both settings are read from the settings file (`ASCENDER_SETTINGS_FILE`); they are not stored
in the database. All EEs created by this command are global. With `--registry-url`,
`--registry-username` and a password (`--registry-password` or the environment variable
`ASCENDER_REGISTRY_PASSWORD`), the command also creates or updates a Container Registry
credential and attaches it to all of them; `--verify-ssl` sets that credential's certificate
verification (default true).

These EEs are critical for system function: project updates need the control plane EE, and
jobs need an EE to fall back to. The command is safe to run again, for example after
changing the settings.

### Project Update EE Precedence

Project updates always use the control plane EE: the most recently created global, managed
EE.

### Job and Ad Hoc Command EE Precedence

Jobs and ad hoc commands use the first available execution environment in this list
(`resolveExecutionEnvironment` in `src/internal/tasks/job.go`):

1. the `execution_environment` given when the job was launched, if the template prompts for it
2. the `execution_environment` defined on the job template
3. the `default_environment` defined on the project that the job uses
4. the `default_environment` defined on the organization of the job
5. the `default_environment` defined on the organization of the inventory the job uses
6. the `DEFAULT_EXECUTION_ENVIRONMENT` setting (configurable at `/api/v2/settings/system/`)
7. the most recently created global, unmanaged EE whose image is listed in
   `GLOBAL_JOB_EXECUTION_ENVIRONMENTS`
8. the most recently created global, unmanaged EE

Steps 6 to 8 are `DefaultExecutionEnvironmentID` (`src/internal/api/ee_resolve.go`); the
`resolved_environment` summary field of job templates, inventory sources and workflow approval
templates is resolved the same way.

A job that ends up with no EE fails with "Job could not start because no Execution
Environment could be found."

### Inventory Update EE Precedence

Inventory updates use the first available execution environment in this list
(`ResolveSourceEnvironment` in `src/internal/api/inventory_source_write.go`):

1. for a constructed inventory, the control plane EE
2. the `execution_environment` defined on the inventory source
3. the `default_environment` defined on the inventory source's organization
4. the `DEFAULT_EXECUTION_ENVIRONMENT` setting, then the global EE as in steps 7 and 8 above

Project updates, and updates of constructed inventories, use the control plane EE: the most
recently created global, managed EE. A project's `resolved_environment` summary field is that
EE too; the project's `default_environment` is for the jobs that use it.

## Where the EE runs

- On a hybrid node, `ascender-task` starts the container itself with podman or docker
  (`ASCENDER_CONTAINER_RUNTIME`; podman when it is installed), passing `--pull=<pull>` to
  podman (docker pulls the image before the run) and the `DEFAULT_CONTAINER_RUN_OPTIONS`
  setting. The registry credential is written to an auth file for the pull.
- On an execution node, `ansible-runner worker` starts it with podman, with the same `pull`
  option, run options and registry credential, sent with the work unit.
- In a container group, the EE's image becomes the image of the job pod's first container,
  `pull` its `imagePullPolicy`, and the registry credential an image pull secret (see
  [Container Groups](./container_groups/README.md)).
- On Kubernetes (`IS_K8S`), project updates run in the control plane EE as `local` work of the
  receptor beside `ascender-task`.

## Image cleanup

Outside Kubernetes, when an EE is deleted or its image changed and no EE names the old image
any more, every `ascender-task` untags that image on its node, and one control node has the
ready execution nodes do the same over the mesh. Every three hours each `ascender-task` also
prunes dangling images on its node, and that one control node has the execution nodes prune
theirs (`src/internal/tasks/cleanup_images.go`, `src/internal/tasks/cleanup_remote.go`).
