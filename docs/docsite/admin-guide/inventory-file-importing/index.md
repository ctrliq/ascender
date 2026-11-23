---
title: Inventory File Importing
description: Source inventory files and dynamic inventory scripts from source control projects instead of creating inventories by hand.
weight: 41
---

Ascender allows you to choose an inventory file from source control, rather than creating one from scratch. This function is the same as custom inventory scripts, except that the contents are obtained from source control instead of editing their contents in the browser. This means the files are non-editable, and as inventories are updated at the source, the inventories within the projects are also updated accordingly, including the `group_vars` and `host_vars` files or directory associated with them. SCM types can consume both inventory files and scripts, the overlap between inventory files and custom types in that both do scripts.

Any imported hosts will have a description of "imported" by default. This can be overridden by setting the `_awx_description` variable on a given host. For example, if importing from a sourced .ini file, you could add the following host variables:

```ini
[main]
127.0.0.1 _awx_description="my host 1"
127.0.0.2 _awx_description="my host 2"
```

Similarly, group descriptions also default to "imported", but can be overridden by the `_awx_description` as well.

In order to use old inventory scripts in source control, see [Export old inventory scripts](/user-guide/inventories#export-old-inventory-scripts) in the [Ascender user guides](/user-guide) for detail.

## Custom Dynamic Inventory Scripts

A custom dynamic inventory script stored in version control can be imported and run. This makes it much easier to make changes to an inventory script — rather than having to copy and paste one into Ascender, it is pulled directly from source control and then executed. The script must be written to handle any credentials needed for doing its work and you are responsible for installing any Python libraries needed by the script (which is the same requirement for custom dynamic inventory scripts). The script runs in the execution environment used by the inventory source, so those libraries must be installed in that execution environment's image.

You can specify environment variables when you edit the SCM inventory source itself. For some scripts, this will be sufficient; however, this is not a secure way to store secret information that gives access to cloud providers or inventory.

The better way is to create a new credential type for the inventory script you are going to use. The credential type will need to specify all the necessary types of inputs. Then, when you create a credential of this type, the secrets will be stored in an encrypted form. If you apply that credential to the inventory source, the script will have access to those inputs like environment variables or files.

For more detail, refer to [Credential Types](/user-guide/credential-types).

## SCM Inventory Source Fields

The source fields used are:

- `source_project`: project to use
- `source_path`: relative path inside the project indicating a directory or a file. If left blank, "" is still a relative path indicating the root directory of the project
- `source_vars`: if set on a "file" type inventory source then they will be passed to the environment vars when running

An update of the project does not update the inventory sources that use it. Sync the inventory source, give it a schedule, or select **Update on launch** on it; each sync of the source brings the project up to date first. Neither inventory nor project updates are blocked while a related job is running. In cases where you have a big project (around 10 GB), disk space on `/tmp` may be an issue.

You can specify a location manually in the Ascender user interface from the Create Inventory Source page. Refer to the [Inventories](/user-guide/inventories) section of the [Ascender user guides](/user-guide) for instructions on creating an inventory source.

The listing of inventory files offered for a project is refreshed to the latest SCM info on every successful sync of the project, whether or not any inventory source uses the project.

For inventories with SCM sources, the Job Details page for inventory updates shows a status indicator for the project update as well as the name of the project. The status indicator links to the project update job. The project name links to the project.

![Job Details page for an inventory update from an SCM source, showing the project update status and project name](/assets/images/jobs-details-scm-sourced-inventories.webp)

An inventory update can be performed while a related job is running.

### Supported File Syntax

Ascender uses the `ansible-inventory` module from Ansible to process inventory files, and supports all valid inventory syntax that Ascender requires.
