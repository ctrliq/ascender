---
title: RKE2 air-gapped installation
description: Install Ascender on an RKE2 cluster with no internet access, using images staged on a connected host.
weight: 8
---

This guide installs Ascender on an RKE2 cluster that has no internet access. You build an offline bundle on a staging host that has internet access, carry it to the air-gapped nodes, load the images into containerd, and run the installer from the bundle. RKE2's embedded registry mirror (Spegel) shares the images between cluster nodes, so no separate container registry is needed.

If your environment already has a private container registry, see [Use a private registry instead](#use-a-private-registry-instead).

## Prerequisites

### Staging host

- Internet access, including the public container registries.
- The same operating system and version as the air-gapped nodes (Rocky Linux 8 or 9, `x86_64`), so the RPM packages it downloads install cleanly on the nodes. A minimal installation works best, because packages that are already installed on the staging host are not downloaded.
- Root access. The bundle playbook installs Docker and other packages on the staging host.

### Air-gapped nodes

Every RKE2 node needs 4 CPUs, 8 GB of memory, 40 GB of disk, Rocky Linux 8 or 9 on `x86_64`, and a unique host name. For an HA cluster you need three nodes and an unused IP address in the same subnet for the virtual IP (VIP).

## Prepare the bundle on the staging host

Run these steps as root on the staging host.

```bash
sudo -i
```

### Download RKE2

Download the RKE2 artifacts for your target version from the [RKE2 releases page](https://github.com/rancher/rke2/releases). The embedded registry mirror needs RKE2 v1.31.4 or later; this example uses v1.35.7+rke2r1.

```bash
mkdir -p ~/ascender-airgap/rke2-artifacts
cd ~/ascender-airgap/rke2-artifacts

RKE2_VERSION=v1.35.7+rke2r1
curl -LO "https://github.com/rancher/rke2/releases/download/${RKE2_VERSION}/rke2.linux-amd64.tar.gz"
curl -LO "https://github.com/rancher/rke2/releases/download/${RKE2_VERSION}/rke2-images.linux-amd64.tar.zst"
curl -LO "https://github.com/rancher/rke2/releases/download/${RKE2_VERSION}/sha256sum-amd64.txt"
curl -Lo install.sh https://get.rke2.io
```

### Get the installer and its collections

```bash
dnf install -y git dnf-plugins-core ansible-core
git clone https://github.com/ctrliq/ascender-install.git ~/ascender-airgap/ascender-install
cd ~/ascender-airgap/ascender-install
ansible-galaxy collection install -r collections/requirements.yml
```

### Create the certificate

Create the TLS certificate now so it travels with the bundle. It must cover every host name you configure. This example covers Ascender and Ledger:

```bash
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout ~/ascender-airgap/ascender-install/ascender.key \
  -out ~/ascender-airgap/ascender-install/ascender.crt \
  -subj "/CN=ascender.example.com" \
  -addext "subjectAltName=DNS:ascender.example.com,DNS:ledger.example.com"
```

To use a certificate from your certificate authority, copy its `.crt` and `.key` files into the `ascender-install` directory instead.

### Configure the installer

Run `./config_vars.sh`. Select `rke2`, answer `true` to the offline question, and press Enter at the internal registry and image pull secret questions to leave them empty. Enable the components you want.

Then edit `custom.config.yml` and make sure it contains these values:

```yaml
k8s_platform: rke2
k8s_offline: true
k8s_container_registry: ""
k8s_lb_protocol: https
download_kubeconfig: true
kubeapi_server_ip: <NODE1_IP or VIP_ADDRESS>
use_etc_hosts: false

tls_crt_path: "{{ playbook_dir }}/../ascender.crt"
tls_key_path: "{{ playbook_dir }}/../ascender.key"

ascender_image_pull_policy: IfNotPresent
ascender_setup_playbooks: true
```

The certificate paths above point at the files in the repository root, wherever the bundle ends up. If you enable Galaxy Proxy, set `PROXY_TLS_CRT_PATH` and `PROXY_TLS_KEY_PATH` to the same values.

<Hint type="warning" title="Set the image pull policy">

`ascender_image_pull_policy: IfNotPresent` is required. The RKE2 offline path does not set a pull policy for you, and `config_vars.sh` does not ask for one in offline mode, so the value from `default.config.yml` (`Always`) is kept. With `Always`, every pod tries to pull its image from the internet and fails.

</Hint>

With `k8s_container_registry` empty, the installer uses the original image names (`ghcr.io/ctrliq/ascender`, `ghcr.io/ctrliq/ascender-ledger/ledger-web`, and so on), which match the images you load into containerd. If you set `LEDGER_REGISTRY`, it can stay in the file: at install time it is only used to create the Ledger image pull secret, and nothing is pulled while the images are present on the nodes. The example projects and job templates (`ascender_setup_playbooks`) are skipped automatically on offline installations, because their projects come from GitHub.

### Build the bundle

The bundle playbook downloads RPM packages, Ansible collections, and the Ascender Operator into `offline/`, installs Docker, pulls the images for Ascender and, when you enable it, Ledger, and saves each image as a tarball in `offline/images/`. Run it with `k8s_platform=k3s`, which selects the image-saving path that this workflow uses:

```bash
cd ~/ascender-airgap/ascender-install
ansible-playbook playbooks/create_bundle.yml -e k8s_platform=k3s
```

Tarballs are named after the image and tag, for example `ascender-25.6.3.tar`, `postgres-latest.tar`, and `ledger-web-latest.tar`.

Add the images that the bundle playbook does not include. local-path-provisioner needs `busybox`, and Ascender [backup](/admin-guide/backup) and [restore](/admin-guide/restore) use `busybox:stable`:

```bash
for image in busybox:latest busybox:stable; do
  docker pull "$image"
  docker save "$image" -o "offline/images/$(echo "$image" | tr ':' '-').tar"
done
```

If you enable Galaxy Proxy, also save its image, using your `PROXY_VERSION` as the tag:

```bash
docker pull ghcr.io/ctrliq/ascender-galaxy-proxy:latest
docker save ghcr.io/ctrliq/ascender-galaxy-proxy:latest -o offline/images/ascender-galaxy-proxy-latest.tar
```

The air-gapped node needs `ansible-core` before it can run the installer. Download it into the bundle:

```bash
dnf download --resolve --destdir ~/ascender-airgap/ascender-install/offline/packages ansible-core
```

### Stage storage

<Tabs>
  <Tab label="Single Node">

local-path-provisioner is enough for a single node:

```bash
mkdir -p ~/ascender-airgap/storage
curl -Lo ~/ascender-airgap/storage/local-path-storage.yaml \
  https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.37/deploy/local-path-storage.yaml
docker pull rancher/local-path-provisioner:v0.0.37
docker save rancher/local-path-provisioner:v0.0.37 -o ~/ascender-airgap/storage/local-path-provisioner.tar
```

  </Tab>
  <Tab label="Multi-Node HA">

Longhorn replicates volumes across nodes. Download its prerequisites, manifest, and images. Longhorn v1.11.3 requires Kubernetes 1.34 or later; use v1.11.2 with older RKE2 releases.

```bash
mkdir -p ~/ascender-airgap/storage/rpms ~/ascender-airgap/storage/longhorn-images
dnf download --resolve --destdir ~/ascender-airgap/storage/rpms iscsi-initiator-utils nfs-utils

LONGHORN_VERSION=v1.11.3
cd ~/ascender-airgap/storage
curl -Lo longhorn.yaml https://raw.githubusercontent.com/longhorn/longhorn/${LONGHORN_VERSION}/deploy/longhorn.yaml
curl -Lo longhorn-images.txt https://raw.githubusercontent.com/longhorn/longhorn/${LONGHORN_VERSION}/deploy/longhorn-images.txt

while IFS= read -r image; do
  docker pull "$image"
  docker save "$image" -o "longhorn-images/$(echo "$image" | tr '/:' '-').tar"
done < longhorn-images.txt
```

If you plan to use kube-vip for the VIP, also stage its RBAC manifest and image (replace `<KUBE_VIP_VERSION>` with a release tag):

```bash
mkdir -p ~/ascender-airgap/kube-vip
curl -Lo ~/ascender-airgap/kube-vip/kube-vip-rbac.yaml https://kube-vip.io/manifests/rbac.yaml
docker pull ghcr.io/kube-vip/kube-vip:<KUBE_VIP_VERSION>
docker save ghcr.io/kube-vip/kube-vip:<KUBE_VIP_VERSION> -o ~/ascender-airgap/kube-vip/kube-vip.tar
```

  </Tab>
</Tabs>

### Transfer the bundle

Copy the whole `ascender-airgap` directory to your transfer media:

```text
ascender-airgap/
├── rke2-artifacts/           RKE2 binaries, system images, and install script
├── storage/                  Storage manifests, images, and RPMs
├── kube-vip/                 Only when using kube-vip
└── ascender-install/
    ├── custom.config.yml
    ├── ascender.crt
    ├── ascender.key
    └── offline/
        ├── images/           Ascender image tarballs
        ├── packages/         RPM packages, including ansible-core
        ├── collections/      Ansible collections
        └── ascender-operator-<version>/
```

## Set up the first node

Copy `ascender-airgap` to `/root` on the first node and run the following as root.

### Prepare the operating system

```bash
setenforce 0
sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
systemctl disable --now firewalld
systemctl enable --now chronyd
```

### Install RKE2

```bash
mkdir -p /var/lib/rancher/rke2/agent/images/
cp /root/ascender-airgap/rke2-artifacts/rke2-images.linux-amd64.tar.zst /var/lib/rancher/rke2/agent/images/
INSTALL_RKE2_ARTIFACT_PATH=/root/ascender-airgap/rke2-artifacts sh /root/ascender-airgap/rke2-artifacts/install.sh
```

### Enable the embedded registry mirror

```bash
mkdir -p /etc/rancher/rke2
vim /etc/rancher/rke2/config.yaml
```

<Tabs>
  <Tab label="Single Node">

```yaml
embedded-registry: true
tls-san:
  - <NODE1_IP>
```

  </Tab>
  <Tab label="Multi-Node HA">

Generate a token with `openssl rand -hex 16` and use it on every node:

```yaml
token: <YOUR-GENERATED-TOKEN>
embedded-registry: true
tls-san:
  - <VIP_IP>
  - <VIP_DNS>  # optional, include if connecting through a DNS name
```

  </Tab>
</Tabs>

Create `/etc/rancher/rke2/registries.yaml` so that containerd routes every image pull through the mirror. Without it the mirror runs but is bypassed:

```yaml
mirrors:
  "*":
```

### Start RKE2

```bash
systemctl enable --now rke2-server
```

Startup takes several minutes while RKE2 imports its system images. Follow it with `journalctl -u rke2-server -f`. Then add the RKE2 tools to your `PATH` and check the node:

```bash
tee /etc/profile.d/rke2.sh << 'EOF'
export PATH=$PATH:/var/lib/rancher/rke2/bin
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
EOF
source /etc/profile.d/rke2.sh
kubectl get nodes
```

### Import the Ascender images

```bash
cd /root/ascender-airgap/ascender-install/offline/images
for image in *.tar; do
  ctr --address /run/k3s/containerd/containerd.sock -n k8s.io image import "$image"
done
```

Importing takes several minutes; the execution environment image alone can take three or four. Verify the result:

```bash
ctr --address /run/k3s/containerd/containerd.sock -n k8s.io image list -q | grep ctrliq
```

The tarball for the K3s air-gap images (`k3s-airgap-images-amd64.tar.gz`) is not needed on RKE2 and is skipped by the loop.

## Complete the cluster

<Tabs>
  <Tab label="Single Node">

Import the local-path-provisioner image, apply its manifest, and make it the default StorageClass:

```bash
ctr --address /run/k3s/containerd/containerd.sock -n k8s.io image import /root/ascender-airgap/storage/local-path-provisioner.tar
kubectl apply -f /root/ascender-airgap/storage/local-path-storage.yaml
kubectl patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

  </Tab>
  <Tab label="Multi-Node HA">

### Join the other nodes

Nodes must reach each other on TCP ports 5001 (registry mirror) and 9345 (RKE2 supervisor). On each additional node, copy `ascender-airgap` to `/root`, prepare the operating system, and install RKE2 as on the first node. Use this configuration file, together with the same `registries.yaml`:

```yaml
server: https://<NODE1_IP>:9345
token: <YOUR-GENERATED-TOKEN>
embedded-registry: true
tls-san:
  - <VIP_IP>
  - <VIP_DNS>  # optional, include if connecting through a DNS name
```

Start `rke2-server` and check from the first node that every node is `Ready`. The mirror distributes images from the first node automatically.

### Set up the VIP

Set up keepalived or kube-vip as described in [Installing on RKE2](../rke2), with these differences: install keepalived from RPMs you staged, or import the staged kube-vip image on every server node with `ctr ... image import /root/ascender-airgap/kube-vip/kube-vip.tar` and copy `kube-vip-rbac.yaml` into `/var/lib/rancher/rke2/server/manifests/` instead of downloading it.

### Configure storage

On every node, install the Longhorn prerequisites and import the Longhorn images:

```bash
dnf install -y --disablerepo='*' /root/ascender-airgap/storage/rpms/*.rpm
systemctl enable --now iscsid
for image in /root/ascender-airgap/storage/longhorn-images/*.tar; do
  ctr --address /run/k3s/containerd/containerd.sock -n k8s.io image import "$image"
done
```

From the first node, apply the manifest and wait for the pods to start:

```bash
kubectl apply -f /root/ascender-airgap/storage/longhorn.yaml
kubectl get pods -n longhorn-system --watch
```

Longhorn creates the `longhorn` StorageClass and makes it the default. To use an existing storage system instead, make its StorageClass the default or set `POSTGRES_STORAGE_CLASS`.

  </Tab>
</Tabs>

## Install Ascender

Install `ansible-core` and the other bundled packages, then run the installer:

```bash
dnf install -y --disablerepo='*' /root/ascender-airgap/ascender-install/offline/packages/*.rpm
cd /root/ascender-airgap/ascender-install
./setup.sh
```

`setup.sh` installs the Ansible collections from `offline/collections/`, the installer installs the remaining packages from `offline/packages/`, and the Ascender Operator is deployed from the copy in `offline/`. A successful run ends with `ASCENDER SUCCESSFULLY SETUP`.

Create DNS records for each host name pointing at the node IP or VIP before running the installer, or add them to `/etc/hosts` on the node. The installer checks every component through its host name.

For an HA cluster, consider raising `ascender_replicas`, `ledger_web_replicas`, and `ledger_parser_replicas` to 2 before running the installer.

## Verify the installation

```bash
kubectl get pods -A | grep -E 'ascender|ledger'
```

All pods should be `Running` or `Completed`. Log in to each component as described in [Log in](../install#log-in).

## Use a private registry instead

If the cluster can pull from an internal registry, you can push the images there instead of loading them into containerd. Set `k8s_container_registry` to the registry and namespace, for example `registry.internal.example.com/ascender`, and configure registry credentials and any mirrors for the nodes in `/etc/rancher/rke2/registries.yaml` as described in the [RKE2 private registry documentation](https://docs.rke2.io/install/private_registry). If Ascender needs credentials to pull, also create a pull secret in the Ascender namespace and set `k8s_image_pull_secret` (and `k8s_ee_pull_credentials_secret` for execution environment images).

With `k8s_container_registry` set, the installer expects these image references:

| Image | Reference the installer uses |
| --- | --- |
| Ascender | `<k8s_container_registry>/ascender:<ASCENDER_VERSION>` |
| Execution environment | `<k8s_container_registry>/ascender-ee:<ASCENDER_VERSION>` |
| Ascender Operator | `<k8s_container_registry>/ascender-operator:<ASCENDER_OPERATOR_VERSION>` |
| kube-rbac-proxy | `<k8s_container_registry>/kube-rbac-proxy:v0.21.0` |
| PostgreSQL | `<k8s_container_registry>/sclorg/postgresql-15-c9s:latest` |
| Valkey | `<k8s_container_registry>/valkey:9-alpine` |
| Ledger | `<k8s_container_registry>/ledger-web`, `ledger-parser`, and `ledger-db`, tagged `<LEDGER_VERSION>` |
| Galaxy Proxy | The value of `PROXY_IMAGE`, which you must set to your registry |

Running the bundle playbook with `-e k8s_platform=rke2` and `k8s_container_registry` set, from a host that can reach both the internet and your registry, asks whether to pull, tag, and push the images to `<k8s_container_registry>/<image name>:<tag>`. It also points the bundled operator at your registry. It pushes PostgreSQL as `postgresql-15-c9s` rather than `sclorg/postgresql-15-c9s`, so tag and push PostgreSQL under the `sclorg/` path yourself. It does not push the Galaxy Proxy image. In this variant you do not need the embedded registry mirror or the `ctr image import` steps, and `ascender_image_pull_policy` can stay at its default.
