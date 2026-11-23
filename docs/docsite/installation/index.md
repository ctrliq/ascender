---
title: Installation
description: Requirements, supported platforms, and an overview of installing Ascender with the Ascender installer.
---

Ascender is installed with the [Ascender installer](https://github.com/ctrliq/ascender-install), a set of Ansible playbooks driven by a single configuration file. The installer deploys Ascender and any of the optional components onto a Kubernetes cluster, configures ingress, TLS, and DNS where the platform supports it, and connects the components to each other. Re-running the installer applies configuration changes and upgrades.

<Hint type="tip" title="Quick start">

To try Ascender on a single Linux server, follow the [K3s quick start](install#quick-start-k3s). It takes about 30 minutes and needs no cloud account.

</Hint>

## What gets installed

Ascender is always installed. Each other component is enabled with its own variable in the installer configuration.

| Component | Enabled by | Default namespace | What the installer deploys |
| --- | --- | --- | --- |
| **Ascender** | Always installed | `ascender` | The Ascender Operator, then an Ascender deployment (web, task, and PostgreSQL pods) managed by the operator |
| **Ledger** | `LEDGER_INSTALL` | `ledger` | Ledger web, parser, and MariaDB database. Ascender's external logging is pointed at the Ledger parser automatically |
| **Galaxy Proxy** | `PROXY_INSTALL` | Same namespace as Ascender | The Galaxy Proxy and a persistent cache volume |

Every component gets its own hostname and is exposed through the cluster's ingress controller (an OpenShift Route on OCP). See the [component configuration pages](#component-configuration) for what each component needs.

### Container images

All the images the installer deploys are public:

| Image | Used by |
| --- | --- |
| `ghcr.io/ctrliq/ascender` | Ascender web and task pods |
| `ghcr.io/ctrliq/ascender-ee` | Default execution environment and control plane execution environment |
| `ghcr.io/ctrliq/ascender-operator` | Ascender Operator |
| `quay.io/sclorg/postgresql-15-c9s` | Ascender PostgreSQL database |
| `ghcr.io/valkey-io/valkey` | Ascender cache |
| `ghcr.io/ctrliq/ascender-ledger/ledger-web`, `ledger-parser`, `ledger-db` | Ledger |
| `ghcr.io/ctrliq/ascender-galaxy-proxy` | Galaxy Proxy |

## Supported platforms

Set `k8s_platform` to one of the following values. Some platforms can be provisioned by the installer; on the others you create the cluster first.

| `k8s_platform` | Platform | Cluster provisioning | Guide |
| --- | --- | --- | --- |
| `k3s` | K3s | Installer can install (single node) | [Installing Ascender](install) |
| `rke2` | RKE2 (RKE Government) | Bring your own | [RKE2](rke2), [RKE2 air-gapped](rke2-offline) |
| `eks` | Amazon Elastic Kubernetes Service | Installer can provision | [Amazon EKS](eks) |
| `gke` | Google Kubernetes Engine | Installer can provision | [Google GKE](gke) |
| `aks` | Azure Kubernetes Service | Installer can provision | [Azure AKS](aks) |
| `dkp` | D2iQ Kubernetes Platform | Bring your own | [Other platforms](other-platforms#dkp) |
| `ocp` | Red Hat OpenShift Container Platform | Bring your own | [Other platforms](other-platforms#openshift-ocp) |
| `tkgi` | VMware Tanzu Kubernetes Grid Integrated Edition | Bring your own | [Other platforms](other-platforms#tkgi) |

Offline installation, using images you transfer into an environment without internet access, is supported on K3s and RKE2, and on DKP with an internal container registry. See [Offline installation](offline) and [RKE2 air-gapped installation](rke2-offline).

## Requirements

### Control machine

The installer runs from a Linux machine called the control machine. For K3s and RKE2 this is usually the cluster node itself; for cloud platforms it is typically a small administration server.

- `x86_64` architecture.
- One of the following operating systems:
  - Enterprise Linux 8, 9, or 10 (Rocky Linux, Red Hat Enterprise Linux, AlmaLinux, or CentOS Stream).
  - Ubuntu 24.04 or 26.04, or Debian 12 or 13.
- Enterprise Linux 9 is required when `k8s_platform` is `eks`, `aks`, or `gke`. Ubuntu and Debian are not supported for those platforms.
- `git`. The configuration and setup scripts install `ansible-core` if it is missing, and the setup script also installs the required Ansible collections and the Python Kubernetes client.
- Root access, or a user with passwordless `sudo`. The installer uses privilege escalation to install packages and, optionally, to add entries to `/etc/hosts`.
- Network access to the Kubernetes API of the target cluster, and to the hostnames you assign to the components.

For offline installations the control machine must run Enterprise Linux, because the offline bundle contains RPM packages.

### Kubernetes cluster

- An `x86_64` Kubernetes cluster on one of the supported platforms, cloud credentials that allow the installer to create one on EKS, GKE, or AKS, or, for K3s, a Linux server on which the installer can install K3s.
- An ingress controller. K3s and DKP use Traefik, RKE2 uses its bundled NGINX ingress controller, EKS uses the AWS Load Balancer Controller (installed by the installer when it provisions or configures the cluster), GKE and AKS use the NGINX ingress controller (installed by the installer), OCP uses Routes, and TKGI uses Contour or the ingress class you specify.
- A default StorageClass, or a StorageClass you name in the configuration. K3s ships with one; RKE2 and some bring-your-own clusters do not.

When installing on K3s, the installer checks the target node before it does anything else:

| Resource | Ascender only | Ascender and Ledger |
| --- | --- | --- |
| vCPUs | 2 | 2 |
| Memory | 4 GB | 8 GB |
| Free space for `/var` | 20 GB (30 GB for offline installs) | 20 GB (30 GB for offline installs) |
| Operating system | Enterprise Linux 8, 9, or 10, Ubuntu 24.04 or later, or Debian 12 or later | Enterprise Linux 8, 9, or 10, Ubuntu 24.04 or later, or Debian 12 or later |

These are minimums. For production, plan at least 4 CPUs, 16 GB of memory, and 60 GB for `/var`. Each additional Ascender or Ledger replica adds roughly 1 GB of memory.

### Persistent storage

Each component requests persistent volumes from the cluster. The default sizes are:

| Component | Volume | Default size | Variable |
| --- | --- | --- | --- |
| Ascender | PostgreSQL data | 8 GiB (Ascender Operator default) | `POSTGRES_PVC_SIZE_GB` |
| Ledger | MariaDB data (`mysql-data`) | 10 GiB | `LEDGER_PVC_SIZE_GB` |
| Galaxy Proxy | Cache (`ascender-galaxy-proxy-cache`) | 5 GiB | `PROXY_CONFIG.PVC_SIZE` |

Set volume sizes before the first installation. Most storage classes cannot shrink a volume, and the installer does not resize existing volumes.

### Registry credentials

The images are public, so the installer needs no registry credentials to pull them. If you pull the Ledger images from a registry that requires a login, set the optional `LEDGER_REGISTRY` block in the configuration. All three fields must be set:

```yaml
LEDGER_REGISTRY:
  BASE: <registry-host>
  USERNAME: <username>
  PASSWORD: <password>
```

The installer creates an image pull secret named `ledger-registry-secret` from these credentials in the Ledger namespace. To pull Ascender from an internal registry instead, see [Offline installation and internal registries](configuration-reference#offline-installation-and-internal-registries).

### Hostnames and DNS

Each installed component needs its own DNS name, and the names must be different from each other:

| Variable | Example | Component |
| --- | --- | --- |
| `ASCENDER_HOSTNAME` | `ascender.example.com` | Ascender |
| `LEDGER_HOSTNAME` | `ledger.example.com` | Ledger |
| `PROXY_HOSTNAME` | `galaxy-proxy.example.com` | Galaxy Proxy |
| `ASCENDER_MESH_HOSTNAME` | `mesh.ascender.example.com` | Automation Mesh ingress (optional) |

The installer contacts every component by its hostname to confirm it is up, so the names must resolve from the control machine while the installer runs. On EKS, GKE, and AKS the installer can create the DNS records for you. On K3s, RKE2, DKP, and TKGI it can add entries to `/etc/hosts` on the control machine instead (`use_etc_hosts`), which is enough for evaluation but not for users or other systems. For production, create DNS records that point each name at the cluster's ingress address.

### TLS certificates

Set `k8s_lb_protocol: https` to serve the components over HTTPS. On K3s, RKE2, DKP, GKE, AKS, and TKGI, you supply a PEM certificate and private key on the control machine, and the installer creates the Kubernetes TLS secrets from them. Use one certificate that covers every hostname you configure, either as subject alternative names or with a wildcard such as `*.example.com`. On EKS the installer uses certificates from AWS Certificate Manager instead, and on OpenShift the router usually terminates TLS; see the platform guides.

See the [configuration reference](configuration-reference#tls-and-certificates) for the certificate variables.

## Installation steps

1. Prepare the cluster for your platform, or the cloud credentials if the installer is provisioning the cluster.
2. Prepare the control machine and clone the installer.
3. Generate `custom.config.yml` with `config_vars.sh`, then review it.
4. Point the `inventory` file at the target host.
5. Run `setup.sh`.
6. Log in to each component and change default passwords.

[Installing Ascender](install) covers these steps in detail, starting with a complete K3s example.

## Component configuration

- [Ledger](ledger)
- [Galaxy Proxy](galaxy-proxy)

## Operating the installation

- [Configuration reference](configuration-reference): every installer variable.
- [Automation Mesh](automation-mesh): connect remote execution nodes.
- [Upgrading](upgrading): move to new versions of Ascender and the components.
- [Migrating from AWX](awx-migration): import an AWX database into Ascender.
- [Uninstalling](uninstalling): remove components or the whole installation.
- [Troubleshooting](troubleshooting): resolve common installation problems.
- [Backup](/admin-guide/backup) and [Restore](/admin-guide/restore): protect the Ascender database.
