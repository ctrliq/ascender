# SCM Inventory

An inventory source can use content in the source tree of a project as an
Ansible inventory: a file, a directory, a script, or a YAML file that names an
inventory plugin.

## Usage Details

Fields to give when creating an SCM inventory source:

 - `source` - `"scm"`
 - `source_project` - the project to use. It must be a source control
   project ("Cannot use manual project for SCM-based inventory.") and is
   required ("Project required for scm type sources.").
 - `source_path` - the path, relative to the root of the project, of a file
   or directory. In the API it may be left blank, which means the root
   directory of the project.

Optional fields:

 - `scm_branch` - a branch, tag or commit to read the inventory from instead
   of the project's own branch. The project must allow branch override
   ("Project does not allow overriding branch.").
 - `source_vars` - set as environment variables when `ansible-inventory`
   runs. `HOME`, `USER`, `_`, `TERM` and `PATH` cannot be set ("`PATH` is a
   prohibited environment variable").
 - `credential` - a credential whose values are injected, for example a cloud
   credential for a plugin configuration file (see
   [Inventory plugins](./inventory_plugins.md#writing-your-own-inventory-file)).

`source_project`, `source_path` and `scm_branch` are refused on a source that is
not of type `scm` ("Cannot set source_project source_path if not SCM type.").

### RBAC

Choosing a project as the `source_project`, when creating the source or when
changing it to another project, takes the `use` role on the project, since
the inventory runs whatever the repository holds. Creating and editing the
source takes admin of its inventory, and starting a sync takes the
inventory's `update` role. The sync brings the project up to date on its own
(see below) and needs no role on the project for that.

### Inventory File Suggestions

`/api/v2/projects/N/inventories/` lists files in the project that could be
inventory files. The list is refreshed by the project's updates of type
`check` (`InventoryFiles` in `src/internal/models/project_inventories.go`), so
it follows the project's own branch. A file is listed when:

 - it is named `inventory` or `hosts`;
 - its extension is `.ini` (lowercase), or it is executable (an inventory
   script);
 - it has no extension, and one of its first 11 lines starts with a letter, a
   digit, `_`, `.`, `=`, `[` or `]` (the file is read as UTF-8, leaving out
   what does not decode).

Any other file with an extension is not listed: YAML inventories and
inventory plugin configurations (`.yml`, `.yaml`) are not suggested. Nothing
is listed from directories named `roles`, `tasks`, `group_vars` or
`host_vars`, from directories whose name starts with a dot, or from anything
below them; links to directories are not followed, and directories
themselves are never listed. The search stops once more than 50 files were
found, so up to 51 paths are listed, sorted without regard to case.

A file without an extension is read only when it is a regular file inside
the checkout: a link pointing out of it, to a device or to a FIFO is not
read, and so not listed.

It is not a complete list of what Ansible could read as an inventory, so the
UI also lets you type a path that is not in it.

## How an update runs

An SCM inventory update (`runInventoryUpdate` in
`src/internal/tasks/inventory_update.go`):

1. Runs the project's update first, as a dependency, when the project has
   `scm_update_on_launch` set (unless its last update is within the project's
   cache timeout).
2. Brings the project up to date for this run, at the source's `scm_branch`
   or the project's branch, with a project update of `launch_type` `sync`
   that runs on the control node. The update it used is in the inventory
   update's `source_project_update` field, and the revision in its
   `scm_revision` field. If the project update fails, the inventory update
   fails without running `ansible-inventory`. When the project's last update
   failed and the project does not update on launch, the source cannot be
   started at all: the API answers `400` with "Missing a revision to run due
   to failed project update."
3. Runs `ansible-inventory` with `-i` pointing at `source_path` inside that
   checkout, in the execution environment, with the collections the project
   requires on the collections path. The JSON it prints is imported into the
   inventory.

## Supported File Syntax

> Any inventory Ansible supports is supported by this feature.

That is because `ansible-inventory` reads it. This includes:

 - INI and YAML inventory files, and directories of them with `group_vars`
   and `host_vars`;
 - executable inventory scripts in the repository, which can read
   environment variables provided by a credential;
 - YAML files that configure an inventory plugin;
 - several inventory sources, in the same or different inventories, that use
   the same project with different `source_path` values.

The project does not need to contain any playbooks. A missing file or invalid
syntax fails the inventory update, with Ansible's error in its output.

## Update-On-Launch

An SCM inventory source can have `update_on_launch` set, like any other source:
a job against its inventory then syncs it first, unless its last successful
update is within `update_cache_timeout`. Because every SCM inventory update
brings its project up to date (step 2 above), the inventory follows the
repository without the project itself having to update on launch.

## Instance Groups

Since SCM inventory sources can run scripts written by people with access to
the repository, you may want to restrict where those updates run.

`ansible-inventory`, and with it any script in the repository, runs where the
inventory update is placed: the instance groups of the source, then of the
inventory, then of the inventory's organization, as for every inventory update
(see [Instance Groups on Inventory Sources](../inventory_source_instance_groups.md)).
Assign instance groups to the source to pin its updates. The project checkout
for the update is made on the control node, as project updates always are.
