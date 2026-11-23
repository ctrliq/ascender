# NetBox Inventory

Ascender can build an inventory directly from the NetBox REST API. Devices and
virtual machines become hosts, the objects they relate to become groups, and
NetBox config context becomes host variables.

This source is native: the task process talks to NetBox itself, from the
control plane. It does not run `ansible-inventory`, it does not use the
`netbox.netbox` collection, and it does not need an execution environment.
Nothing has to be added to an EE for it to work. The code is
`src/internal/netbox` (the client, the transform and the incremental gate)
and `src/internal/tasks/inventory_native.go` (the run).

NetBox 4.6 is the minimum. The sync reads the version on connect and stops
with a clear error on anything older.

## Setting up a source

Create a NetBox credential first. It has three fields:

- `host`: base URL of the NetBox instance, for example
  `https://netbox.example.org`. No trailing `/api`.
- `token`: API token with read access to the objects you want. Leave it blank
  only if the instance allows anonymous reads.
- `verify_ssl`: defaults to on.

Then add an inventory source with `source` set to `netbox` and that credential
selected. Nothing else is required. The remaining fields are the ones every
cloud source has: verbosity, host filter, enabled variable and value, the
overwrite and update-on-launch options, and source variables. The execution
environment field is ignored: no container runs.

The token only has to read. These are every endpoint the sync touches:

```
/api/status/                          version check
/api/schema/                          filter name validation
/api/dcim/devices/                    hosts
/api/virtualization/virtual-machines/ hosts
/api/dcim/sites/                      site attributes a device does not carry
/api/dcim/regions/                    region tree
/api/dcim/site-groups/                site group tree
/api/core/object-changes/             incremental sync only
/api/core/object-types/               incremental sync only
```

Tenants, platforms, racks, tags, custom fields, config context and IP
addresses all arrive nested in the device and virtual machine payloads, so
none of them costs a request of its own.

## Outbound proxy

The fetch runs in the task process, so it leaves by the control plane's
egress path rather than an execution node's. Where that path goes through a
proxy, set it in **Settings > Jobs > Extra Environment Variables**
(`ASCENDER_TASK_ENV`), which already applies to inventory updates:

```json
{
  "HTTPS_PROXY": "http://proxy.example.net:8080",
  "NO_PROXY": "netbox.internal.example.net"
}
```

`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` behave as they do anywhere else,
in either case. `NO_PROXY` is the one to reach for when NetBox is internal and
the proxy exists only for egress to the internet. When the setting names no
proxy, the task process's own environment applies.

This setting is global rather than per source. A deployment that needs one
NetBox proxied and another not can separate them with `NO_PROXY`.

## What you get

Every device and virtual machine becomes a host, named after the NetBox
object. Hosts are matched on `netbox_instance_id`, which is the object type,
the NetBox primary key and the NetBox it came from
(`devices:7@netbox.example.com`), so renaming a device in NetBox updates the
existing host rather than orphaning it and creating a second one. The NetBox
is named because the importer matches instance ids across the whole
inventory, not per source: two NetBox installs both have a device 7, and
without the name the second source's device 7 would take over the first's
host. The name is the host and port of the credential URL, plus the path of
an install under a prefix. Changing the URL changes every id; the hosts are
matched by name once and carry the new id from there.

Objects whose status is not active are imported **disabled** rather than
dropped, which is what the `ec2` and `vmware` sources do. They stay visible in
the inventory, they keep their group memberships, and no play targets them.

### Host variables

Everything NetBox knows about the object arrives under a `netbox_` prefix:

- `netbox_object_type`, `netbox_instance_id`, `netbox_id`, `netbox_name`,
  `netbox_display`, `netbox_url`
- `netbox_status`, `netbox_description`, `netbox_comments`
- `netbox_site`, `netbox_location`, `netbox_rack`, `netbox_tenant`,
  `netbox_platform`, `netbox_cluster`, `netbox_device_type`, `netbox_role`,
  `netbox_manufacturer`
- `netbox_regions` and `netbox_site_groups`, each resolved up the tree so a
  host in a child region is also in its parents
