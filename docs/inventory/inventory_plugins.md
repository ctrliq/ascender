# Inventory Plugins

Every inventory update runs `ansible-inventory` in an execution environment and
imports the JSON it prints (`runInventoryUpdate` in
`src/internal/tasks/inventory_update.go`, then `performUpdate` in
`src/internal/tasks/inventory_import.go`). Ascender keeps no source-specific
parsing of its own: Ansible's inventory plugins read the cloud or the files,
and `ansible-inventory` gives the same JSON structure for all of them.

## Cloud sources

For a cloud source, Ascender writes the source's `source_vars` as the plugin's
YAML configuration file, with `plugin` set for the source type, and passes it
to `ansible-inventory -i`:

| `source` | `plugin` written | Collection |
|----------|------------------|------------|
| `ec2` | `aws_ec2` | `amazon.aws` |
| `gce` | `gcp_compute` | `google.cloud` |
| `azure_rm` | `azure_rm` | `azure.azcollection` |
| `vmware` | `community.vmware.vmware_vm_inventory` (or `vmware.vmware.vms` when `source_vars` selects it) | `community.vmware`, `vmware.vmware` |
| `openstack` | `openstack` | `openstack.cloud` |
| `satellite6` | `theforeman.foreman.foreman` | `theforeman.foreman` |
| `terraform` | `cloud.terraform.terraform_state` | `cloud.terraform` |
| `netbox` | `netbox.netbox.nb_inventory` | `netbox.netbox` |
| `ascender` | `ctrliq.ascender.controller` | `ctrliq.ascender` |

The plugin comes from the collection installed in the execution environment the
update runs in; short names are resolved by Ansible's plugin routing. The
needed collections are in the Ascender default execution environment,
except `netbox.netbox`: a `netbox` source needs an execution environment that
has it.

https://github.com/ctrliq/ascender-ee

For development, `tools/netbox/` has a NetBox to sync from and an execution
environment with `netbox.netbox` added (see `tools/netbox/README.md`).

The source's cloud credential is given to the plugin through environment
variables, and files named by them where the plugin wants a file (a GCE
service account file, an OpenStack `clouds.yaml`). A NetBox credential's
Verify SSL is the one setting that goes in the configuration file instead,
as `validate_certs`, because `nb_inventory` reads it from nowhere else; the
source's `source_vars` override it. A `netbox` source also adds
`netbox_instance_id` to the plugin's `compose`, unless `source_vars` set it:
`device:<id>` or `vm:<id>`, then `@` and the host, port and path of the
credential's URL. It is the source's instance id variable, so a host renamed
in NetBox keeps its host here (`src/internal/tasks/inventory_netbox.go`). The
other options of the source,
`overwrite`, `overwrite_vars`, `enabled_var`, `enabled_value` and
`host_filter`, apply when the output is imported.

`host_filter` is a Python regular expression (Python's `re` syntax, with
lookarounds and backreferences), matched at the start of each host name as
`re.match` does: only the hosts it matches are imported. It is not checked
when the source is saved; an expression Python cannot compile fails the
update with "invalid regular expression for --host-filter". Without a
`host_filter`, the filter is `^.+$`, as it is always for group names: a
name that is empty or has a line break before its last character is not
imported.

## The `ansible-inventory` command

The update runs:

```
ansible-inventory --list --export -i <inventory> [--limit <limit>] --output <file> --playbook-dir <dir> [-vvv]
```

with `ANSIBLE_INVENTORY_UNPARSED_FAILED`, `ANSIBLE_INVENTORY_EXPORT` and
`ANSIBLE_HOST_PATTERN_MISMATCH=error` set, so an inventory that does not parse,
or a `limit` that matches nothing, fails the update instead of importing
nothing. A source `verbosity` of 1 adds `-vvv` and 2 adds `-vvvvv`.

## Writing Your Own Inventory File

You can add an [SCM inventory source](./scm_inventory.md) that points to your
own YAML file which names an inventory plugin. You can also attach a credential
of a built-in cloud type to that source: most of them inject the same
environment variables they would for their own source type. For example, an
inventory file for the `amazon.aws.aws_ec2` plugin can use the built-in Amazon
Web Services credential, which sets `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`.

The secrets come from the credential, so your inventory file only needs the
non-sensitive configuration, such as `keyed_groups` (to make groups) or
`compose` (to build host variables).
