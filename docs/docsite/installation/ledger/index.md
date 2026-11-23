---
title: Ledger
description: Install Ledger with the Ascender installer and connect it to Ascender.
weight: 10
---

Ledger collects Ascender's job events, host facts, and changes and turns them into reports. The installer deploys Ledger into its own namespace and points Ascender's external logging at it, so data starts flowing as soon as Ledger is up.

All Ledger settings use the `LEDGER_` prefix, except the replica counts, which use lowercase `ledger_`.

## What the installer deploys

In `LEDGER_NAMESPACE` (default `ledger`):

| Resource | Name | Purpose |
| --- | --- | --- |
| Deployment | `web` | The Ledger web interface and REST API, on port 80 |
| Deployment | `parser` | Receives Ascender's log stream on port 5000 |
| Deployment | `db` | MariaDB database, unless you use an external database |
| Service | `web-svc`, `parser`, `db` | In-cluster endpoints for the deployments |
| Ingress or Route | `ledger-web-ingress` or `web-route` | Exposes the web interface at `LEDGER_HOSTNAME` |
| PersistentVolumeClaim | `mysql-data` | Database storage, `LEDGER_PVC_SIZE_GB` in size |
| Secrets | `admin-password`, `db-settings`, `db-ledger-password`, `ledger-registry-secret` | Credentials, and the image pull secret when `LEDGER_REGISTRY` is set |

The parser is not exposed outside the cluster; Ascender reaches it through its cluster IP address.

## Configuration

Enable Ledger and set its host name and passwords:

```yaml
LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.example.com
LEDGER_NAMESPACE: ledger
LEDGER_VERSION: latest
LEDGER_ADMIN_PASSWORD: "<admin-password>"
LEDGER_DB_PASSWORD: "<database-password>"
```

| Variable | Default | Description |
| --- | --- | --- |
| `LEDGER_INSTALL` | `false` | Install Ledger |
| `LEDGER_HOSTNAME` | `ledger.example.com` | Host name of the Ledger web interface. Must differ from `ASCENDER_HOSTNAME` |
| `LEDGER_NAMESPACE` | `ledger` | Kubernetes namespace for Ledger |
| `LEDGER_VERSION` | `latest` | Image tag of the Ledger images |
| `LEDGER_ADMIN_PASSWORD` | `myadminpassword` | Password of the Ledger `admin` user. Change it |
| `LEDGER_DB_PASSWORD` | `mydbpassword` | Password of the Ledger database user. Change it |
| `ledger_web_replicas` | `1` | Number of web pods |
| `ledger_parser_replicas` | `1` | Number of parser pods |
| `LEDGER_PVC_SIZE_GB` | `10` | Size of the database volume, in GB. Set before the first installation |
| `LEDGER_PVC_STORAGE_CLASS` | Cluster default | StorageClass of the database volume. Applies on OCP and TKGI |
| `LEDGER_WEB_IMAGE`, `LEDGER_PARSER_IMAGE`, `LEDGER_DB_IMAGE` | `ghcr.io/ctrliq/ascender-ledger/ledger-web`, `ledger-parser`, `ledger-db` | Image repositories. Ignored when `k8s_container_registry` is set; the images are then pulled from `<k8s_container_registry>/ledger-web` and so on |
| `LEDGER_REGISTRY` | Unset | Optional credentials for pulling the Ledger images: `BASE`, `USERNAME`, and `PASSWORD`, all of which must be set. The installer creates the `ledger-registry-secret` pull secret from them |

On K3s, the TLS certificate at `tls_crt_path` is also used for Ledger, so it must cover `LEDGER_HOSTNAME`.

### External database

Ledger deploys its own MariaDB database by default. To use an existing MySQL or MariaDB server, set the connection variables. When `LEDGER_DB_HOST` is anything other than `db`, the installer does not deploy the database, its Service, or its volume:

| Variable | Default | Description |
| --- | --- | --- |
| `LEDGER_DB_HOST` | `db` | Database host name, resolvable from the Ledger pods |
| `LEDGER_DB_PORT` | `3306` | Database port |
| `LEDGER_DB_NAME` | `ledger` | Database name |
| `LEDGER_DB_USERNAME` | `ledger` | Database user |
| `LEDGER_DB_PASSWORD` | None | Database user's password |

## Ascender logging integration

After Ledger is up, the installer:

1. Generates a Ledger API token if none exists, enables **Require Token Authorization** in Ledger, and sets the Ledger base URL to `LEDGER_HOSTNAME`.
2. Configures Ascender's logging settings to send events to the Ledger parser: logging aggregator type `ledger`, host `http://<parser cluster IP>`, port 5000, level `INFO`, the Ledger token as the aggregator password, and external logging enabled. It also sets Ascender's base URL to `ASCENDER_HOSTNAME`.

The token steps run only when `LEDGER_REGISTRY.BASE` is set. Otherwise the installer configures the logging settings without a token and leaves Ledger's token settings unchanged.

To check the integration, log in to Ascender and open **Settings** > **Logging settings**. **Enable External Logging** should be on, **Logging Aggregator** should show an internal cluster IP address, and, when the token steps ran, **Logging Aggregator Password/Token** should show `ENCRYPTED`. Running the installer again resets these settings. To connect another Ascender server to Ledger, see the [Ledger repository](https://github.com/ctrliq/ascender-ledger).

To test the integration, open `https://<LEDGER_HOSTNAME>`, log in as `admin` with `LEDGER_ADMIN_PASSWORD`, and sync a project in Ascender. The Ledger **Dashboard** starts showing job events, and changes and facts appear as jobs run. The Ascender server appears under **Admin** > **Servers**.

## Scale Ledger

Add web replicas for more concurrent users and parser replicas for more log throughput, then run `./setup.sh` again:

```yaml
ledger_web_replicas: 2
ledger_parser_replicas: 2
```

Each additional replica needs roughly 1 GB of memory.

## Upgrade Ledger

With `LEDGER_VERSION: latest`, running `./setup.sh` again restarts the Ledger deployments so they pull the newest images. To move to a specific release, set `LEDGER_VERSION` to its tag and run `./setup.sh`. See [Upgrading](../upgrading).