- `netbox_site_time_zone` and `netbox_site_facility`
- `netbox_serial`, `netbox_asset_tag`, `netbox_position` on devices
- `netbox_vcpus`, `netbox_memory`, `netbox_disk` on virtual machines
- `netbox_tags`, `netbox_custom_fields`
- `netbox_oob_ip` and `netbox_primary_ip6`. The primary IPv4 address is not
  repeated under its own key, because it is already `ansible_host`.
- `netbox_config_context` and `netbox_local_context_data`

A device carries only the brief form of its site, which stops at the slug. The
region, site group, time zone and facility come from three extra list requests
covering the whole estate, not one request per host.

### Groups

Each related object produces a group, and the groups of one kind sit under a
parent group named after that kind:

| Parent | Members |
|---|---|
| `sites` | `site_<slug>` |
| `regions` | `region_<slug>` |
| `site_groups` | `site_group_<slug>` |
| `locations` | `location_<slug>` |
| `racks` | `rack_<name>` |
| `tenants` | `tenant_<slug>` |
| `platforms` | `platform_<slug>` |
| `clusters` | `cluster_<name>` |
| `device_types` | `device_type_<model>` |
| `roles` | `role_<slug>` |
| `manufacturers` | `manufacturer_<slug>` |
| `statuses` | `status_<value>` |
| `tags` | `tag_<slug>` |

Everything is also in `devices` or `virtual_machines`. Group names are
lowercased, and anything outside letters, digits and underscores collapses to
an underscore, so a rack called `DC1-R01` produces `rack_dc1_r01`. A name that
would start with a digit gets a leading underscore, because Ansible group
names may not.

Status and tag grouping can be turned off with `group_by_status` and
`group_by_tag` if they inflate the group count more than they help.

## Config context

Config context is the closest thing NetBox has to host variables, so it is
merged into the host variables by default. NetBox renders it per object,
applying weight order and then the object's own local context data, and the
result arrives already resolved.

Three keys are involved:

- `netbox_config_context` is the rendered result, kept whole.
- `netbox_local_context_data` is what was set on the object itself, kept
  separate so a play can tell what an object declared from what it inherited.
- The rendered context is also merged flat into the host variables, so a
  play reads `cis_profile` rather than `netbox_config_context.cis_profile`.

Set `merge_config_context: false` to keep the flat merge from happening and
leave `netbox_config_context` as the only copy. Set `config_context: false` to
stop requesting it at all, which is worth doing on a large estate that does
not use it: rendering config context is the expensive part of listing devices
in NetBox.

> The `netbox.netbox` inventory plugin tries to skip this with
> `?exclude=config_context`. That parameter stopped working in NetBox 4.6.
> NetBox returns 200 and renders the context anyway. This source uses
> `?fields=`, which still works, and leaves `config_context` out of the field
> list when it is not wanted.

## Choosing the connection address

`ansible_host` is set from the first of these that exists:

1. `ansible_host` from config context, when config context is being merged.
2. The out-of-band address, when `oob_ip_as_primary_ip` is on.
3. The primary IPv4 address, then any primary address, then IPv6.

Config context comes first because NetBox has already resolved its own
precedence by the time the value arrives, which makes it the most specific
answer NetBox holds rather than a site-wide default. It also keeps
`ansible_host` consistent with `ansible_user`, `ansible_port` and every other
`ansible_*` key, all of which arrive the same way.

The out-of-band address is always available as `netbox_oob_ip` whether or not
it is used for the connection. For iDRAC, iLO and BMC work this is usually the
address a play needs.

Set `use_fqdn: true` to name hosts after the NetBox primary IP's DNS name
where one exists.

## Using the inventory in playbooks

The groups exist to be host patterns and the host variables to be read, so a
play needs no NetBox lookups of its own.

- Intersections and exclusions over the generated groups select hosts the
  way NetBox describes them: `site_dc2:&role_web_server` is the web servers
  at DC2, `tag_pci_scope:!platform_windows_server_2022` the Linux side of
  PCI scope, `cluster_dc1_vmw_prod` a cluster's hypervisors and guests. In
  Ascender the same pattern goes in a job template's **Limit**. Filtering
  the source itself (below) is the other half of the same choice, and the
  better one when the subset is all a team should ever see.
- A host whose NetBox status is not active is imported disabled, and a
  disabled host never reaches a play, so a pattern does not need to exclude
  `status_offline`.
