# Ascender

[![CI](https://github.com/ctrliq/ascender/actions/workflows/ci.yml/badge.svg)](https://github.com/ctrliq/ascender/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)

Ascender provides a web-based user interface, REST API, and task engine built on top of [Ansible](https://github.com/ansible/ansible). It is the automation platform at the centre of this project, based on the upstream [AWX](https://github.com/ansible/awx) project and maintained by Ctrl IQ.

## Requirements

- Docker with Compose, for the development environment
- Python 3.12, matching what the container images build against
- A Kubernetes cluster for production, which the installer can provision for you

## Installation

For production, use the [Ascender installer](https://github.com/ctrliq/ascender-install). It deploys onto a single VM using [k3s](https://k3s.io/), or onto AKS, DKP, EKS, GKE, RKE2, OCP, or TKGI with a kubeconfig and a namespace.

For development, bring up the containerised environment:

```bash
make docker-compose
```

See [Running the Development Environment in Docker](./docs/development/docker.md) for the full walkthrough, and [kind.md](./docs/development/kind.md) or [minikube.md](./docs/development/minikube.md) for cluster-based alternatives.

## Using Ascender

Once the development stack is up, create an administrator and start the services:

```bash
make adduser
make migrate
```

The `Makefile` is the entry point for day-to-day work, covering `requirements`, `develop`, and `collectstatic`.

To drive a running server from the command line or from a playbook, use [ascender-kit](https://github.com/ctrliq/ascender-kit) or the [ctrliq.ascender](https://github.com/ctrliq/ascender-collection) collection.

## Testing

Ascender uses pytest, with tox for environment management.

- **Unit and functional**: `py.test awx/main/tests/`
- **Configuration**: [`pytest.ini`](./pytest.ini) and [`tox.ini`](./tox.ini)

## Documentation

- Product documentation is at [docs.ascender-automation.org](https://docs.ascender-automation.org)
- Developer documentation lives in [docs/](./docs), covering clustering, credentials, and mesh

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
| [ascender-ledger](https://github.com/ctrliq/ascender-ledger) | Reporting tool for host facts and playbook changes |
| [ascender-galaxy-proxy](https://github.com/ctrliq/ascender-galaxy-proxy) | Caching proxy for Ansible Galaxy collection downloads |
| [ascender-playbooks](https://github.com/ctrliq/ascender-playbooks) | Example playbooks for use with Ascender |
## Contributing

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing, and pull requests.
- Contributions require a Developer Certificate of Origin sign-off, per [DCO_1_1.md](./DCO_1_1.md).
- Report bugs and feature ideas via [GitHub Issues](https://github.com/ctrliq/ascender/issues).
- For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) rather than opening an issue.
- Join the [Ascender forum](https://forum.ascender-automation.org) to discuss development topics.

## License

Licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) and [NOTICE.txt](./NOTICE.txt).

Third-party component licenses are collected in [licenses/](./licenses).
