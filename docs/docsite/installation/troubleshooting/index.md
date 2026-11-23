---
title: Troubleshooting
description: Resolve common problems when installing Ascender with the Ascender installer.
weight: 40
---

The installer is safe to run again, so in most cases you fix the cause of a failure and run `./setup.sh` again. These commands help find the cause:

```bash
kubectl get pods -A
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
kubectl logs deployment/awx-operator-controller-manager -n ascender
kubectl get ingress -A
```

## Checks that stop the installer early

`setup.sh` and the first playbook check the environment before changing anything. These messages mean a requirement is not met:

| Message | Cause |
| --- | --- |
| `CPU architecture must be x86_64.` | The control machine is not `x86_64` |
| `Linux major version must be 8, 9 or 10.` | The Enterprise Linux control machine is not version 8, 9, or 10 |
| `This script must be run on RHEL or Rocky Linux version 9 or higher when k8s_platform is ...` | EKS, GKE, and AKS need an Enterprise Linux 9 control machine |
| `LEDGER_HOSTNAME (...) and ASCENDER_HOSTNAME (...) must be different` | The two host names are the same |
| `K3s server requires at least 2 vCPUs and ... MB of memory` | The K3s node is below the [minimum size](..#kubernetes-cluster) |
| `Free disk space for /var must be at least 20GB` (or `30GB`) | The K3s node does not have enough free space; offline installations need 30 GB |
| `... Collection is not installed or the incorrect version.` | A required Ansible collection is missing or too old. Run `ansible-galaxy install -r collections/requirements.yml` from the repository root |

## Installation fails because the kubeconfig is missing

```text
TASK [k8s_setup : Copy kubeconfig file from default location to the ~/.kube directory"]
fatal: [ascender_host]: FAILED! => {"changed": false, "msg": "the remote file does not exist, not transferring, ignored"}
```

With `download_kubeconfig: true`, the installer copies the kubeconfig from the target host (`/etc/rancher/k3s/k3s.yaml` on K3s, `/etc/rancher/rke2/rke2.yaml` on RKE2). The file does not exist because Kubernetes is not installed on that host. On K3s, set `kube_install: true` so the installer installs K3s (see the [K3s quick start](../install#install-k3s)), or install K3s yourself. The installer does not install RKE2: install it first (see [RKE2](../rke2)). Then run the installer again.

If your kubeconfig is somewhere else, copy it to `~/.kube/config` on the control machine yourself and set `download_kubeconfig: false`.

## Installation fails while waiting for the Ascender API

```text
TASK [ascender_install : Wait until Ascender API is Up (This may take between 10-20 mins)]
FAILED - RETRYING: [localhost]: Wait until Ascender API is Up (This may take between 10-20 mins) (0 retries left)
fatal: [localhost]: FAILED! => {"attempts": 200, ... "msg": "Status code was -1 and not [200]: Request failed: <urlopen error [Errno -2] Name or service not known>", ... "url": "https://ascender.example.com:443/api/v2/ping/"}
```

`FAILED - RETRYING` lines are normal while the installer polls; the task only fails when it reaches `(0 retries left)`. Check the pods:

```bash
kubectl get pods -n ascender
```

If the `ascender-app-web`, `ascender-app-task`, and `ascender-app-postgres-15` pods are `Running` and the migration pod is `Completed`, Ascender is up and the control machine cannot resolve `ASCENDER_HOSTNAME`. Test with `dig ascender.example.com +short` or `nslookup ascender.example.com`, then either create the DNS record or, for evaluation on K3s and RKE2, set `use_etc_hosts: true` so the installer adds an `/etc/hosts` entry. Run the installer again.

If the pods are not running, use `kubectl describe pod` and the operator logs to find out why. Common causes are a missing default StorageClass (the PostgreSQL pod stays `Pending`) and images that cannot be pulled.

## A component's endpoint check fails

The installer waits for each component through its host name: Ledger at `/` and Galaxy Proxy at `/healthz`. On K3s, RKE2, DKP, and TKGI, `use_etc_hosts` adds entries for the host name of every component you install. On the other platforms, and when `use_etc_hosts` is `false`, the checks fail unless the host names resolve through DNS. Create the DNS records, or add the entries to `/etc/hosts` on the control machine, and run the installer again.

## The web interface does not load

Browsers show `DNS_PROBE_FINISHED_NXDOMAIN`, or `curl` reports `Could not resolve host`. The host name does not resolve from your workstation:

1. Check the configured host name: `grep HOSTNAME: custom.config.yml`. It must be a fully qualified name in a domain you control.
2. Check the DNS record: `dig ascender.example.com +short` should print the address of the cluster's ingress or load balancer.
3. Create an `A` record for the ingress IP address, or a `CNAME` record for a load balancer host name, and allow time for it to propagate.

For a quick test, add the name to your workstation's hosts file (`/etc/hosts` on Linux and macOS, `C:\Windows\System32\drivers\etc\hosts` on Windows). `kubectl get ingress -A` shows the host names and addresses of every component.

## Pods cannot pull images

Pods stay in `ErrImagePull` or `ImagePullBackOff`.

- If you pull the Ledger images from a registry that requires a login, check the `LEDGER_REGISTRY` credentials in `custom.config.yml`, then run the installer again to update the pull secret.
- For offline installations, check that `ascender_image_pull_policy` is `IfNotPresent` and that every image was imported. See [Offline installation](../offline).

## Ledger shows no data

- In Ascender, check that external logging is enabled and points at the Ledger parser. See [Ascender logging integration](../ledger#ascender-logging-integration). Running the installer again restores these settings.

## Old version of PostgreSQL detected

```text
Old version of postgres detected. Please run upgrade postgres playbook.  ansible-playbook playbooks/upgrade_postgres.yml
```

The installation was created with an earlier PostgreSQL image. See [Upgrade PostgreSQL from an older installation](../upgrading#upgrade-postgresql-from-an-older-installation).

## EKS: certificate or hosted zone not found

`Certificate for domain "..." not found in region "..."` means there is no ACM certificate for `ASCENDER_HOSTNAME` in `EKS_CLUSTER_REGION`. `Hosted zone ID not found for domain ...` means `USE_ROUTE_53` is enabled but there is no Route 53 hosted zone named `ASCENDER_DOMAIN`. See [Installing on Amazon EKS](../eks#certificates).

## Nodes cannot communicate on RKE2

If fail2ban runs on RKE2 nodes, it can block traffic between them. See [fail2ban blocks communication between nodes](../rke2#fail2ban-blocks-communication-between-nodes).

## Namespace deletion hangs when Automation Mesh is enabled

`kubectl delete namespace ascender` never finishes and the namespace stays `Terminating`. When Automation Mesh is enabled, the `awxmeshingress.awx.ansible.com` resource `ascender-app-mesh` has a finalizer that blocks the deletion. To see what is left in the namespace:

```bash
kubectl api-resources --verbs=list --namespaced -o name | xargs -n 1 kubectl get --show-kind --ignore-not-found -n ascender
```

To finish the deletion, start it without waiting, remove the finalizer, and delete again:

```bash
kubectl delete --wait=false namespace ascender
kubectl patch awxmeshingress.awx.ansible.com/ascender-app-mesh -n ascender -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl delete namespace ascender
```

You need cluster administrator rights to change finalizers. See the [Kubernetes finalizers documentation](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/) for background.

## Get help

If you cannot resolve a problem, report it in the installer's [GitHub issues](https://github.com/ctrliq/ascender-install/issues) or ask on the [Ascender forum](https://forum.ascender-automation.org). Include the installer output, your `custom.config.yml` with passwords and tokens removed, and the output of `kubectl get pods -A`.
