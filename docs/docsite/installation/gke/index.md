---
title: Installing on Google GKE
description: Install Ascender on Google Kubernetes Engine, optionally letting the installer create the cluster.
weight: 4
---

On Google Kubernetes Engine the installer can create a zonal cluster with Terraform or use an existing cluster. It installs the NGINX ingress controller, exposes every component through it, and can create the DNS records in Google Cloud DNS.

## Prerequisites

- A control machine running Enterprise Linux 9. Enterprise Linux 8 and Ubuntu are not supported for GKE.
- A Google Cloud project with the [Kubernetes Engine API](https://console.cloud.google.com/marketplace/product/google/container.googleapis.com) and, if the installer manages DNS, the [Cloud DNS API](https://console.cloud.google.com/marketplace/product/google/dns.googleapis.com) enabled.
- A Google account with permission to create GKE clusters in the project and the Kubernetes Engine Admin role (`roles/container.admin`), which the NGINX ingress controller installation needs to create cluster roles.
- The [gcloud CLI](https://cloud.google.com/sdk/docs/install#rpm) installed on the control machine. The installer adds the `gke-gcloud-auth-plugin` package and Terraform.
- A Cloud DNS managed zone for your domain if you want the installer to create DNS records.

## Choose the installing user

Run the installer as a regular user with passwordless `sudo`, not as root. On GKE the installer writes the cluster credentials to `/home/<ansible_user>/.kube/config`, so the user must have a home directory under `/home` and must be named in the inventory (see [Configure the inventory](#configure-the-inventory)).

## Authenticate gcloud

Authenticate as the installing user:

```bash
gcloud init
gcloud auth application-default login
```

`gcloud init` signs you in and selects the project and default zone. To change the project later, run `gcloud config set project <PROJECT_ID>`. Make sure the gcloud components are current with `gcloud components update`, or with `dnf update` if gcloud was installed from RPM packages.

## Set up Cloud DNS

To let the installer create DNS records, create a public managed zone for your domain in Cloud DNS (see [Create, modify, and delete zones](https://cloud.google.com/dns/docs/zones)). Note two values:

- The zone name, for `GOOGLE_DNS_MANAGED_ZONE`.
- The DNS name, for `ASCENDER_DOMAIN`.

## Cluster options

`GKE_CLUSTER_STATUS` decides what happens to the cluster named `GKE_CLUSTER_NAME`:

- `provision`: if no cluster with that name exists, create it with Terraform in `GKE_CLUSTER_ZONE` of `GKE_PROJECT_ID`, using `GKE_K8S_VERSION`, `GKE_NUM_WORKER_NODES` nodes of type `GKE_INSTANCE_TYPE`, and `GKE_WORKER_VOLUME_SIZE` GB disks. An existing cluster is used as it is.
- `configure` or `no_action`: use the existing cluster.

In every case the installer applies the NGINX ingress controller manifest from the [ingress-nginx project](https://github.com/kubernetes/ingress-nginx) before installing Ascender. The Terraform files and state for a provisioned cluster are kept in `ascender_install_artifacts/gke_deploy/` in the repository root. Keep that directory: you need it to delete the cluster later.

## Configure the installer

Run `./config_vars.sh` and select `gke`. The script asks for the project ID, whether to use Google Cloud DNS, the cluster name, status, and zone, the node settings when provisioning, and `ASCENDER_DOMAIN`. It does not ask for the managed zone, so add `GOOGLE_DNS_MANAGED_ZONE` to `custom.config.yml` yourself when `USE_GOOGLE_DNS` is `true`.

Check the available Kubernetes versions for your zone before provisioning, because GKE retires versions frequently:

```bash
gcloud container get-server-config --zone=<zone> --format="value(validMasterVersions)"
```

A typical configuration:

```yaml
k8s_platform: gke
k8s_lb_protocol: https
download_kubeconfig: true

GKE_PROJECT_ID: my-project
GKE_CLUSTER_NAME: ascender-gke-cluster
GKE_CLUSTER_STATUS: provision
GKE_CLUSTER_ZONE: us-central1-a
GKE_K8S_VERSION: "<supported GKE version>"
GKE_INSTANCE_TYPE: e2-standard-4
GKE_NUM_WORKER_NODES: 3
GKE_WORKER_VOLUME_SIZE: 100

USE_GOOGLE_DNS: true
GOOGLE_DNS_MANAGED_ZONE: example-com
ASCENDER_DOMAIN: example.com

tls_crt_path: ~/ascender.crt
tls_key_path: ~/ascender.key

ASCENDER_HOSTNAME: ascender.example.com
LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.example.com
```

For HTTPS, the certificate at `tls_crt_path` must cover every host name you configure.

With `download_kubeconfig: true`, the installer runs `gcloud container clusters get-credentials` to write `~/.kube/config`, after backing up any existing file.

## Configure the inventory

Copy the GKE sample inventory and set `ansible_user` on both lines to the installing user:

```bash
cp docs/installation/gke/gke.inventory inventory
```

```ini
[localhost]
localhost ansible_host=localhost ansible_connection=local ansible_user=<installing-user>

[ascender]
ascender_host ansible_host=localhost ansible_connection=local ansible_user=<installing-user>
```

## Run the installer

```bash
./setup.sh
```

## DNS

With `USE_GOOGLE_DNS: true`, the installer creates an A record in `GOOGLE_DNS_MANAGED_ZONE` for each component host name, pointing at the ingress IP address, and replaces any existing A record for that name. With `false`, it prints the IP address to use; create the A records with your DNS provider. To see the addresses:

```bash
kubectl get ingress -A
```

## GKE variables

| Variable | Default | Description |
| --- | --- | --- |
| `GKE_PROJECT_ID` | None | Google Cloud project ID. Required |
| `GKE_CLUSTER_NAME` | `ascender-gke-cluster` | Name of the cluster to use or create |
| `GKE_CLUSTER_STATUS` | `provision` | `provision`, `configure`, or `no_action` |
| `GKE_CLUSTER_ZONE` | `us-central1-a` | Zone of the cluster |
| `GKE_K8S_VERSION` | `1.29.4-gke.1043002` | Minimum control plane version for a new cluster. Use a version GKE currently offers |
| `GKE_INSTANCE_TYPE` | `e2-medium` | Machine type of the worker nodes |
| `GKE_NUM_WORKER_NODES` | `3` | Number of worker nodes |
| `GKE_WORKER_VOLUME_SIZE` | `100` | Disk size of each worker node, in GB |
| `USE_GOOGLE_DNS` | `true` | Create the DNS records in Cloud DNS |
| `GOOGLE_DNS_MANAGED_ZONE` | None | Name of the Cloud DNS managed zone. Required when `USE_GOOGLE_DNS` is `true` |
| `ASCENDER_DOMAIN` | `example.com` | Domain that contains the host names |

The defaults shown are the ones `config_vars.sh` offers. `default.config.yml` does not contain the GKE variables, so set them all if you write `custom.config.yml` by hand.

## Next steps

Log in to each component as described in [Log in](../install#log-in). To delete a cluster the installer created, see [Uninstalling](../uninstalling#delete-a-cluster-created-by-the-installer).
