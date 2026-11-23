---
title: DKP, OpenShift, and TKGI
description: Install Ascender on an existing D2iQ Kubernetes Platform, Red Hat OpenShift, or VMware Tanzu Kubernetes Grid Integrated Edition cluster.
weight: 6
---

On DKP, OpenShift Container Platform (OCP), and Tanzu Kubernetes Grid Integrated Edition (TKGI), the installer deploys Ascender into a cluster you have already created. Prepare the control machine and configuration as described in [Installing Ascender](../install), with the platform-specific settings on this page. Keep the default `inventory`, which targets the control machine.

## DKP

The DKP path has been tested with DKP 2.5 and the Traefik ingress controller provided by the Kommander management plane.

### DKP prerequisites

- An existing DKP cluster. See the [DKP documentation](https://docs.d2iq.com/dkp/2.5/day-0-basic-installs-by-infrastructure) to create one. On premises, configure MetalLB so that `LoadBalancer` services receive addresses.
- Traefik installed through Kommander, with a `LoadBalancer` Service named `traefik` in the `default` namespace. The installer reads that Service's address while it sets up the cluster.
- The DKP cluster's kubeconfig on the control machine in two places: `~/.kube/config`, which the installation uses, and `~/.kube/config_dkp`, which the cluster checks use. With the DKP CLI pointed at the bootstrap or management cluster you can write it with `dkp get kubeconfig -c <cluster-name> > ~/.kube/config_dkp`, then copy it to `~/.kube/config`.
- A default StorageClass.
- For HTTPS, a certificate and key covering every host name you configure.

### DKP configuration

Run `./config_vars.sh` and select `dkp`. Then check:

```yaml
k8s_platform: dkp
k8s_lb_protocol: https
use_etc_hosts: true
tls_crt_path: ~/ascender.crt
tls_key_path: ~/ascender.key
ASCENDER_HOSTNAME: ascender.example.com
LEDGER_HOSTNAME: ledger.example.com
```

All components are exposed through Traefik ingress resources. With `use_etc_hosts: true`, the installer adds `/etc/hosts` entries on the control machine that point the host name of every component you install at the Traefik load balancer address. In production, create DNS records for the host names pointing at the same address.

`config_vars.sh` asks for `DKP_CLUSTER_NAME`, but the installer does not use it.

## OpenShift (OCP)

### OCP prerequisites

- An existing OpenShift cluster, and a kubeconfig at `~/.kube/config` for a user with cluster administrator rights. You can create it with `oc login`.
- Host names under a domain that resolves to the OpenShift router, typically the cluster's applications domain, for example `ascender.apps.mycluster.example.com`.
- A default StorageClass, or the storage class variables below.

### OCP configuration

Run `./config_vars.sh` and select `ocp`. Then check:

```yaml
k8s_platform: ocp
k8s_lb_protocol: http
download_kubeconfig: false
use_etc_hosts: false
ASCENDER_HOSTNAME: ascender.apps.mycluster.example.com
LEDGER_HOSTNAME: ledger.apps.mycluster.example.com
```

The installer exposes every component through an OpenShift Route:

- With `k8s_lb_protocol: http`, the Routes use edge termination: the OpenShift router serves HTTPS with its own certificate and redirects HTTP to HTTPS. Use this setting when you install Ledger or Galaxy Proxy, whose pods serve plain HTTP.
- With `k8s_lb_protocol: https`, the Routes use passthrough termination and Ascender serves TLS itself with the certificate at `tls_crt_path` and `tls_key_path`. `config_vars.sh` does not ask for the certificate paths on OCP, so set them in `custom.config.yml`.

Rely on the applications domain DNS. The installer does not add `/etc/hosts` entries on OCP, whatever `use_etc_hosts` is set to.

On OCP you can choose the storage class for each component's volumes:

| Variable | Volumes |
| --- | --- |
| `POSTGRES_STORAGE_CLASS` | Ascender PostgreSQL |
| `LEDGER_PVC_STORAGE_CLASS` | Ledger database |
| `PROXY_PVC_STORAGE_CLASS` | Galaxy Proxy cache |

Set them before the first installation. Leave them unset to use the cluster's default StorageClass.

## TKGI

The installer deploys onto an existing TKGI cluster; it does not create one.

### TKGI prerequisites

- An existing TKGI cluster running Kubernetes 1.25 or later, and `kubectl` on the control machine.
- A kubeconfig for the cluster with permission to create namespaces and the resources the Ascender Operator and the components need.
- A working ingress controller. The installer detects Contour, which TKGI commonly uses; set `TKGI_INGRESS_CLASS_NAME` to use a different ingress class.
- A default StorageClass, or `POSTGRES_STORAGE_CLASS` set to an existing one.

### Validate cluster access

Confirm that the kubeconfig and context reach the cluster:

```bash
kubectl config get-contexts
kubectl config current-context
kubectl get nodes
```

### TKGI configuration

Start from the sample configuration and inventory in the repository:

```bash
cp docs/installation/tkgi/tkgi.inventory inventory
cp docs/installation/tkgi/tkgi.custom.config.yml custom.config.yml
```

Set `ASCENDER_HOSTNAME`, `ASCENDER_NAMESPACE`, `ASCENDER_ADMIN_PASSWORD`, and the settings for the components you install. Then review the TKGI settings:

| Variable | Description |
| --- | --- |
| `TKGI_KUBECONFIG_PATH` | Kubeconfig to validate. Defaults to `KUBECONFIG`, then `~/.kube/config` |
| `TKGI_K8S_CONTEXT` | Kubeconfig context to validate. Defaults to the current context |
| `TKGI_INGRESS_CLASS_NAME` | Ingress class for all components. When unset, the installer uses Contour if it finds it |
| `POSTGRES_STORAGE_CLASS` | StorageClass for the Ascender PostgreSQL volume. Required when the cluster has no default StorageClass |
| `LEDGER_PVC_STORAGE_CLASS` | StorageClass for the Ledger database volume |

`TKGI_KUBECONFIG_PATH` and `TKGI_K8S_CONTEXT` apply to the checks the installer runs before installing. The installation itself uses `~/.kube/config` and its current context, so make sure they point at the same cluster.

For HTTPS, set `k8s_lb_protocol: https`, `tls_crt_path`, and `tls_key_path`. Use a full-chain certificate file for `tls_crt_path`.

Before installing, the TKGI path checks the kubeconfig and context, cluster connectivity, the Kubernetes version, the ingress controller, StorageClasses, namespace access, and RBAC permissions, and prints a summary.

### External PostgreSQL on TKGI

If you use an external PostgreSQL server, set the `ASCENDER_PGSQL_*` variables described in the [configuration reference](../configuration-reference#external-postgresql). `ASCENDER_PGSQL_HOST` must resolve and be reachable from the Ascender pods, not only from the control machine; use an address the cluster can reach. Prefer a DNS name over an IP address if you plan to validate the server certificate.

### DNS on TKGI

With `use_etc_hosts: true` and a Contour Envoy service that has an external address, the installer adds `/etc/hosts` entries on the control machine for the host name of every component you install. Create DNS records for every host name pointing at your ingress address for production use.

## Next steps

Run `./setup.sh`, then log in to each component as described in [Log in](../install#log-in).
