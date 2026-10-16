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

Add the main repository as a second remote, so you can rebase onto it later:

```bash
git remote add upstream https://github.com/ctrliq/ascender.git
```

## Running tests

Every pull request runs the checks in
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml). Run the ones your
change can affect before pushing, in the development environment, and run the
whole API suite rather than only the tests you touched: a new setting, for
example, fails a test in `ascender/conf/tests/` that no logging test exercises.

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && make test"
```

`make test` is what CI's `api-test` job runs. It covers every directory in
`TEST_DIRS` and then runs `ascender-manage check_migrations` and
`ascender-manage check_settings`. The lint, type-check and UI jobs, and the
command for each, are listed in
[`.github/copilot-instructions.md`](./.github/copilot-instructions.md).

Configuration lives in [`pyproject.toml`](./pyproject.toml) and [`tox.ini`](./tox.ini).

## Adding a setting

A setting registered in `ascender/main/conf.py` or `ascender/conf/conf.py`
needs more than the registration, and CI checks each part:

| Change | Checked by |
|---|---|
| Add it to `ascender/settings/typed.py` (`ascender-manage generate_setting_types` writes the file) | `ascender/conf/tests/functional/test_setting_types.py` |
| Regenerate `ascender/ui/src/types/api.generated.ts` with `make ui-api-types` and commit it | `ui-api-types-drift` |
| Give it a default its own field accepts | `ascender-manage check_settings` |

Also:

- Set `min_value` and `max_value` to the range the setting's consumer accepts.
  A value rsyslog or the kernel ignores passes validation and then silently
  does nothing. Test that out-of-range values are rejected and that a
  non-default value reaches the consumer.
- A `LOG_AGGREGATOR_*` setting also needs a default in
  `ascender/settings/defaults.py`. The rsyslog configurer clears its cached
  values by the names `dir(settings)` returns, which are the database rows and
  the file defaults, so a reverted setting with no file default keeps its old
  value.

## Making changes

### Branching

Create a feature branch from `main`:

```bash
git checkout -b my-feature main
```

`main` requires a linear history. To pick up changes from `main`, or to
resolve a conflict, rebase onto it rather than merging it in:

```bash
git fetch upstream
git rebase upstream/main
git push --force-with-lease
```

### Commit messages

Write clear, concise commit messages:

```
Short summary (under 72 characters)

Longer description of what changed and why, if needed.

related #123
```

Reference the issue a change addresses with `related #nnn`, in the commit
message and the PR description, as the
[pull request template](./.github/PULL_REQUEST_TEMPLATE.md) asks. Maintainers
close the issue themselves.

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
5. For the template's ASCENDER VERSION, run `make VERSION` inside the
   development container. On a host without `setuptools-scm` it prints only
   `awx: `.

CI on a pull request from a fork waits until a maintainer approves the run.

## Reporting issues

Open an issue at
[github.com/ctrliq/ascender/issues](https://github.com/ctrliq/ascender/issues).
Include the version you are running and the steps that reproduce the problem.

For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.
