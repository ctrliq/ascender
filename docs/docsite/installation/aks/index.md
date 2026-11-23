---
title: Installing on Azure AKS
description: Install Ascender on Azure Kubernetes Service, optionally letting the installer create the cluster.
weight: 5
---

On Azure Kubernetes Service the installer can create a cluster with Terraform or use an existing cluster. It installs the NGINX ingress controller, exposes every component through it, and can create the DNS records in Azure DNS.

## Prerequisites

- A control machine running Enterprise Linux 9. Enterprise Linux 8 and Ubuntu are not supported for AKS.
- An Azure subscription, and an account with permission to create resource groups and AKS clusters in it. Creating a service principal with a role assignment at subscription scope needs the Owner or User Access Administrator role.
- The [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux) on the control machine. The installer also installs the Azure CLI, Terraform, and the Python packages for the Azure Ansible collection if they are missing.
- An Azure DNS zone for your domain if you want the installer to create DNS records.

## Choose the installing user

Run the installer as a regular user with passwordless `sudo`. The installer escalates privileges itself to install packages, and it uses the installing user's `~/.kube/config` and Azure credentials.

## Authenticate with Azure

1. Log in to Azure as the installing user:

   ```bash
   az login
   ```

   If no browser is available, use `az login --use-device-code` and complete the sign-in at the URL it prints.

2. The installer's Azure modules read service principal credentials from `~/.azure/credentials`. Find your subscription ID and create a service principal:

   ```bash
   az account list --output table
   az ad sp create-for-rbac --name ascender-installer --role Contributor --scopes /subscriptions/<subscription-id>
   ```

   Record the `appId` (client ID), `password` (client secret), and `tenant` from the output. The client secret is shown only once.

3. Create the credentials file:

   ```bash
   mkdir -p ~/.azure
   cat <<EOF > ~/.azure/credentials
   [default]
   subscription_id=<subscription-id>
   client_id=<client-id>
   secret=<client-secret>
   tenant=<tenant-id>
   EOF
   chmod 600 ~/.azure/credentials
   ```

## Cluster options

`AKS_CLUSTER_STATUS` decides what happens to the cluster named `AKS_CLUSTER_NAME`:

- `provision`: if no cluster with that name exists, create it with Terraform in a new resource group in `AKS_CLUSTER_REGION`, with `AKS_NUM_WORKER_NODES` nodes of size `AKS_INSTANCE_TYPE` and `AKS_WORKER_VOLUME_SIZE` GB operating system disks. The resource group gets a generated name beginning with `rg-`. An existing cluster is used as it is.
- `configure` or `no_action`: use the existing cluster.

A new cluster runs the Kubernetes version that AKS currently uses by default; `AKS_K8S_VERSION` is not used. In every case the installer applies the NGINX ingress controller manifest from the [ingress-nginx project](https://github.com/kubernetes/ingress-nginx) before installing Ascender.

The Terraform files and state for a provisioned cluster are kept in `ascender_install_artifacts/aks_deploy/` in the repository root. Keep that directory: you need it to delete the cluster later.

## Configure the installer

Run `./config_vars.sh` and select `aks`. The script asks whether to use Azure DNS, for the cluster name, status, and region, the node settings when provisioning, and `ASCENDER_DOMAIN`. A typical configuration:

```yaml
k8s_platform: aks
k8s_lb_protocol: https
download_kubeconfig: true

USE_AZURE_DNS: true
AKS_CLUSTER_NAME: ascender-aks-cluster
AKS_CLUSTER_STATUS: provision
AKS_CLUSTER_REGION: eastus
AKS_INSTANCE_TYPE: Standard_D4s_v3
AKS_NUM_WORKER_NODES: 3
AKS_WORKER_VOLUME_SIZE: 100

ASCENDER_DOMAIN: example.com
ASCENDER_HOSTNAME: ascender.example.com
ASCENDER_NAMESPACE: ascender

tls_crt_path: ~/ascender.crt
tls_key_path: ~/ascender.key

LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.example.com
```

For HTTPS, the certificate at `tls_crt_path` must cover every host name you configure.

Keep `ASCENDER_NAMESPACE` at `ascender` on AKS: the installer looks up the Ascender ingress in the `ascender` namespace to find its IP address.

With `download_kubeconfig: true`, the installer writes the cluster's credentials to `~/.kube/config` with `az aks get-credentials`, after backing up any existing file.

## Configure the inventory

Copy the AKS sample inventory and set `ansible_user` on both lines to the installing user:

```bash
cp docs/installation/aks/aks.inventory inventory
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

With `USE_AZURE_DNS: true`, the installer finds the Azure DNS zone named `ASCENDER_DOMAIN` and creates A records pointing at the ingress IP address:

- For Ascender, a record named `ascender`, so set `ASCENDER_HOSTNAME` to `ascender.<ASCENDER_DOMAIN>`.
- For Ledger and Galaxy Proxy, a record named after the component host name with `.<ASCENDER_DOMAIN>` removed. Each host name must therefore be inside `ASCENDER_DOMAIN`.

With `USE_AZURE_DNS: false`, the installer prints the IP address for each component; create the A records with your DNS provider. To see the addresses:

```bash
kubectl get ingress -A
```

## AKS variables

| Variable | Default | Description |
| --- | --- | --- |
| `AKS_CLUSTER_NAME` | `ascender-aks-cluster` | Name of the cluster to use or create |
| `AKS_CLUSTER_STATUS` | `provision` | `provision`, `configure`, or `no_action` |
| `AKS_CLUSTER_REGION` | `southcentralus` | Azure region for a new cluster |
| `AKS_INSTANCE_TYPE` | `Standard_D2_v2` | VM size of the worker nodes |
| `AKS_NUM_WORKER_NODES` | `3` | Number of worker nodes |
| `AKS_WORKER_VOLUME_SIZE` | `100` | Operating system disk size of each worker node, in GB |
| `AKS_K8S_VERSION` | `1.29` | Present in the configuration but not used by the installer |
| `USE_AZURE_DNS` | `true` | Create the DNS records in Azure DNS |
| `ASCENDER_DOMAIN` | `example.com` | Azure DNS zone that contains the host names |

## Next steps

Log in to each component as described in [Log in](../install#log-in). To delete a cluster the installer created, see [Uninstalling](../uninstalling#delete-a-cluster-created-by-the-installer).
