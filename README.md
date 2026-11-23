# Ascender

[![ascender CI](https://img.shields.io/github/actions/workflow/status/ctrliq/ascender/ci.yml?branch=main&event=push&label=ascender%20CI)](https://github.com/ctrliq/ascender/actions/workflows/ci.yml?query=branch%3Amain+event%3Apush)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Go](https://img.shields.io/badge/go-1.27-blue.svg)](https://go.dev/)

Ascender provides a web-based user interface, REST API, and task engine built
on top of [Ansible](https://github.com/ansible/ansible). It is the automation
platform at the centre of this project, based on the upstream
[AWX](https://github.com/ansible/awx) project and maintained by Ctrl IQ.

This version of Ascender is written in Go. It keeps the same REST API, the same
user interface and the same database as the Python releases, so an existing
Ascender installation upgrades in place.

## Requirements

- Docker or Podman with Compose, to run Ascender on a single host
- A Kubernetes cluster for production, which the installer can provision for you

## Installation

For production, use the [Ascender installer](https://github.com/ctrliq/ascender-install).
It deploys onto a single VM using [k3s](https://k3s.io/), or onto AKS, DKP,
EKS, GKE, RKE2, OCP, or TKGI with a kubeconfig and a namespace. See the
[installation guide](./docs/docsite/installation/index.md).

To try Ascender on one host with Compose:

```bash
make init     # install Compose and Go if missing, generate the secrets and .env
make start    # build the images and start them, with PostgreSQL
```

Then open http://localhost:8070/ and log in as `admin` with the password in
`.secrets/ADMIN_PASSWORD`. [deploy/README.md](./deploy/README.md) covers the
configuration and running against an existing database.

## Using Ascender

The user interface is at `/` and the REST API at `/api/v2/`. The installation,
administration and user guides are served by Ascender itself under `/docs/`.

To drive a running server from the command line or from a playbook, use
[ascender-kit](https://github.com/ctrliq/ascender-kit) or the
[ctrliq.ascender](https://github.com/ctrliq/ascender-collection) collection.

## Documentation

- Installation, administration and user guides are in [docs/docsite/](./docs/docsite/index.md)
- Deployment and configuration are in [deploy/README.md](./deploy/README.md)
- Developer documentation lives in [docs/](./docs/README.md), starting with
  [Developing Ascender](./docs/development/README.md)

## The Ascender ecosystem

| Repository | Description |
| ---------- | ----------- |
| [ascender](https://github.com/ctrliq/ascender) | The platform itself: web UI, REST API, and task engine |
| [ascender-install](https://github.com/ctrliq/ascender-install) | Installer for Ascender and Ledger, with Galaxy Proxy support |
| [ascender-k8s-install](https://github.com/ctrliq/ascender-k8s-install) | Kubernetes installer for Ascender, Ledger, and React |
| [ascender-pro-install](https://github.com/ctrliq/ascender-pro-install) | Enhanced installer adding Reaqt, Registry, and Galaxy Proxy |
| [ascender-operator](https://github.com/ctrliq/ascender-operator) | Kubernetes operator that deploys and manages Ascender |
| [ascender-ee](https://github.com/ctrliq/ascender-ee) | Default execution environment image for Ascender jobs |
| [ascender-kit](https://github.com/ctrliq/ascender-kit) | The `ascender` command line client and Python API library |
| [ascender-collection](https://github.com/ctrliq/ascender-collection) | The `ctrliq.ascender` Ansible collection for a controller |
| [ascender-mcp](https://github.com/ctrliq/ascender-mcp) | MCP server that lets AI agents drive Ascender through its REST API |
| [ascender-ledger](https://github.com/ctrliq/ascender-ledger) | Reporting tool for host facts and playbook changes |
| [ascender-galaxy-proxy](https://github.com/ctrliq/ascender-galaxy-proxy) | Caching proxy for Ansible Galaxy collection downloads |
| [ascender-playbooks](https://github.com/ctrliq/ascender-playbooks) | Example playbooks for use with Ascender |

## Contributing

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for pull requests, and
  [Developing Ascender](./docs/development/README.md) for building, running
  and testing from source.
- Contributions require a Developer Certificate of Origin sign-off, per [DCO_1_1.md](./DCO_1_1.md).
- Report bugs and feature ideas via [GitHub Issues](https://github.com/ctrliq/ascender/issues).
- For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) rather than opening an issue.
- Join the [Ascender forum](https://forum.ascender-automation.org) to discuss development topics.

## License

Licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) and [NOTICE.txt](./NOTICE.txt).

Third-party component licenses are collected in [licenses/](./licenses).
