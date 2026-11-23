# NetBox inventory examples

Playbooks that use what the NetBox inventory source produces: the generated
groups as host patterns, the `netbox_*` host variables, the out-of-band
address, and config context arriving as plain host variables. They are
written against the development estate `make seed-netbox` creates, and run
against any NetBox inventory.

| Playbook | Shows | Reaches the hosts |
| --- | --- | --- |
| `show_netbox_facts.yml` | What NetBox put on each host: groups, address, tags, config context | no |
| `inventory_report.yml` | Host counts per site, role, tag, platform and cluster, and who is in PCI scope | no |
| `config_context_to_files.yml` | Config context driving configuration: a chrony.conf from `ntp_servers` | no, writes to the controller |
| `patch_web_servers.yml` | A host pattern over the generated groups (`site_dc2:&role_web_server`), a custom field as a guard | yes |
| `oob_health.yml` | Redfish through `netbox_oob_ip`, from the controller, for Dell hardware | the iDRACs only |

In Ascender, put them in a project and make a job template per playbook
against a NetBox inventory. The three that do not reach the hosts run
anywhere. To run one by hand, export the inventory Ascender built, which
the API serves in the inventory script format:

```console
$ curl -s -u admin https://ascender.example.com/api/v2/inventories/42/script/?hostvars=1 > inventory.json
$ printf '#!/bin/sh\ncat %s\n' "$PWD/inventory.json" > inventory.sh && chmod +x inventory.sh
$ ansible-playbook -i inventory.sh show_netbox_facts.yml
```

See [netbox_inventory.md](../../netbox_inventory.md) for every host variable
and group, and the worked filter examples.
