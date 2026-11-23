# Contributing to Ascender

Thanks for your interest in contributing to Ascender. This document covers the
development setup, testing, and pull request guidelines for the Go
implementation.

## Development setup

Fork and clone the repository, and add the main repository as a second
remote, so you can rebase onto it later:

```bash
git clone https://github.com/<your-user>/ascender.git
cd ascender
git remote add upstream https://github.com/ctrliq/ascender.git
```

You need Go (the version in [`src/go.mod`](./src/go.mod)), make, and docker
or podman with compose. The Go module is in [`src/`](./src/); the top-level
[`Makefile`](./Makefile) drives everything, and `make help` lists the targets.

The applications need a PostgreSQL database and the `SECRET_KEY` its
encrypted fields are written with, in `.secrets/ASCENDER_DB_PASSWORD` and
`.secrets/SECRET_KEY` (the directory is ignored by git and kept out of image
builds). `make init` generates both for a new installation, with the admin
password in `.secrets/ADMIN_PASSWORD`, and installs podman compose (or docker
compose) and Go when the host lacks them. Then either start the whole stack in
containers:

```bash
make init       # once: compose, Go, the secrets and .env
make start      # build both images and start them, with PostgreSQL, under compose
```

or run the binaries from source against the compose database:

```bash
make run-web    # API and UI on http://localhost:8070/, templates served from disk
make run-task   # the job runner
```

[deploy/README.md](./deploy/README.md) describes every configuration variable.

## Running tests

Every pull request runs the checks in
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml). Run them before
pushing:

```bash
make check      # gofmt, template layout, API JSON layout, Go module licenses, build, go vet
make lint       # staticcheck and deadcode
make test GOTESTFLAGS='-race -count=1'
```

`make check` rewrites files that need formatting; CI runs `make fmt-check`,
`make tidy-check` and `make licenses-check`, which only report. The git
pre-commit hook (`make hooks`, which `make init` runs) runs those three on
what a commit touches (`pre-commit.sh`); `ASCENDER_SKIP_HOOKS=1` skips it.

Tests that need a database or a directory server skip without one. To run
them, point `ASCENDER_TEST_DATABASE_URL` at a throwaway PostgreSQL database
holding the schema (the web binary's `migrate` command loads it into an empty
database) and `ASCENDER_TEST_LDAP_URI` at a test LDAP server. Never point them
at a database whose data you want to keep.

## Conventions

The Go implementation keeps the REST API, the user interface and the database
schema of the Python application, so a change has a few extra rules:

- **API responses** keep the old field order and wording. Build them with
  `api.OMap`, and check them against the golden responses captured from the
  old application.
- **UI pages** call the API in-process (`UI.apiCall`) rather than reading the
  database, so the UI never bypasses API permissions or validation.
- **Templates** follow JSX's whitespace rule: a line break between tags or
  actions renders as nothing, so a space that must render goes on the same
  line. `make fmt-templates` lays them out.
- **Text** shown to users is translated with the old application's message
  ids: `{{t "msgid"}}` in templates, `p.Loc.T` in Go, `t('msgid')` in scripts.
- **Schema changes** go in a new file under
  [`src/internal/db/migrations`](./src/internal/db/migrations). Never edit
  the baseline. A migration is for what a new database, or one upgraded from
  the Python application, needs; the two applications never share a
  database.
- **Go modules:** `make check` regenerates [`licenses/go/`](./licenses/go)
  (`make licenses`), one license per module linked into the binaries, and
  CI fails when it is out of date. Commit it with the `go.mod` change.
- **Other third-party code** you add (a script, a font, a stylesheet, code
  ported from another project) needs its license text in
  [`licenses/`](./licenses) by hand and a line in
  [`NOTICE.txt`](./NOTICE.txt).

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
message and the PR description. Maintainers close the issue themselves.

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

CI on a pull request from a fork waits until a maintainer approves the run.

## Reporting issues

Open an issue at
[github.com/ctrliq/ascender/issues](https://github.com/ctrliq/ascender/issues).
Include the version you are running and the steps that reproduce the problem.

For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.