- Config context arrives as plain host variables (`cis_profile`,
  `ntp_servers`, `ansible_user`), and so does anything NetBox was told under
  `ansible_*`. Custom fields are under `netbox_custom_fields`; a selection
  field is a `label` and `value` pair there, a text field a string.
- `netbox_oob_ip` is the address for iDRAC, iLO and BMC work whether or not
  `oob_ip_as_primary_ip` is set, so one play can reach a host on its primary
  address and its management controller on the out-of-band one.

[`examples/netbox/`](examples/netbox/) holds five playbooks written against
the development estate:

| Playbook | Shows |
|---|---|
| `show_netbox_facts.yml` | What NetBox put on each host: groups, address, tags, config context. Reaches nothing |
| `inventory_report.yml` | Host counts per site, role, tag, platform and cluster, and who is in PCI scope. Controller only |
| `config_context_to_files.yml` | Config context driving configuration: a chrony.conf rendered from `ntp_servers` |
| `patch_web_servers.yml` | A pattern over the generated groups, serial batches, a custom field as a guard |
| `oob_health.yml` | Redfish through `netbox_oob_ip` from the controller, for Dell hardware |

In Ascender they are a project and a job template each. To run one by hand
against an inventory Ascender built, export it in the inventory script
format the API serves and point `ansible-playbook` at a script that prints
it:

```console
$ curl -s -u admin https://ascender.example.com/api/v2/inventories/42/script/?hostvars=1 > inventory.json
$ printf '#!/bin/sh\ncat %s\n' "$PWD/inventory.json" > inventory.sh && chmod +x inventory.sh
$ ansible-playbook -i inventory.sh show_netbox_facts.yml
```

## Filtering

Filters are passed to NetBox as query parameters, so anything the NetBox API
accepts works, including custom field lookups with the `cf_` prefix:

```yaml
filters:
  tag: ansible-managed
device_filters:
  rack_id: 12
  cf_owner_team: platform
vm_filters:
  cluster: dc1-vmw-prod
```

`filters` applies to both endpoints. `device_filters` and `vm_filters` apply to
one each and override the shared set. Devices and virtual machines do not take
the same filters: NetBox 4.7 publishes 369 for one and 224 for the other, so
`cluster` on a device request is an error and `rack_id` on a virtual machine
request is one too.

Filter names are checked against the NetBox API schema before the sync runs,
and an unrecognised name fails the job with a suggestion:

```
NetBox has no device filter named 'rack' (did you mean 'rack_id'?). It would ignore it and return every object, so this sync stopped instead. ...
```

This matters because NetBox ignores a filter name it does not recognise and
returns **every** object. Without the check, a typo silently widens the sync to
the whole estate and the job still reports success. The schema is about 15 MB,
so the names extracted from it are cached in the task process per NetBox
version, and it is only fetched for a source that sets filters.

`exclude_offline: true` adds `status=active`, which drops non-active objects
instead of importing them disabled.

### Worked examples

Each of these was run against the estate `make seed-netbox` creates: twelve
devices and eleven virtual machines over three sites in two region trees,
two clusters and two tenants. The result is what the inventory holds
afterwards; an offline object is in it disabled unless the example drops it.

| Restrict to | Source variables | Result |
|---|---|---|
| One site | `filters: {site: dc2}` | 9 hosts: 3 devices and 6 virtual machines, one of them disabled |
| A region, child regions included | `filters: {region: uk}` | the same 9, DC2 being the only site in the UK region |
| One cluster, hypervisors and guests | `filters: {cluster_id: 1}` | 7 hosts: the two ESX hosts in dc1-vmw-prod and its five virtual machines |
| One tenant | `filters: {tenant: internal}` | 7 devices and no virtual machines, since none carries a tenant |
| A tag | `filters: {tag: production}` | 9 hosts across both sites |
| Two filters, ANDed | `filters: {site: dc2, role: web-server}` | 6 hosts: one device and five virtual machines |
| Offline objects left out | `filters: {site: dc2}` and `exclude_offline: true` | 8 hosts; dc2-lab-old is absent rather than disabled |
| A custom field | `filters: {cf_backup_policy: daily}` | 5 hosts: the database servers and the backup host |
| The host name instead | no filters, host filter `^dc2-` | the same 9 DC2 hosts, after fetching and building all 23 |
| A typo | `filters: {cluster: dc1-vmw-prod}` | fails before fetching: `NetBox has no device filter named 'cluster' (did you mean 'cluster_id' ...)` |

