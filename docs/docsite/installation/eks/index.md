---
title: Installing on Amazon EKS
description: Install Ascender on Amazon Elastic Kubernetes Service, optionally letting the installer create the cluster.
weight: 3
---

On Amazon EKS the installer can create a new cluster, prepare an existing one, or install into an existing cluster as it is. It exposes every component through an AWS Application Load Balancer that terminates TLS with certificates from AWS Certificate Manager (ACM), and can create the DNS records in Route 53.

## Prerequisites

- A control machine running Enterprise Linux 9. Enterprise Linux 8 and Ubuntu are not supported for EKS.
- The [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#cliv2-linux-install) installed at `/usr/local/bin/aws`, which is where the installer looks for it. The AWS CLI installer needs `unzip` (`dnf install -y unzip`).
- AWS credentials for an IAM user or role that can create and manage EKS clusters, VPCs, IAM roles and policies, EC2 launch templates, and load balancers. To generate a policy document with the permissions the installer uses, run `./setup.sh -p` (see [IAM permissions](#iam-permissions)).
- An ACM certificate in the cluster's region for the Ascender host names. See [Certificates](#certificates).
- A Route 53 public hosted zone for `ASCENDER_DOMAIN` if you want the installer to create DNS records (`USE_ROUTE_53: yes`).

The installer downloads `eksctl` to `/usr/local/bin` and installs the Python AWS libraries it needs.

## Choose the installing user

Run the installer as a regular user with passwordless `sudo`. The installer escalates privileges itself to install packages, and it uses the installing user's `~/.kube/config` and AWS credentials. The user must be named in the inventory (see [Configure the inventory](#configure-the-inventory)).

## Authenticate the AWS CLI

Configure the AWS CLI as the installing user, and confirm the identity and region:

```bash
aws configure
aws sts get-caller-identity
aws configure get region
```

## Certificates

The load balancer always listens on ports 80 and 443 and redirects HTTP to HTTPS, so Ascender on EKS is always served over HTTPS, whatever `k8s_lb_protocol` is set to. The installer finds certificates in ACM by domain name in `EKS_CLUSTER_REGION`:

- For Ascender, it looks for a certificate for `ASCENDER_HOSTNAME` and stops if there is none.
- For Ledger and Galaxy Proxy, it looks for a certificate for the component's host name and falls back to the `ASCENDER_HOSTNAME` certificate.

The simplest setup is one certificate whose domain name is `ASCENDER_HOSTNAME`, with every other host name you configure (including `ASCENDER_MESH_HOSTNAME` if you use [Automation Mesh](../automation-mesh)) added as subject alternative names. `tls_crt_path`, `tls_key_path`, and `EKS_SSL_CERT` are not used on EKS.

## Cluster options

`EKS_CLUSTER_STATUS` decides what the installer does with the cluster named `EKS_CLUSTER_NAME` in `EKS_CLUSTER_REGION`:

- `provision`: if the cluster does not exist, create it, then prepare it as for `configure`. If it already exists, it is only prepared.
- `configure`: use an existing cluster and prepare it for Ascender.
- `no_action`: use an existing cluster as it is. The cluster must already have the AWS Load Balancer Controller, the EBS CSI driver, and a default StorageClass.

When provisioning, the installer creates a VPC named `<EKS_CLUSTER_NAME>-vpc` with `EKS_NUM_SUBNETS` subnets carved from `EKS_CLUSTER_CIDR`, an internet gateway (when `EKS_INTERNET_GATEWAY` is `true`), a node security group, IAM roles for the cluster and node group, a launch template, and a managed node group using the Amazon Linux 2023 EKS image for `EKS_K8S_VERSION`. With `EKS_PUBLIC: true` nodes get public IP addresses; with `false` the cluster is created with `eksctl` and private node networking.

Preparing the cluster (`provision` and `configure`) installs cert-manager and the AWS Load Balancer Controller, attaches the required IAM policies, associates an IAM OIDC provider, installs the Amazon EBS CSI driver with its service account, and creates a default StorageClass of the type in `EKS_DEFAULT_STORAGE_CLASS` (`gp2`, `gp3`, or `io2`).

## Configure the installer

Run `./config_vars.sh` and select `eks`. The script asks whether to use Route 53, for the cluster name, status, and region, and, when provisioning, for the network and node group settings. It also asks for `ASCENDER_DOMAIN`, the DNS domain that contains your host names. Then review `custom.config.yml`. A typical configuration that provisions a private cluster looks like this:

```yaml
k8s_platform: eks
k8s_lb_protocol: https
download_kubeconfig: true

USE_ROUTE_53: yes
EKS_CLUSTER_NAME: ascender-prod
EKS_CLUSTER_STATUS: provision
EKS_CLUSTER_REGION: us-east-1
EKS_PUBLIC: false
EKS_CLUSTER_CIDR: "10.10.0.0/16"
EKS_NUM_SUBNETS: 3
EKS_SUBNET_SIZE: 26
EKS_K8S_VERSION: "1.35"
EKS_INSTANCE_TYPE: t3.large
EKS_NUM_WORKER_NODES: 3

ASCENDER_HOSTNAME: ascender.example.com
ASCENDER_DOMAIN: example.com
LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.example.com
```

With `download_kubeconfig: true`, the installer writes the cluster's credentials to `~/.kube/config` with `aws eks update-kubeconfig`. If an existing `~/.kube/config` does not authenticate to the cluster, it is backed up with a timestamp suffix and replaced.

## Configure the inventory

Copy the EKS sample inventory and set `ansible_user` on both lines to the installing user:

```bash
cp docs/installation/eks/eks.inventory inventory
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

Provisioning a new cluster makes the installation take considerably longer than installing into an existing one.

## DNS

With `USE_ROUTE_53: yes`, the installer finds the hosted zone named `ASCENDER_DOMAIN` and creates or updates a CNAME record for each host name, pointing at its load balancer. Because they are CNAME records, the host names cannot be the zone apex.

With `USE_ROUTE_53: no`, the installer prints the load balancer DNS name for each component. Create the CNAME records with your DNS provider while the installer waits for each component to answer, or run the installer again after the records exist. To list the load balancer addresses:

```bash
kubectl get ingress -A
```

When `EKS_PUBLIC` is `false`, the load balancers are internal and reachable only from inside the VPC. The installer checks each component through its host name, so run it from a control machine that can reach the VPC.

## IAM permissions

To create a least-privilege policy for the account that runs the installer, generate the policy document:

```bash
./setup.sh -p
```

The document is written to `ascender_install_artifacts/ascender_install_permissions.json.<timestamp>`. Create an IAM policy from it and attach the policy to the installing user or role.

## EKS variables

| Variable | Default | Description |
| --- | --- | --- |
| `EKS_CLUSTER_NAME` | `ascender-eks-cluster` | Name of the cluster to use or create |
| `EKS_CLUSTER_STATUS` | `no_action` | `provision`, `configure`, or `no_action` |
| `EKS_CLUSTER_REGION` | `us-east-1` | AWS region of the cluster and of the ACM certificates |
| `EKS_PUBLIC` | `false` | `true` assigns public IP addresses to nodes and makes the load balancers internet-facing. `false` keeps nodes private and the load balancers internal |
| `EKS_CLUSTER_CIDR` | `10.10.0.0/16` | VPC CIDR block, when provisioning |
| `EKS_NUM_SUBNETS` | `3` | Number of subnets, when provisioning |
| `EKS_SUBNET_SIZE` | `26` | Prefix length of each subnet, when provisioning |
| `EKS_INTERNET_GATEWAY` | `true` | Create an internet gateway for the VPC, when provisioning |
| `EKS_K8S_VERSION` | `1.35` | Kubernetes version, when provisioning. See [Amazon EKS Kubernetes versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) |
| `EKS_INSTANCE_TYPE` | `t3.large` | Worker node instance type |
| `EKS_NUM_WORKER_NODES` | `3` | Desired number of worker nodes, when provisioning. The node group is created with a minimum of 1 and a maximum of 3 nodes, so do not set this higher than 3 |
| `EKS_DEFAULT_STORAGE_CLASS` | `gp3` | Default StorageClass to create: `gp2`, `gp3`, or `io2`. Leave unset to create none |
| `EKS_SSL_POLICY` | `ELBSecurityPolicy-TLS13-1-2-Res-2021-06` | TLS security policy of the load balancers |
| `EKS_ALB_INBOUND_CIDRS` | `["0.0.0.0/0"]` | CIDR blocks allowed to reach the load balancers |
| `EKS_ALB_SECURITY_GROUPS` | Unset | Security groups to attach to the load balancers instead of the generated one |
| `USE_ROUTE_53` | `yes` | Create the DNS records in Route 53 |
| `ASCENDER_DOMAIN` | `example.com` | Route 53 hosted zone that contains the host names |

`EKS_USER`, `EKS_SSL_CERT`, `EKS_MIN_WORKER_NODES`, `EKS_MAX_WORKER_NODES`, `EKS_WORKER_VOLUME_SIZE`, and `EKS_EBS_CSI_DRIVER_VERSION` appear in `default.config.yml`, and `config_vars.sh` asks for some of them, but the current installer does not use them. Adjust the node group's scaling limits in AWS after provisioning if you need more nodes.

## Next steps

Log in to each component as described in [Log in](../install#log-in). To remove the installation or the cluster, see [Uninstalling](../uninstalling).
