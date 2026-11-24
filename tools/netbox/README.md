# NetBox

A [NetBox](https://netbox.dev) to develop and test the `netbox` inventory
source against (`docs/inventory/inventory_plugins.md`; the user guide's
Inventories and Credentials pages), with an estate to sync and an execution
environment that has the `netbox.netbox` collection.

| File | What it is |
|------|------------|
| `compose.yml` | NetBox, its PostgreSQL and Valkey, and the worker that sends its webhooks: the compose project `ascender-netbox` |
| `seed.py` | Fills NetBox with regions, sites, racks, tenants, clusters, devices and virtual machines (standard library only; safe to re-run) |
| `ee/Containerfile` | The default execution environment with `netbox.netbox` added |
| `netbox.mk` | The targets below, included by `tools/Makefile` |

## Use

From `tools/`, with the development stack running (`make start` at the top
level):

```
make netbox-start   # NetBox at http://localhost:8000 (admin / admin)
make netbox-seed    # sites, racks, devices and virtual machines to sync
make netbox-ee      # the execution environment, loaded into the task container
make netbox-logs
make netbox-stop    # its database volume is kept
```

The first start of a new NetBox spends several minutes on its database
migrations before it answers; `make netbox-seed` waits for it.
`SEED_ARGS=--scale 2000` adds that many plain devices, for timing a sync
against a large estate.

To sync it into Ascender:

1. Make a **NetBox** credential with the URL `http://netbox:8080` (where the
   task container reaches NetBox) and the API token `make netbox-seed`
   prints, the development one fixed in `compose.yml`.
2. Add the execution environment `localhost/ascender-ee-netbox:dev` with the
   pull policy **Never**: `make netbox-ee` loaded it into the task container's
   podman, and it is in no registry.
3. Add a **NetBox** source to an inventory with that credential and
   execution environment, and sync it.

## Settings

In `tools/.env` (see `tools/.env.example`):

| Variable | Meaning | Default |
|----------|---------|---------|
| `NETBOX_BIND` | Host address NetBox is published on | `127.0.0.1` |
| `NETBOX_PORT` | Host port NetBox is published on | `8000` |
| `NETBOX_URL` | Where `make netbox-seed` reaches NetBox from this host | `http://<NETBOX_BIND>:<NETBOX_PORT>`, with `localhost` for a wildcard or loopback `NETBOX_BIND` |
| `NETBOX_EE_IMAGE` | The image `make netbox-ee` builds and loads | `localhost/ascender-ee-netbox:dev` |