The rules the examples lean on:

- `cluster` by name is a virtual machine filter; `cluster_id` exists on both
  endpoints, which is why the shared form uses the id (the number at the end
  of the cluster's URL in NetBox). `vm_filters: {cluster: dc1-vmw-prod}` with
  `device_filters: {cluster_id: 1}` is the same thing spelled by name where
  NetBox allows it.
- A list value repeats the parameter. For `site`, `role`, `status` and most
  filters NetBox reads that as any of the values; for `tag` it reads all of
  them, so `tag: [production, pci-scope]` is the objects carrying both.
- `region` and `site_group` include their children, so one filter covers a
  tree.
- Any custom field works with the `cf_` prefix. `name__isw` and `name__ic`
  filter on the name itself, for the cases the host filter used to cover.
- The host filter is applied by the importer after the fetch, so it costs
  the whole estate every run (2.2 seconds against 0.4 with the 2000 scale
  devices loaded) and only knows the name. Use it when the thing you want is
  only in the name; use a NetBox filter when NetBox already knows it.
- The first filtered run after the task process starts fetches the NetBox API
  schema for the name check, about three seconds; later runs reuse it.

## Source variables

All of these are optional and go in the source variables field.

| Variable | Default | Effect |
|---|---|---|
| `filters` | none | Query parameters for both endpoints |
| `device_filters` | none | Query parameters for devices only |
| `vm_filters` | none | Query parameters for virtual machines only |
| `exclude_offline` | `false` | Drop non-active objects rather than importing them disabled |
| `config_context` | `true` | Request config context from NetBox |
| `merge_config_context` | `true` | Merge the rendered context flat into host variables |
| `flatten_custom_fields` | `false` | Also merge custom fields flat into host variables |
| `group_by_status` | `true` | Create `status_*` groups |
| `group_by_tag` | `true` | Create `tag_*` groups |
| `oob_ip_as_primary_ip` | `false` | Prefer the out-of-band address for `ansible_host` |
| `use_fqdn` | `false` | Name hosts by DNS name where the primary IP has one |
| `include_raw` | `false` | Keep the whole NetBox object as `netbox_raw` |
| `incremental` | `false` | Skip a sync when nothing relevant changed |
| `incremental_max_skips` | `24` | Force a full sync after this many skips (`0` for no ceiling) |
| `changelog_watch_all` | `false` | Treat any change as relevant, not just the watched types |
| `webhook_debounce_seconds` | `15` | Quiet period before a webhook triggers a sync |

The flags are read the way the old application read its source variables
dict: `false`, `0`, an empty string and an empty list are off, anything else
is on.

## Incremental sync

Off by default. With `incremental: true`, each run first asks
`/api/core/object-changes/` whether anything has changed since the last run.
If nothing relevant has, the sync stops without fetching the estate and the
inventory is left as it is.

A skipped run costs three small requests, and that figure does not move with
the size of the estate:

```
Incremental check: no NetBox changes at all since position 2162
Skipped the fetch, the inventory already matches NetBox (1 skipped run(s) in a row).
Checked in 0.1s
```

Seventeen object types are watched, covering everything that can change a host
or a group: devices, virtual machines, the groupable objects, regions, site
groups, roles, manufacturers, config contexts, tags, custom fields and IP
addresses. Most of these never appear in a device's own changelog entries:
renaming a site or editing a config context records one entry against that
object and nothing against the hundreds of devices whose host variables just
moved, which is why the list is wider than devices and virtual machines.
`changelog_watch_all: true` widens it to any change at all, for anyone who
would rather not maintain that judgement.

The importer performs a full reconcile, so the gate skips whole runs rather
than applying deltas: a payload built from changelog entries would delete
every host it did not mention. Every uncertainty resolves towards fetching.
Several things force a full sync regardless:

- `incremental_max_skips` consecutive skips, 24 by default.
- The previous run failed.
- The source's settings changed: its variables, its credential (URL, token or
  `verify_ssl`), `overwrite`, `overwrite_vars`, `enabled_var`,
  `enabled_value`, `host_filter` or `limit`. The changelog records what
  changed in NetBox and nothing about the source, so the position carries a
  digest of these settings and a run whose digest differs fetches. Without
  this, new filters would not take effect until something in NetBox changed.
