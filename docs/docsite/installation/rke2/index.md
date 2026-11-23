---
title: Installing on RKE2
description: Prepare a single-node or highly available RKE2 cluster and install Ascender on it.
weight: 2
---

RKE2 runs on a single node or as a multi-node highly available (HA) cluster, and runs on [RLC Hardened](https://ciq.com/products/rocky-linux/pro/hardened/) for environments with stricter security requirements.

The installer does not create the RKE2 cluster. You set up RKE2 first, then run the Ascender installer against it. For an environment without internet access, follow [RKE2 air-gapped installation](../rke2-offline) instead.

## Prerequisites

Every RKE2 node needs:

- 4 CPUs
- 8 GB of memory
- 40 GB of disk
- Rocky Linux 8 or 9
- A unique host name, which cannot be changed after installation

Add capacity for each component you enable; see [Persistent storage](..#persistent-storage).

For an HA cluster you also need three nodes and an unused IP address in the same subnet to serve as the virtual IP (VIP). DNS records for the Ascender host names point at the VIP.

## Prepare the nodes

Run these steps on every node before installing RKE2.

### Disable SELinux

RKE2 supports SELinux, but disabling it avoids policy conflicts during installation:

```bash
sudo setenforce 0
sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
```

The first command takes effect immediately. The second makes the change persistent across reboots.

### Disable firewalld

firewalld conflicts with Canal, the default RKE2 network plugin. See the [RKE2 known issues](https://docs.rke2.io/known_issues) for details.

```bash
sudo systemctl disable --now firewalld
```

### Enable time synchronization

Time skew between nodes can cause etcd failures in HA clusters. Make sure chronyd is running:

```bash
sudo dnf install -y chrony
sudo systemctl enable --now chronyd
```

## Install RKE2

<Tabs>
  <Tab label="Single Node">

Create the RKE2 configuration file:

```bash
sudo mkdir -p /etc/rancher/rke2
sudo vim /etc/rancher/rke2/config.yaml
```

```yaml
tls-san:
  - <NODE_IP>
```

Install RKE2 and start the service:

```bash
curl -sfL https://get.rke2.io | sudo sh -
sudo systemctl enable --now rke2-server
```

Add the RKE2 binaries to your `PATH` and set the kubeconfig system-wide:

```bash
sudo tee /etc/profile.d/rke2.sh << 'EOF'
export PATH=$PATH:/var/lib/rancher/rke2/bin
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
EOF
source /etc/profile.d/rke2.sh
```

Verify that the node is `Ready`:

```bash
kubectl get nodes
```

  </Tab>
  <Tab label="Multi-Node HA">

### First server node

Create the configuration directory and generate a cluster token:

```bash
sudo mkdir -p /etc/rancher/rke2
openssl rand -hex 16
```

Write the configuration file with your token and VIP:

```bash
sudo vim /etc/rancher/rke2/config.yaml
```

```yaml
token: <YOUR-GENERATED-TOKEN>
tls-san:
  - <VIP_IP>
  - <VIP_DNS>  # optional, include if connecting through a DNS name
```

Install RKE2 and start the service:

```bash
curl -sfL https://get.rke2.io | sudo sh -
sudo systemctl enable --now rke2-server
```

Add the RKE2 binaries to your `PATH` and set the kubeconfig system-wide:

```bash
sudo tee /etc/profile.d/rke2.sh << 'EOF'
export PATH=$PATH:/var/lib/rancher/rke2/bin
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
EOF
source /etc/profile.d/rke2.sh
```

Before joining other nodes, verify that the first node is `Ready` and that the supervisor port 9345 answers:

```bash
kubectl get nodes
curl -sk https://localhost:9345/ping
```

### Additional server nodes

On each additional node, write a configuration file that points at the first node:

```bash
sudo mkdir -p /etc/rancher/rke2
sudo vim /etc/rancher/rke2/config.yaml
```

```yaml
server: https://<NODE1_IP>:9345
token: <YOUR-GENERATED-TOKEN>
tls-san:
  - <VIP_IP>
  - <VIP_DNS>  # optional, include if connecting through a DNS name
```

Install RKE2 and start the service:

```bash
curl -sfL https://get.rke2.io | sudo sh -
sudo systemctl enable --now rke2-server
```

From the first node, verify that all nodes are `Ready`:

```bash
kubectl get nodes
```

### Set up a VIP

The VIP gives the cluster one stable address. Use either keepalived or kube-vip, not both.

- **keepalived** runs as a system service on each node, outside Kubernetes, so the VIP keeps answering even when the cluster is down.
- **kube-vip** runs in the cluster as a DaemonSet and can also hand out addresses to `LoadBalancer` services. It depends on the cluster being up, because its leader election runs through the API server.

#### keepalived

On the primary node, install keepalived and replace its configuration:

```bash
sudo dnf install -y keepalived
sudo cp /etc/keepalived/keepalived.conf /etc/keepalived/keepalived.conf.bak
sudo truncate -s 0 /etc/keepalived/keepalived.conf
sudo vim /etc/keepalived/keepalived.conf
```

Replace `<INTERFACE>` with the primary network interface (see `ip addr`), `<AUTH_STRING>` with a shared secret (for example from `openssl rand -hex 4`), and `<VIP_ADDRESS>/<CIDR>` with the VIP and its prefix length:

```text
vrrp_instance VI_1 {
    state MASTER
    interface <INTERFACE>
    virtual_router_id 51
    priority 200
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass <AUTH_STRING>
    }
    virtual_ipaddress {
        <VIP_ADDRESS>/<CIDR>
    }
}
```

```bash
sudo systemctl enable --now keepalived
```

On each standby node, use the same configuration with `state BACKUP` and a lower `priority`, such as 150 on the second node and 100 on the third. `interface`, `virtual_router_id`, `auth_pass`, and `virtual_ipaddress` must match the primary. Then enable keepalived and confirm the VIP answers:

```bash
sudo systemctl enable --now keepalived
ping <VIP_ADDRESS>
```

#### kube-vip

Run these steps on the first server node. RKE2 applies any manifest placed in `/var/lib/rancher/rke2/server/manifests/` automatically.

```bash
sudo curl -s https://kube-vip.io/manifests/rbac.yaml \
  -o /var/lib/rancher/rke2/server/manifests/kube-vip-rbac.yaml
```

Generate the DaemonSet manifest. Replace `<INTERFACE>`, `<VIP_ADDRESS>`, and `<KUBE_VIP_VERSION>`, a release tag from the [kube-vip releases page](https://github.com/kube-vip/kube-vip/releases):

```bash
export VIP=<VIP_ADDRESS>
export INTERFACE=<INTERFACE>
export KVVERSION=<KUBE_VIP_VERSION>

sudo /var/lib/rancher/rke2/bin/ctr --address /run/k3s/containerd/containerd.sock \
  --namespace k8s.io image pull ghcr.io/kube-vip/kube-vip:$KVVERSION

sudo /var/lib/rancher/rke2/bin/ctr --address /run/k3s/containerd/containerd.sock \
  --namespace k8s.io run --rm --net-host \
  ghcr.io/kube-vip/kube-vip:$KVVERSION vip /kube-vip manifest daemonset \
  --interface $INTERFACE \
  --address $VIP \
  --inCluster \
  --taint \
  --controlplane \
  --services \
  --arp \
  --leaderElection | sudo tee /var/lib/rancher/rke2/server/manifests/kube-vip-daemonset.yaml
```

Confirm that the DaemonSet rolls out and the VIP answers:

```bash
kubectl rollout status daemonset/kube-vip-ds -n kube-system --timeout=300s
ping <VIP_ADDRESS>
```

  </Tab>
</Tabs>

## Configure storage

RKE2 does not include a storage provisioner. Ascender needs a default StorageClass for its persistent volumes.

<Tabs>
  <Tab label="Single Node">

local-path-provisioner stores volumes under `/opt/local-path-provisioner` on the node:

```bash
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.37/deploy/local-path-storage.yaml
kubectl patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

  </Tab>
  <Tab label="Multi-Node HA">

[Longhorn](https://longhorn.io) replicates volumes across nodes. If you already have a storage system with a Kubernetes CSI driver (NetApp, Pure Storage, vSphere, Ceph, and others), use that instead and make its StorageClass the default.

Install the Longhorn prerequisites on every node:

```bash
sudo dnf install -y iscsi-initiator-utils nfs-utils
sudo systemctl enable --now iscsid
```

Install Longhorn from the first node:

```bash
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.11.3/deploy/longhorn.yaml
```

Longhorn creates a `longhorn` StorageClass and makes it the default. Longhorn v1.11.3 requires Kubernetes 1.34 or later; on older clusters use Longhorn v1.11.2. See the [Longhorn installation documentation](https://longhorn.io/docs/1.11.3/deploy/install/install-with-kubectl/) for details.

  </Tab>
</Tabs>

## Install Ascender

Run the installer on the first server node, as root. Prepare the control machine, clone the installer, and create a certificate as described in [Installing Ascender](../install#prepare-the-control-machine). The certificate must cover every host name you configure.

Run `./config_vars.sh`, select `rke2`, answer `false` to the offline question, and enter the node IP (or the VIP for an HA cluster) when asked for the routable IP address of the Kubernetes API server. Then check these values in `custom.config.yml`:

```yaml
k8s_platform: rke2
k8s_offline: false
k8s_lb_protocol: https
download_kubeconfig: true
kubeapi_server_ip: <NODE_IP or VIP_ADDRESS>
use_etc_hosts: false

tls_crt_path: ~/ascender.crt
tls_key_path: ~/ascender.key

ASCENDER_HOSTNAME: ascender.example.com
LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.example.com
```

With `download_kubeconfig: true`, the installer copies `/etc/rancher/rke2/rke2.yaml` from `ascender_host` to `~/.kube/config`. If `ascender_host` is a remote node, it also replaces `127.0.0.1` in the copied file with `kubeapi_server_ip`.

On an HA cluster, run more replicas to use the extra capacity:

```yaml
ascender_replicas: 2
ledger_web_replicas: 2
ledger_parser_replicas: 2
```

Run the installer:

```bash
./setup.sh
```

### DNS on RKE2

The installer exposes every component through the NGINX ingress controller that RKE2 includes, on ports 80 and 443 of every node. Create DNS records that point each configured host name at the node IP or the VIP.

If you set `use_etc_hosts: true`, the installer adds `/etc/hosts` entries on the control machine for the host name of every component you install, pointing at `kubeapi_server_ip`.

## Verify the installation

```bash
kubectl get pods -A | grep -E 'ascender|ledger'
```

All pods should be `Running` or `Completed`. Then log in to each component as described in [Log in](../install#log-in).

## Troubleshooting

### fail2ban blocks communication between nodes

If fail2ban runs on the cluster nodes, its rules can block traffic between them. Symptoms include metrics-server failures, the Ascender Operator stalling on `Create imagePullSecret`, and pods in `CrashLoopBackOff`. Add every node IP to `ignoreip` in `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 <NODE1_IP> <NODE2_IP> <NODE3_IP>
```

Then restart fail2ban:

```bash
sudo systemctl restart fail2ban
```

See [Troubleshooting](../troubleshooting) for other installer problems.
