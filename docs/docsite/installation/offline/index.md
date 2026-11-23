---
title: Offline installation
description: Build an offline bundle and install Ascender on K3s or DKP without internet access.
weight: 7
---

An offline installation uses a bundle of container images, packages, Ansible collections, and the Ascender Operator that you build on a staging host with internet access and carry into the restricted environment. Set `k8s_offline: true` to make the installer use the bundle instead of the internet.

| Platform | How images reach the cluster | Guide |
| --- | --- | --- |
| K3s | The installer imports image tarballs from the bundle into K3s | This page |
| RKE2 | You import the tarballs into containerd, or push them to a private registry | [RKE2 air-gapped installation](../rke2-offline) |
| DKP | You push the images to a registry the cluster can reach | [DKP](#dkp) on this page |

On every platform, the example projects and job templates (`ascender_setup_playbooks`) are skipped on offline installations because they come from GitHub.

## Build the bundle

Build the bundle on a staging host that has internet access and runs the same Enterprise Linux version as the offline machine, `x86_64`. A minimal installation works best, because packages that are already installed on the staging host are not downloaded. Run these steps as root:

```bash
sudo -i
dnf install -y git dnf-plugins-core ansible-core
git clone https://github.com/ctrliq/ascender-install.git
cd ascender-install
ansible-galaxy collection install -r collections/requirements.yml
```

Run `./config_vars.sh`, select your platform, answer `true` to the offline question on K3s, and enable the components you want. On K3s, also answer `true` to the question about setting up a new cluster if you want the installer to install K3s from the bundle. The bundle includes the Ledger images only when you enable Ledger, and it never includes the Galaxy Proxy image (see below).

If you enable Galaxy Proxy, set this in `custom.config.yml`:

```yaml
ascender_image_pull_policy: IfNotPresent
```

On K3s offline installations the installer forces the pull policy to `Never` for Ascender and Ledger only. Galaxy Proxy uses `ascender_image_pull_policy`, and with the default `Always` its pod tries to pull from the internet.

Build the bundle:

```bash
ansible-playbook playbooks/create_bundle.yml
```

The playbook installs Docker on the staging host and fills the `offline/` directory:

| Directory | Contents |
| --- | --- |
| `offline/images/` | One tarball per image, named `<name>-<tag>.tar`, for Ascender, the operator, PostgreSQL, Valkey, kube-rbac-proxy, the execution environment, and Ledger when you enable it. On K3s it also contains the K3s air-gap image archive |
| `offline/packages/` | `kubectl` and the Python Kubernetes client as RPM packages. On K3s it also contains the K3s binary (`k3s`) and install script (`k3s_install.sh`) |
| `offline/collections/` | The Ansible collections the installer needs |
| `offline/ascender-operator-<version>/` | The Ascender Operator manifests for `ASCENDER_OPERATOR_VERSION` |

Add the packages and images that the bundle does not include:

```bash
dnf download --resolve --destdir offline/packages ansible-core
docker pull busybox:stable
docker save busybox:stable -o offline/images/busybox-stable.tar
```

`ansible-core` is needed to run the installer on the offline machine, and `busybox:stable` is used by [backup](/admin-guide/backup) and [restore](/admin-guide/restore).

If you enable Galaxy Proxy, add its image too, using your `PROXY_VERSION` as the tag. On K3s the installer imports tarballs whose names start with `ascender-galaxy-proxy`:

```bash
docker pull ghcr.io/ctrliq/ascender-galaxy-proxy:latest
docker save ghcr.io/ctrliq/ascender-galaxy-proxy:latest -o offline/images/ascender-galaxy-proxy-latest.tar
```

Copy the whole `ascender-install` directory, including `custom.config.yml`, your certificate files, and `offline/`, to the offline machine.

## Install on K3s

On K3s the installer imports the image tarballs into the cluster with `k3s ctr`, which runs on the control machine. Run the installer on the K3s node itself, as root, with the default `inventory`. The node needs at least 30 GB free for `/var`.

### Install K3s from the bundle

The bundle contains K3s v1.28.6+k3s2. With `kube_install: true`, the installer installs it from the bundle when K3s is not already installed on the node: it copies the K3s binary and the air-gap images into place and runs the bundled install script without the K3s SELinux policy package, which is not part of the bundle. It also stops and disables firewalld unless `firewalld_disable` is `false`.

To install K3s yourself instead, use the K3s air-gap method, and set `kube_install: false`:

```bash
cd /root/ascender-install
setenforce 0
sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
systemctl disable --now firewalld
mkdir -p /var/lib/rancher/k3s/agent/images/
cp offline/images/k3s-airgap-images-amd64.tar.gz /var/lib/rancher/k3s/agent/images/
install -m 0755 offline/packages/k3s /usr/local/bin/k3s
INSTALL_K3S_SKIP_DOWNLOAD=true INSTALL_K3S_SKIP_SELINUX_RPM=true sh offline/packages/k3s_install.sh
k3s kubectl get nodes
```

SELinux is disabled here because the K3s SELinux policy package is not part of the bundle. See the [K3s air-gap documentation](https://docs.k3s.io/installation/airgap) for other options.

### Import the component images

The installer imports the Ascender, operator, Ledger, and Galaxy Proxy tarballs itself, but not the `busybox` tarball. Once K3s is running, import it before you take a backup:

```bash
cd /root/ascender-install/offline/images
for image in busybox-*.tar; do
  [ -f "$image" ] && k3s ctr images import "$image"
done
```

### Run the installer

Install `ansible-core` and the other bundled packages, check the configuration, and run the installer:

```bash
cd /root/ascender-install
dnf install -y --disablerepo='*' offline/packages/*.rpm
grep -E '^(k8s_platform|kube_install|k8s_offline|download_kubeconfig):' custom.config.yml
./setup.sh
```

The configuration should show `k8s_platform: k3s`, `k8s_offline: true`, `download_kubeconfig: true`, and `kube_install: true` unless you installed K3s yourself. `setup.sh` installs the Ansible collections from `offline/collections/`, and the installer installs the RPM packages from `offline/packages/`, installs K3s when `kube_install` is `true`, deploys the Ascender Operator from the bundled manifests, and imports the images.

Create DNS records for the host names pointing at the node, or set `use_etc_hosts: true` to have the installer add `/etc/hosts` entries on the node for evaluation.

## DKP

`config_vars.sh` offers offline mode only for K3s and RKE2, but the DKP installation can also use the bundled Ascender Operator with images from a registry inside your environment. Set these values in `custom.config.yml` by hand:

```yaml
k8s_platform: dkp
k8s_offline: true
k8s_container_registry: registry.internal.example.com/ascender
ascender_image_pull_policy: IfNotPresent
```

Push the images to that registry with the names the installer expects, set `PROXY_IMAGE` to your registry if you install Galaxy Proxy, and configure the cluster to trust and authenticate to it, as described in [Use a private registry instead](../rke2-offline#use-a-private-registry-instead). Build the bundle with `-e k8s_platform=rke2` so that the bundled operator manifests reference `k8s_container_registry`. If Ascender needs credentials to pull from the registry, create a pull secret in the Ascender namespace and set `k8s_image_pull_secret` and `k8s_ee_pull_credentials_secret`.

## Upgrade an offline installation

To upgrade, update `ASCENDER_VERSION`, `ASCENDER_OPERATOR_VERSION`, and the component versions in `custom.config.yml` on the staging host, build the bundle again, transfer it, and run `./setup.sh` on the offline machine. Add the Galaxy Proxy image to the bundle again if you use it. See [Upgrading](../upgrading) for what to check before you start.