- The recorded changelog position is older than NetBox still holds.
  `CHANGELOG_RETENTION` defaults to 90 days, and a position that has aged out
  cannot be reasoned about.
- The latest change id is below the recorded position, which means NetBox
  was restored from a backup or replaced. Reading that as "nothing since"
  would ignore every change until the sequence climbed past the position.

The position is a change id, read before the fetch so a change landing
mid-fetch is picked up by the next run, and recorded on the inventory source
(`source_sync_state`) once the import has landed. Turning the option on and
off is safe at any time.

## Webhooks

A NetBox event rule can trigger a sync, so a change reaches the inventory in
seconds rather than at the next schedule.

Each inventory source has its own receiver and key. Set `webhook_service` to
`netbox` on the source (through the API; `PATCH` the source with
`{"webhook_service": "netbox"}`), which generates the key:

```
/api/v2/inventory_sources/<id>/netbox/       the URL NetBox posts to
/api/v2/inventory_sources/<id>/webhook_key/  the shared secret, GET to read, POST to rotate
```

Point a NetBox webhook at the first, set its secret to the value of the
second, and attach it to an event rule for the object types you care about.
Signatures are verified as HMAC-SHA512 over the request body, which is what
NetBox sends in `X-Hook-Signature`. A request with no valid signature is
rejected, and `webhook_service` is only accepted on a `netbox` source, since
nothing else knows what to do with a delivery.

NetBox delivers webhooks through its RQ worker. If no worker is running, the
event rule fires and nothing arrives.

A webhook does not carry inventory data, and nothing in the payload is used
beyond the object type and the change ids. An object type that cannot change
the inventory (the watch list of the incremental sync) is acknowledged with
200 and dropped; anything else marks the source as needing a sync, with 202.
The task process's scheduler pass, every 30 seconds, then launches at most
one sync per source once the burst has settled, and only when that source has
no update already pending or running. A source with one in flight is left
marked and reconsidered next pass, because that update may have started
before the change landed. The launched sync is an ordinary run (an
incremental one if the source is incremental), so there is one way the
inventory gets built.

The debounce matters. A bulk edit or a scripted import in NetBox can fire
hundreds of webhooks in a few seconds: one PATCH of twelve devices through a
single API call produced twelve deliveries when measured. One sync per
webhook would flatten the control plane. `webhook_debounce_seconds` is the
quiet period a source waits for before it syncs, 15 seconds by default, plus
up to one scheduler tick. Raise it if NetBox changes arrive in long bursts.

The pending burst lives in the source's `source_sync_state` beside the
incremental position; both writers merge under the source's row lock, so a
webhook landing while a sync records its position is not lost, and a launch
clears the burst without touching the position. The launch clears only the
burst it looked at: a delivery landing between the look and the clear stays
recorded, because the sync just launched may have fetched before the change
behind it was made, and the next pass launches again once that sync is done.

## Why this runs on the control plane

Every other source runs `ansible-inventory` in an execution environment and
the task process imports the JSON it prints. For this source the task process
builds that JSON itself (`executeNative` in
`src/internal/tasks/inventory_native.go`) and hands it to the same importer.
Host matching, group reconciliation, `overwrite`, host filters and
`enabled_var` are the existing code paths, not reimplementations. No
execution environment is resolved or recorded for the update, and the task
manager places it as it places a project update: it takes control capacity
and runs on the node that claimed it, rather than waiting for room on an
execution node it would not use.

System jobs set the precedent for running in the task process. A NetBox sync
of a few thousand objects is a handful of HTTPS requests; through an execution
environment the container start would be the expensive part. It is also why a
cheap changed-since check is worth having: if every check cost a container
launch there would be no point making one.

### What the control plane position means

The fetch happens in the task process, so the request leaves from the control
plane's network position rather than from an execution environment. Anyone
who can create a credential and an inventory source can therefore cause an
HTTP request to any address the control plane can reach, and see part of the
response in the job output.

