---
title: Galaxy Proxy
description: Install Ascender Galaxy Proxy with the Ascender installer and point Ascender at it.
weight: 13
---

Ascender Galaxy Proxy is a caching proxy for Ansible Galaxy. It serves collection metadata and artifacts from its cache, so collection installs stay fast, keep working during an upstream outage, and work from networks with restricted internet access. The installer deploys it in the Ascender namespace.

## What the installer deploys

In `ASCENDER_NAMESPACE` (default `ascender`):

| Resource | Name | Purpose |
| --- | --- | --- |
| Deployment | `ascender-galaxy-proxy` | The proxy, on port 80, one replica |
| ConfigMap | `ascender-galaxy-proxy-config` | Settings from `PROXY_CONFIG` |
| PersistentVolumeClaim | `ascender-galaxy-proxy-cache` | Cache storage, `PROXY_CONFIG.PVC_SIZE` in size |
| Ingress or Route | `ascender-galaxy-proxy` | Exposes the proxy at `PROXY_HOSTNAME` |
| Secret | `ascender-galaxy-proxy-tls` | TLS certificate, when `k8s_lb_protocol` is `https` on platforms that terminate TLS in the cluster |

The proxy reports its health at `/healthz`, which the installer polls until it answers.

## Configuration

```yaml
PROXY_INSTALL: true
PROXY_HOSTNAME: galaxy-proxy.example.com
PROXY_VERSION: latest

PROXY_CONFIG:
  DEBUG: "false"
  QUERY_CACHE_EXPIRE: "1"
  ARTIFACT_CACHE_EXPIRE: "30"
  TRUSTED_PROXIES: ""
  URL: "https://{{ PROXY_HOSTNAME }}"
  UPSTREAM_BASEURL: "https://galaxy.ansible.com"
  CLEAR_CACHE_ON_START: "0"
  MEM_CACHE_SIZE: "2000"
  HTTP_PROXY: ""
  GALAXY_API_TOKEN: ""
  PVC_SIZE: 5

PROXY_TLS_CRT_PATH: "~/ascender.crt"
PROXY_TLS_KEY_PATH: "~/ascender.key"
```

| Variable | Default | Description |
| --- | --- | --- |
| `PROXY_INSTALL` | `false` | Install Galaxy Proxy |
| `PROXY_HOSTNAME` | `galaxy-proxy.example.com` | Host name of the proxy |
| `PROXY_VERSION` | `latest` | Image tag of the proxy image |
| `PROXY_CONFIG.URL` | `https://<PROXY_HOSTNAME>` | External URL of the proxy, used to rewrite the links in upstream responses. Must include `http://` or `https://` |
| `PROXY_CONFIG.UPSTREAM_BASEURL` | `https://galaxy.ansible.com` | Galaxy server to proxy |
| `PROXY_CONFIG.QUERY_CACHE_EXPIRE` | `"1"` | Days to keep cached API responses |
| `PROXY_CONFIG.ARTIFACT_CACHE_EXPIRE` | `"30"` | Days to keep cached collection artifacts |
| `PROXY_CONFIG.MEM_CACHE_SIZE` | `"2000"` | Number of API responses kept in memory |
| `PROXY_CONFIG.CLEAR_CACHE_ON_START` | `"0"` | Clear the on-disk cache when the proxy starts |
| `PROXY_CONFIG.TRUSTED_PROXIES` | Empty | Comma-separated IP addresses of reverse proxies in front of the proxy, so client addresses are logged correctly |
| `PROXY_CONFIG.HTTP_PROXY` | Empty | Outbound HTTP proxy for requests to the upstream server |
| `PROXY_CONFIG.GALAXY_API_TOKEN` | Empty | When set, clients must send this token. When empty, the proxy accepts all requests |
| `PROXY_CONFIG.DEBUG` | `"false"` | Verbose logging |
| `PROXY_CONFIG.PVC_SIZE` | `5` | Size of the cache volume, in GB. Set before the first installation |
| `PROXY_TLS_CRT_PATH` | `~/ascender.crt` | TLS certificate for the proxy, when `k8s_lb_protocol` is `https` |
| `PROXY_TLS_KEY_PATH` | `~/ascender.key` | TLS private key for the proxy |
| `PROXY_PVC_STORAGE_CLASS` | Cluster default | StorageClass of the cache volume. Applies on OCP |
| `PROXY_IMAGE` | `ghcr.io/ctrliq/ascender-galaxy-proxy` | Image repository. Change it only to pull from a mirror |

`PROXY_CONFIG.EXTERNAL_PORT` appears in the installer's internal defaults but is ignored on Kubernetes.

`config_vars.sh` asks for the host name, image, version, cache, URL, upstream, HTTP proxy, and token settings. It does not ask for `DEBUG` or `PVC_SIZE`. It sets `PROXY_TLS_CRT_PATH` and `PROXY_TLS_KEY_PATH` to the certificate paths you enter for Ascender. `PROXY_CONFIG` is a single setting, so if you define it in `custom.config.yml`, include every key you want to set.

If you install with `k8s_lb_protocol: http`, set `PROXY_CONFIG.URL` to `http://<PROXY_HOSTNAME>`, because the proxy hands that URL to clients for every download.

### Require a token

To accept only authenticated clients, set `PROXY_CONFIG.GALAXY_API_TOKEN` to a random value, for example from `openssl rand -hex 32`, and run `./setup.sh`. Clients then send it in an `Authorization: Token <token>` header, which is what `ansible-galaxy` does when you give it a token. The proxy validates the header and never forwards it to the upstream server.

## Use the proxy from Ascender

1. In Ascender, create a credential of the Galaxy API token type with the URL `https://<PROXY_HOSTNAME>/api/`. If you set `GALAXY_API_TOKEN`, enter it as the credential's token. See [Credentials](/user-guide/credentials).
2. Edit your organization, add the credential under **Galaxy Credentials**, and order it ahead of the default Ansible Galaxy credential. Remove the default credential to send every collection request through the proxy. See [Organizations](/user-guide/organizations).

Project syncs in that organization then install collections from `requirements.yml` files through the proxy.

## Use the proxy from ansible-galaxy

Point `ansible-galaxy` at the proxy with the `--server` (`-s`) option:

```bash
ansible-galaxy collection install -s https://galaxy-proxy.example.com/api/ community.general
```

Add `--token <token>` if the proxy requires a token. For more client configuration, monitoring, and cache management, see the [Galaxy Proxy repository](https://github.com/ctrliq/ascender-galaxy-proxy).
