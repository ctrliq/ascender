---
title: Installing Ascender
description: Install Ascender with the Ascender installer, starting with a single-node K3s quick start.
weight: 1
---

This guide walks through an installation with the [Ascender installer](https://github.com/ctrliq/ascender-install). It starts with a complete single-node K3s example, then describes each step in detail so you can apply it to any [supported platform](..#supported-platforms). Platform-specific preparation is covered in the platform guides.

## How the installer works

The installer is an Ansible project. You run it from a control machine, and it reaches the Kubernetes cluster through the kubeconfig at `~/.kube/config` of the user running it.

- `config_vars.sh` asks a series of questions and writes your answers to `custom.config.yml` in the repository root.
- `inventory` names the target host, `ascender_host`. On K3s and RKE2 this is the node the installer reads the cluster kubeconfig from. For cloud platforms it is the control machine itself.
- `setup.sh` installs Ansible and its dependencies if needed, then runs the installation playbooks with your configuration.

When `setup.sh` runs, it:

1. Checks the configuration and, on K3s, the CPU, memory, operating system, and free disk space of the target node.
2. Installs `kubectl`, the Python Kubernetes client, and any cloud CLI tools the platform needs on the control machine, then connects to (or provisions) the cluster. On K3s with `kube_install: true`, it installs K3s on the target node if it is not already there.
3. Installs the Ascender Operator and deploys Ascender, then waits for the Ascender API to respond.
4. Installs Ledger and Galaxy Proxy, in that order, for each component you enabled.
5. Adds a set of example projects, inventories, and job templates to Ascender when `ascender_setup_playbooks` is `true` and the installation is online.

## Quick start: K3s

This example installs Ascender and Ledger on one Rocky Linux 9 server running K3s, using HTTPS with a self-signed certificate and [nip.io](https://nip.io) host names, so no DNS changes are required. nip.io is a public wildcard DNS service: `ascender.<SERVER-IP>.nip.io` resolves to `<SERVER-IP>`.

You need:

- A Rocky Linux 9 `x86_64` server with at least 2 vCPUs, 8 GB of memory, and 20 GB free for `/var`, with internet access.

Run every command in this section as root on the server. Replace `<SERVER-IP>` with the server's IP address throughout.

```bash
sudo -i
```

### Install K3s

The installer installs K3s for you when you answer `true` to the question about setting up a new K3s cluster, as in the answers below. It stops and disables firewalld, which conflicts with K3s networking, and installs K3s with its defaults (Traefik ingress and the `local-path` storage class). If K3s is already running on the server, the installer uses it as it is.

### Get the installer

```bash
dnf install -y git
git clone https://github.com/ctrliq/ascender-install.git
cd ascender-install
```

### Create a TLS certificate

Create a self-signed certificate that covers both host names. The installer looks for `~/ascender.crt` and `~/ascender.key` by default:

```bash
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout ~/ascender.key -out ~/ascender.crt \
  -subj "/CN=ascender.<SERVER-IP>.nip.io" \
  -addext "subjectAltName=DNS:ascender.<SERVER-IP>.nip.io,DNS:ledger.<SERVER-IP>.nip.io"
```

Your browser will warn about the self-signed certificate. Use a certificate from a trusted certificate authority for anything beyond evaluation.

### Generate the configuration

Run the configuration script:

```bash
./config_vars.sh
```

Menu questions list numbered options; type the number of the option you want. Press Enter on any question to accept the default shown in brackets. Answer the questions as follows and accept the defaults for everything else:

| Question | Answer |
| --- | --- |
| Kubernetes platform | `k3s` |
| Set up a new k3s/k8s on premise cluster | `true` |
| Use local assets for an OFFLINE install | `false` |
| Download the kubeconfig file to the Ansible controller | `true` |
| Protocol | `https` |
| Routable IP address for the K3s Master/Worker node | `<SERVER-IP>` |
| Use the local `/etc/hosts` file for DNS resolution | `false` |
| TLS certificate and private key locations | Accept the defaults, `~/ascender.crt` and `~/ascender.key` |
| DNS resolvable hostname for Ascender service | `ascender.<SERVER-IP>.nip.io` |
| Administrator password for Ascender | A password of your choice |
| Use an external PostgreSQL database | `false` |
| Install Ledger | `true` |
| DNS resolvable hostname for Ledger service | `ledger.<SERVER-IP>.nip.io` |
| Admin password for Ledger | A password of your choice |
| Password for Ledger database | A password of your choice |
| Install the Ascender Galaxy Proxy | `false` |

The script writes `custom.config.yml`. Open it and confirm these values:

```yaml
k8s_platform: k3s
kube_install: true
k8s_offline: false
download_kubeconfig: true
k8s_lb_protocol: https
k3s_master_node_ip: <SERVER-IP>
use_etc_hosts: false
tls_crt_path: ~/ascender.crt
tls_key_path: ~/ascender.key
ASCENDER_HOSTNAME: ascender.<SERVER-IP>.nip.io
LEDGER_INSTALL: true
LEDGER_HOSTNAME: ledger.<SERVER-IP>.nip.io
```

The default `inventory` file already targets the local machine, so no inventory changes are needed.

### Run the installer

```bash
./setup.sh
```

The installation, including K3s, takes 10 to 20 minutes. Waiting tasks such as `Wait until Ascender API is Up` print `FAILED - RETRYING` lines while they poll; that is expected. A successful run ends with:

```text
ASCENDER SUCCESSFULLY SETUP
```

### Log in

Check that the pods are running:

```bash
kubectl get pods -n ascender
kubectl get pods -n ledger
```

Then open:

- Ascender at `https://ascender.<SERVER-IP>.nip.io`, as `admin` with the Ascender administrator password.
- Ledger at `https://ledger.<SERVER-IP>.nip.io`, as `admin` with the Ledger administrator password.

To add Galaxy Proxy later, run `./config_vars.sh` again (your previous answers become the defaults), answer `true` for the component, and run `./setup.sh` again. Add its host name to the certificate first. Next, follow the [Ascender quick start](/user-guide/quick-start) to run your first job.

## Prepare the control machine

On Enterprise Linux:

```bash
sudo dnf install -y git
```

On Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Clone the installer and change into it. All later commands run from this directory:

```bash
git clone https://github.com/ctrliq/ascender-install.git
cd ascender-install
```

Run `config_vars.sh` and `setup.sh` as the same user. That user's `~/.kube/config` is the kubeconfig the installer uses, and for cloud platforms that user's cloud CLI credentials are the ones the installer uses. The K3s and RKE2 examples in these guides run as root. For EKS, GKE, and AKS, run as a regular user with passwordless `sudo`, as described in each platform guide.

## Generate the configuration

Run the interactive configuration script:

```bash
./config_vars.sh
```

The script asks only for the values needed by the platform and components you choose, and writes a complete `custom.config.yml` that combines your answers with every other setting from `default.config.yml`. If `custom.config.yml` already exists, its values become the defaults, so you can run the script again to change a few answers.

The questions cover, in order:

1. The Kubernetes platform, for K3s whether the installer should install K3s, and for K3s and RKE2 whether this is an offline installation (for an offline RKE2 installation, also the internal registry and image pull secrets).
2. Additional execution environment images, whether to download the kubeconfig from the target host, HTTP or HTTPS, and platform settings such as the K3s node IP, the RKE2 API server IP, or cloud cluster details.
3. Whether to add entries to `/etc/hosts`, and the TLS certificate and key paths when you choose HTTPS.
4. The artifacts directory, and the Ascender host name, namespace, administrator user and password, version, operator version, `ascender_garbage_collect_secrets`, an optional external PostgreSQL database, replica count, image pull policy, and whether to add the example playbooks.
5. Whether to install Ledger, and its host name, replica counts, version, namespace, administrator password, and database password.
6. Whether to install Galaxy Proxy, and its host name, image, version, cache, URL, upstream, HTTP proxy, and token settings.

Passwords and tokens cannot contain double quotes.

Keep `custom.config.yml` after the installation. It holds your passwords and every other value the installer needs for upgrades, backups, and restores, so store it as securely as any other credential.

### Edit custom.config.yml

You can edit `custom.config.yml` directly, before the first installation or later, and run `setup.sh` again to apply the change. Variables are described in the [configuration reference](../configuration-reference).

<Hint type="warning" title="custom.config.yml replaces default.config.yml">

When `custom.config.yml` exists, the installer does not read `default.config.yml` at all. Any variable missing from `custom.config.yml` falls back to the installer's internal defaults in `playbooks/group_vars/all.yml`, which do not include `PROXY_TLS_CRT_PATH` or `PROXY_TLS_KEY_PATH`. If you write `custom.config.yml` by hand, start from the output of `config_vars.sh` or a copy of `default.config.yml` rather than an empty file.

</Hint>

## Configure the inventory

The `inventory` file at the repository root defines `ascender_host` in the `ascender` group. The default targets the control machine itself:

```ini
[localhost]
localhost ansible_host=localhost ansible_connection=local

[ascender]
ascender_host ansible_host=localhost ansible_connection=local
```

Keep this default when the control machine is the K3s or RKE2 node, and for DKP, OCP, and TKGI. For EKS, GKE, and AKS, also set `ansible_user` to the installing user on both lines; the repository includes sample inventories in `docs/installation/<platform>/`.

To run the installer from a different machine than the K3s or RKE2 node, point `ascender_host` at the node over SSH. The user must be able to use `sudo` on the node:

```ini
[ascender]
ascender_host ansible_host=192.0.2.10 ansible_user=rocky ansible_ssh_private_key_file=~/.ssh/id_rsa
```

With a remote `ascender_host` and `download_kubeconfig: true` (or, on K3s, `kube_install: true`), the installer copies the cluster kubeconfig from the node to `~/.kube/config` on the control machine and replaces `127.0.0.1` in it with `k3s_master_node_ip` (K3s) or `kubeapi_server_ip` (RKE2).

If an `inventory.yml` file exists in the repository root, `setup.sh` uses it instead of `inventory`.

## Prepare TLS certificates

For `k8s_lb_protocol: https` on platforms other than EKS, place a PEM certificate and its unencrypted private key on the control machine and set their paths:

```yaml
tls_crt_path: "~/ascender.crt"
tls_key_path: "~/ascender.key"
```

The certificate is used for Ascender and Ledger. Galaxy Proxy reads its own path variables, `PROXY_TLS_CRT_PATH` and `PROXY_TLS_KEY_PATH`, which default to the same `~/ascender.crt` and `~/ascender.key` files. `config_vars.sh` copies the paths you enter to the Galaxy Proxy variables.

If you use an internal certificate authority, also set `custom_cacert_bundle` so Ascender trusts it. See [TLS and certificates](../configuration-reference#tls-and-certificates).

## Run the installer

```bash
./setup.sh
```

The script prints the inventory file it uses, installs anything missing, and runs the playbooks. It ends with `ASCENDER SUCCESSFULLY SETUP`, or with `ERROR OCCURRED DURING SETUP` and a non-zero exit code. If the run fails, fix the cause and run `./setup.sh` again; the installer is safe to re-run. See [Troubleshooting](../troubleshooting) for common failures.

`setup.sh` also accepts these options, each of which runs a single task instead of the installation:

| Option | Action |
| --- | --- |
| `-b` | [Back up](/admin-guide/backup) Ascender |
| `-r` | [Restore](/admin-guide/restore) Ascender from the most recent local backup |
| `-p` | On EKS, write an IAM policy document with the permissions the installer needs to `ascender_install_artifacts/` |

### Installation artifacts

The installer writes the Kubernetes manifests it applies, with a timestamp suffix, to `tmp_dir` (by default `ascender_install_artifacts/` in the repository root). These files are useful for reviewing what was deployed and for [uninstalling](../uninstalling). Backups are also written there.

## Verify the installation

Check that the pods in each namespace you installed are `Running` or `Completed`:

```bash
kubectl get pods -n ascender
kubectl get pods -n ledger
```

Galaxy Proxy runs in the Ascender namespace. The namespaces above are the defaults; use the values of `ASCENDER_NAMESPACE` and `LEDGER_NAMESPACE` if you changed them.

## Log in

| Component | URL | Initial login |
| --- | --- | --- |
| Ascender | `https://<ASCENDER_HOSTNAME>` | `ASCENDER_ADMIN_USER` (default `admin`) and `ASCENDER_ADMIN_PASSWORD` |
| Ledger | `https://<LEDGER_HOSTNAME>` | `admin` and `LEDGER_ADMIN_PASSWORD` |
| Galaxy Proxy | `https://<PROXY_HOSTNAME>/api/` | No login. Optional API token (`PROXY_CONFIG.GALAXY_API_TOKEN`) |

Use `http://` instead of `https://` if you installed with `k8s_lb_protocol: http`.

## Next steps

- Platform preparation: [RKE2](../rke2), [Amazon EKS](../eks), [Google GKE](../gke), [Azure AKS](../aks), [DKP, OpenShift, and TKGI](../other-platforms), or an [offline installation](../offline).
- Component settings: [Ledger](../ledger) and [Galaxy Proxy](../galaxy-proxy).
- Protect your installation with regular [backups](/admin-guide/backup).