Every other inventory source reaches its API from inside an execution
environment, so this is new, and it is written down here rather than left to
be found. An operator who wants a boundary has the control plane's own egress
rules, and control over who holds `add` on inventories and credentials.

What the client does not do is widen it any further. It dials through the same
guard as every other outbound request the Go application makes, which refuses
the cloud metadata addresses directly or through a proxy. The `next` link on a
paginated list and a redirect `Location` are both chosen by whatever answered
the previous request, so following either as given would let that host move
the request somewhere nobody configured: pagination keeps the path and query
and takes the origin from the credential, and a redirect is refused with the
address it pointed at in the job output.

## Scale

Measured on the development stack, with the seeded estate plus 2000 plain
devices (`make seed-netbox SEED_ARGS="--scale 2000"`): 2012 devices and 11
virtual machines, 2023 hosts in 60 groups.

```
Fetched 2012 devices
Fetched 11 virtual machines
Built 2023 host(s) in 61 group(s)
Built the inventory in 2.2s
    2.250 INFO     Loaded 60 groups, 2023 hosts
    4.122 INFO     Inventory import completed for netbox in 1.8s
```

Between 3.6 and 4.1 seconds end to end on a steady-state run, over three
runs: about two seconds fetching and transforming, 1.8 seconds in the
importer every source shares. The same estate took 9.7 seconds in the Python
implementation this was ported from, 2.6 of them in the fetch. An incremental
run that finds nothing changed takes 0.04 seconds at this size, and that
figure does not move with the estate.

Config context is the expensive half of the NetBox side. Turning it off with
`config_context: false` on an estate that does not use it is the largest
saving available.

A bulk edit of twelve devices in NetBox reached the source as twelve
webhooks within a second of the request, and the one sync they triggered
started 35 seconds after the edit: the 15 second debounce plus up to one 30
second scheduler tick.

## Development environment

`make start NETBOX=true` brings up a NetBox alongside the development stack
(see `deploy/README.md`), reachable at <http://localhost:8000> and at
`http://netbox:8080` from inside the compose network. `make seed-netbox`
fills it with an estate: two region trees, three sites, racks, tenants,
clusters with their hypervisors in them, twelve devices and eleven virtual
machines, out-of-band addresses on the hardware, four config contexts that
overlap so the merge order is visible, and three objects left offline so the
disabled import can be seen.
The script (`scripts/netbox-seed.py`) uses the standard library only and is
safe to re-run.

```console
$ make seed-netbox
NetBox 4.7.5 at http://localhost:8000
...
12 devices and 11 virtual machines in NetBox.
```

The development NetBox is created with `admin` / `admin` and a fixed API
token, both in `deploy/docker-compose.yml`. They are development values and
this instance holds nothing worth protecting. `SEED_ARGS=--scale 2000` adds
2000 plain devices on top, for timing a sync against a large estate.

## Troubleshooting

**`NetBox 4.5.9 is too old for this integration, which needs 4.6 or newer.`**
Earlier releases have REST performance problems, and holding the line at 4.6
keeps compatibility shims for renamed fields and moved endpoints out of the
client.

**`NetBox rejected the credentials for GET /api/status/ (HTTP 403).`** The
token is wrong, expired, or has no read access. A 401 or 403 is not retried,
because nothing about retrying it would change the answer.

**`Could not reach NetBox at ... after 3 attempts`** A connection or DNS
failure, with the underlying error on the same line. Connection errors, HTTP
429 and 5xx are retried three times with a backoff of at most 30 seconds, so
this means all three failed.

**`NetBox has no device filter named '<name>'`** The filter is not in the
NetBox API schema. The message suggests the closest match.

**`Could not read the NetBox API schema`** The token cannot reach
`/api/schema/`. The sync stops rather than running with filters NetBox might
ignore.

**`NetBox redirected GET /api/status/ to ...`** The credential URL is not the
address NetBox serves (http where it wants https, or a host that forwards
elsewhere). Put the address it redirected to in the credential.

**A sync reports success but nothing changed.** Check whether `incremental`
is on. A skipped run says so in its output, and says how many it has skipped
in a row.

**Hosts arrive disabled.** Their NetBox status is not active. This is the
default behaviour. Use `exclude_offline: true` to drop them instead.
