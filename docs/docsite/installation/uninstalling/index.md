---
title: Uninstalling
description: Remove Ascender components, the whole installation, or a cluster created by the installer.
weight: 32
---

The installer has no uninstall command. You remove Ascender with `kubectl`, using either the manifests the installer saved or by deleting the namespaces.

<Hint type="danger">

Deleting a namespace deletes everything in it, including persistent volume claims and the data on them, without asking. Take a [backup](/admin-guide/backup) first, and check that only Ascender resources live in the namespaces you delete.

</Hint>

## Installer manifests

Each time it runs, the installer saves the manifests it applies in `tmp_dir` (by default `ascender_install_artifacts/` in the repository root), with a timestamp suffix such as `.20260309T214902`:

| File | Contents |
| --- | --- |
| `kustomization.yml.<timestamp>` | The Ascender Operator, including its custom resource definitions |
| `ascender-deployment-<platform>.yml.<timestamp>` | The Ascender deployment and its secrets |
| `ledger_deployment_<platform>.yaml.<timestamp>` | Ledger |
| `proxy_deployment_<platform>.yml.<timestamp>` | Galaxy Proxy |
| `ledger_deployment_registry_secret.yaml.<timestamp>` | The Ledger image pull secret, when `LEDGER_REGISTRY` is set |

Use the most recent copy of each file. The pull secret manifest does not name a namespace, so pass `-n` when deleting it.

## Remove a component

Disable the component in `custom.config.yml` first (for example `LEDGER_INSTALL: false`), so the next run of the installer does not deploy it again.

Ledger has its own namespace. Delete it to remove Ledger and its data:

```bash
kubectl delete namespace ledger
```

When you remove Ledger, also turn off **Enable External Logging** in Ascender's logging settings, because Ascender keeps sending events to the deleted parser.

Galaxy Proxy shares the Ascender namespace, so delete it with its manifests instead:

```bash
cd ascender_install_artifacts
kubectl delete -f proxy_deployment_<platform>.yml.<timestamp>
```

## Remove the whole installation

1. Delete the Ascender deployment. The operator removes the Ascender deployments and the PostgreSQL StatefulSet:

   ```bash
   cd ascender_install_artifacts
   kubectl delete -f ascender-deployment-<platform>.yml.<timestamp>
   ```

   The PostgreSQL volume remains. The Ascender secrets remain too unless `ascender_garbage_collect_secrets` is `true`.

2. Delete the Ascender Operator and its custom resource definitions. `kubectl delete -k` reads a file named `kustomization.yml`, so copy the latest saved copy to that name first:

   ```bash
   cp kustomization.yml.<timestamp> kustomization.yml
   kubectl delete -k .
   ```

   For an online installation the kustomization refers to the operator on GitHub, so this step needs internet access. For an offline installation it uses the `config/` directory the installer copied into `tmp_dir`.

3. Delete the namespaces, which removes the remaining volumes, secrets, and every component:

   ```bash
   kubectl delete namespace ascender
   kubectl delete namespace ledger
   ```

   Use your own namespace names if you changed them. If deleting the Ascender namespace hangs and you used Automation Mesh, see [Namespace deletion hangs](../troubleshooting#namespace-deletion-hangs-when-automation-mesh-is-enabled).

4. Remove any `/etc/hosts` entries the installer added on the control machine.

## Delete a cluster created by the installer

Deleting the cluster removes everything running on it. On EKS, GKE, and AKS, delete the Ascender ingresses first (or delete the namespaces as above) so that the cloud load balancers they created are removed.

### AKS and GKE

The installer creates AKS and GKE clusters with Terraform and keeps the state in `ascender_install_artifacts/aks_deploy/` or `ascender_install_artifacts/gke_deploy/` in the repository root. From the repository root:

```bash
terraform -chdir=ascender_install_artifacts/aks_deploy destroy -auto-approve
```

```bash
terraform -chdir=ascender_install_artifacts/gke_deploy destroy -auto-approve \
  -var project_id=<GKE_PROJECT_ID> -var zone=<GKE_CLUSTER_ZONE>
```

On AKS this also deletes the resource group Terraform created for the cluster. DNS records the installer created in Azure DNS or Cloud DNS are not removed; delete them yourself.

### EKS

The installer creates EKS clusters with the AWS APIs and `eksctl`, not Terraform, and has no teardown. Delete the resources in the AWS console or with the AWS CLI: any remaining load balancers, the node group `<EKS_CLUSTER_NAME>-nodes`, the cluster, the launch template `<EKS_CLUSTER_NAME>-nodes`, the VPC `<EKS_CLUSTER_NAME>-vpc` with its subnets, internet gateway, and security group, and the IAM roles `<EKS_CLUSTER_NAME>-cluster-role` and `<EKS_CLUSTER_NAME>-node-group-role`. A private cluster was created with `eksctl`, so `eksctl delete cluster --name <EKS_CLUSTER_NAME> --region <EKS_CLUSTER_REGION>` removes the cluster and the resources `eksctl` created. Delete the Route 53 records the installer created.

### K3s and RKE2

The installer does not create RKE2 clusters, and it installs K3s only when `kube_install` is `true`. To remove either from a node, use the uninstall scripts they provide, `/usr/local/bin/k3s-uninstall.sh` for K3s and `/usr/bin/rke2-uninstall.sh` (or `/usr/local/bin/rke2-uninstall.sh`) for RKE2.
