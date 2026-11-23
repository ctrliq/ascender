---
title: Execution Environments
description: Add execution environment container images to Ascender, use them in job templates, customize their mount options, and reference the default environment setup.
weight: 30
---

The ability to build and deploy Python virtual environments for automation has been replaced by Ansible execution environments. Unlike legacy virtual environments, execution environments are container images that make it possible to incorporate system-level dependencies and collection-based content. Each execution environment allows you to have a customized image to run jobs, and each of them contain only what you need when running the job, nothing more.

## Building an Execution Environment

The [Getting started with Execution Environments guide](https://ansible.readthedocs.io/en/latest/getting_started_ee/index.html) will give you a brief technology overview and show you how to build and test your first execution environment in a few easy steps.

## Use an execution environment in jobs

In order to use an execution environment in a job, a few components are required:

- Use the Ascender user interface to specify the execution environment you [build](#building-an-execution-environment) to use in your job templates.
- Depending on whether an execution environment is made available for global use or tied to an organization, you must have the appropriate level of administrator privileges in order to use an execution environment in a job. Execution environments tied to an organization require Organization administrators to be able to run jobs with those execution environments.
- Before running a job or job template that uses an execution environment that has a credential assigned to it, be sure that the credential contains a username, host, and password.

1. Click **Execution Environments** from the left navigation bar of the Ascender user interface.
2. Add an execution environment by selecting the **Add** button.
3. Enter the appropriate details into the following fields:

   - **Name**: Enter a name for the execution environment (required).
   - **Image**: Enter the image name (required). The image name requires its full location (repo), the registry, image name, and version tag in the example format of `repo/project/image-name:tag`, for example `quay.io/ansible/awx-ee:latest`.
   - **Pull**: optionally choose the type of pull when running jobs:
     - **Always pull container before running**: Pulls the latest image file for the container.
     - **Only pull the image if not present before running**: Only pulls latest image if none specified.
     - **Never pull container before running**: Never pull the latest version of the container image.
   - **Description**: optional.
   - **Organization**: optionally assign the organization to specifically use this execution environment. To make the execution environment available for use across multiple organizations, leave this field blank.
   - **Registry credential**: If the image has a protected container registry, provide the credential to access it.

   ![Create new Execution Environment form](/assets/images/ee-new-ee-form-filled.webp)

4. Click **Save**.

Now your newly added execution environment is ready to be used in a job template. To add an execution environment to a job template, specify it in the **Execution Environment** field of the job template, as shown in the example below. For more information on setting up a job template, see [Job Templates](../job-templates) in the [Ascender User Guide](..).

![Job template using newly created Execution Environment](/assets/images/job-template-with-example-ee-selected.webp)

Once you added an execution environment to a job template, you can see those templates listed in the **Templates** tab of the execution environment:

![Templates tab of the Execution Environment showing one job associated with it](/assets/images/ee-details-templates-list.webp)

## Execution environment mount options

Rebuilding an execution environment is one way to add certs, but inheriting certs from the host provides a more convenient solution.

Additionally, you may customize execution environment mount options and mount paths in the **Paths to expose to isolated jobs** field of the Job Settings page, where it supports podman-style volume mount syntax. Refer to the [Podman documentation](https://docs.podman.io/en/latest/markdown/podman-run.1.html#volume-v-source-volume-host-dir-container-dir-options) for detail.

In some cases where the `/etc/ssh/*` files were added to the execution environment image due to customization of an execution environment, an SSH error may occur. For example, exposing the `/etc/ssh/ssh_config.d:/etc/ssh/ssh_config.d:O` path allows the container to be mounted, but the ownership permissions are not mapped correctly.

If you encounter this error, or have upgraded from an older version of Ascender, perform the following steps:

1. Change the container ownership on the mounted volume to `root`.
2. In the **Paths to expose to isolated jobs** field of the Job Settings page, using the current example, expose the path as such:

   ![Jobs Settings page showing Paths to expose to isolated jobs field with defaults](/assets/images/settings-paths2expose-iso-jobs.webp)

<Hint type="note">

The `:O` option is only supported for directories. It is highly recommended that you be as specific as possible, especially when specifying system paths. Mounting `/etc` or `/usr` directly have impact that make it difficult to troubleshoot.

</Hint>

This informs podman to run a command similar to the example below, where the configuration is mounted and the `ssh` command works as expected.

```bash
podman run -v /ssh_config:/etc/ssh/ssh_config.d/:O ...
```

To expose isolated paths in OpenShift or Kubernetes containers as HostPath, assume the following configuration:

![Jobs Settings page showing Paths to expose to isolated jobs field with assumed configuration and Expose host paths for Container Groups toggle enabled](/assets/images/settings-paths2expose-iso-jobs-mount-containers.webp)

Use the **Expose host paths for Container Groups** toggle to enable it.

Once the playbook runs, the resulting Pod spec will display similar to the example below. Note the details of the `volumeMounts` and `volumes` sections.

![Pod spec for the playbook run showing volumeMounts and volumes details](/assets/images/mount-containers-playbook-run-podspec.webp)

## Execution Environment Setup Reference

For detailed information about the execution environment definition, refer to the [Ansible Builder documentation](https://ansible.readthedocs.io/projects/builder/en/latest/definition/#execution-environment-definition).

### Default execution environment for Ascender

An execution environment image can be used inside of an `ansible-runner` project by placing these variables inside the `env/settings` file, inside of the private data directory.

```yaml
---
container_image: image-name
process_isolation_executable: podman # or docker
process_isolation: true
```

The `ctrliq.ascender` collection is a subset of content included in the default Ascender execution environment. More details can be found in the [ascender-ee repository](https://github.com/ctrliq/ascender-ee).
