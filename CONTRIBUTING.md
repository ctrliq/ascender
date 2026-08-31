# Contributing to Ascender

Thanks for your interest in contributing to Ascender. This document covers the
development setup, testing, and pull request guidelines.

## Development setup

Fork and clone the repository:

```bash
git clone https://github.com/<your-user>/ascender.git
cd ascender
```

Bring up the containerised development environment:

```bash
make docker-compose
```

See [docs/development/docker.md](./docs/development/docker.md) for the full
walkthrough, and [kind.md](./docs/development/kind.md) or
[minikube.md](./docs/development/minikube.md) for cluster-based alternatives.

## Running tests

```bash
py.test awx/main/tests/
```

Configuration lives in [`pytest.ini`](./pytest.ini) and [`tox.ini`](./tox.ini).


## Making changes

### Branching

Create a feature branch from `main`:

```bash
git checkout -b my-feature main
```

### Commit messages

Write clear, concise commit messages:

```
Short summary (under 72 characters)

Longer description of what changed and why, if needed.
```

### Developer Certificate of Origin

Every commit must be signed off, certifying the terms in
[DCO_1_1.md](./DCO_1_1.md):

```bash
git commit -s -m "Short summary"
```

## Submitting a PR

1. Make sure the checks above pass locally.
2. One logical change per PR. Do not bundle unrelated fixes.
3. Target the `main` branch.
4. Explain what changed and why in the PR description.

## Reporting issues

Open an issue at
[github.com/ctrliq/ascender/issues](https://github.com/ctrliq/ascender/issues).
Include the version you are running and the steps that reproduce the problem.

For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.
