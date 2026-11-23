---
title: Automation Mesh
description: Expose the Ascender Automation Mesh ingress so remote execution nodes can connect to Ascender running on Kubernetes.
weight: 21
---

Automation Mesh lets Ascender run jobs on execution nodes outside the Kubernetes cluster. Because Ascender's control plane runs inside the cluster, the installer adds a hop node in the cluster that bridges the execution nodes and the control plane. Execution nodes reach the hop node through an ingress at a dedicated host name on port 443, instead of connecting directly to the receptor port.

## Enable the mesh ingress on K3s

On K3s the installer creates the mesh ingress for you. It uses an `AWXMeshIngress` resource with a Traefik `IngressRouteTCP` and TLS passthrough.

1. Choose a host name for the mesh, different from `ASCENDER_HOSTNAME`, and set it in `custom.config.yml`:

   ```yaml
   ASCENDER_HOSTNAME: ascender.example.com
   ASCENDER_MESH_HOSTNAME: mesh.ascender.example.com
   ```

   When `ASCENDER_MESH_HOSTNAME` is not set, the installer skips the mesh ingress.

2. Run the installer again:

   ```bash
   ./setup.sh
   ```

3. Make the host name resolve, from every execution node, to the address of the cluster's ingress. Create a DNS record, or add an `/etc/hosts` entry on each execution node:

   ```bash
   echo "192.0.2.50 mesh.ascender.example.com" | sudo tee -a /etc/hosts
   ```

   Replace `192.0.2.50` with the ingress address. Test resolution from an execution node with `nslookup mesh.ascender.example.com`.

Execution nodes must be able to open TCP connections to the mesh host name on port 443.

### Verify the mesh ingress

```bash
kubectl get ingressroutetcp.traefik.io -n ascender
kubectl describe ingressroutetcp.traefik.io/ascender-app-mesh -n ascender
```

The route `ascender-app-mesh` should match `HostSNI` for your mesh host name on the `websecure` entry point, with TLS passthrough to the `ascender-app-mesh` Service. In Ascender, the hop node appears under **Infrastructure** > **Instances**.

To remove the mesh ingress, delete `ASCENDER_MESH_HOSTNAME` from `custom.config.yml` and run the installer again. If you later delete the Ascender namespace, see [Namespace deletion hangs](../troubleshooting#namespace-deletion-hangs-when-automation-mesh-is-enabled).

## Other platforms

On platforms other than K3s, the installer does not create the mesh ingress, even if `ASCENDER_MESH_HOSTNAME` is set. Create the `AWXMeshIngress` resource yourself in the Ascender namespace. Your ingress controller must support TLS passthrough, and the mesh host name must resolve to the ingress from every execution node.

For the NGINX ingress controller (RKE2, GKE, AKS), first enable SSL passthrough as described in the [ingress-nginx documentation](https://kubernetes.github.io/ingress-nginx/user-guide/tls/#ssl-passthrough), then apply:

```yaml
apiVersion: awx.ansible.com/v1alpha1
kind: AWXMeshIngress
metadata:
  name: ascender-app-mesh
  namespace: ascender
spec:
  deployment_name: ascender-app
  ingress_type: Ingress
  ingress_controller: nginx
  ingress_class_name: nginx
  external_hostname: mesh.ascender.example.com
```

For Traefik (DKP), apply:

```yaml
apiVersion: awx.ansible.com/v1alpha1
kind: AWXMeshIngress
metadata:
  name: ascender-app-mesh
  namespace: ascender
spec:
  deployment_name: ascender-app
  ingress_type: IngressRouteTCP
  ingress_controller: traefik
  ingress_class_name: traefik
  ingress_api_version: traefik.io/v1alpha1
  external_hostname: mesh.ascender.example.com
```

On OpenShift, set `ingress_type: Route`. `deployment_name` must be `ascender-app`, the name the installer gives the Ascender deployment.

```bash
kubectl apply -f mesh-ingress.yml
```

## Add an execution node

After the mesh ingress is running:

1. In Ascender, go to **Infrastructure** > **Instances** and add an instance with **Node Type** set to **Execution**. The host name you enter becomes the node's receptor ID and must match the remote system.
2. Open the instance and, on the **Peers** tab, add the mesh ingress instance as a peer. Do this before downloading the install bundle; the peer address is written into the bundle when you download it.
3. Download the install bundle from the instance, extract it on a machine that can reach the execution node over SSH, update `inventory.yml` with the SSH user and key, and run it:

   ```bash
   tar -xzf <hostname>_install_bundle.tar.gz
   cd <hostname>_install_bundle
   ansible-galaxy collection install -r requirements.yml
   ansible-playbook -i inventory.yml install_receptor.yml
   ```

4. The node shows as healthy under **Infrastructure** > **Instances** after its first health check. If it stays unavailable, check `systemctl status receptor` and `journalctl -u receptor` on the node. Common causes are a firewall blocking outbound port 443 and a host name that does not match the instance.

See [Instances](/admin-guide/instances) and [Instance groups](/user-guide/instance-groups) for managing nodes and routing jobs to them.
