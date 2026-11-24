# Developing Ascender

This page is for working on Ascender's Go code: what to install, how to run
the two processes from source, the checks and tests to run before sending a
change, and where things are in the source tree. How to contribute (forks,
branches, commit messages, sign-off) is in
[CONTRIBUTING.md](../../CONTRIBUTING.md); every configuration variable is in
[deploy/README.md](../../deploy/README.md).


## The Go rewrite

This repository is a rewrite in Go of the Python (Django) Ascender. It aims
to be a drop-in replacement for it:

- **The same REST API.** `/api/v2/...` answers with the same fields in the
  same order, the same error wording and the same OPTIONS metadata. Golden
  responses captured from the old application check this.
- **The same user interface.** The PatternFly 6 screens of the old React UI
  are reproduced in Go templates and rendered on the server.
- **The same database.** The Go processes read and write the PostgreSQL
  schema that the Django application created, with its encrypted fields,
  passwords and RBAC, so an existing Ascender database upgrades in place
  (from the old application's last migration). The two applications do not
  share a database: once the Go application has run on it, the old one is
  not supported there.


## How it runs

Two static binaries replace the old stack of nginx, uvicorn, Django and
its background services:

| Binary | Replaces | Does |
| --- | --- | --- |
| `ascender-web` | nginx, uvicorn, Django/DRF and the React build | Serves the API and the UI on one port (8070), with templates and assets embedded |
| `ascender-task` | dispatcher, callback receiver, scheduler, wsrelay | Runs jobs, project and inventory syncs, workflows and schedules; playbooks run in execution environment images through podman |

There is no Python at run time. The templates users write (notifications,
credential type injectors, approval messages) are rendered by a port of
Jinja2's sandbox. The regular expressions in the authentication maps go
through a port of Python's `re` module. Both are checked against output
from the original Python libraries (see [Golden test data](#golden-test-data)).

Each release publishes `ghcr.io/ctrliq/ascender/ascender-web:<version>` and
`ghcr.io/ctrliq/ascender/ascender-task:<version>`, signed with cosign and
with build provenance; every merge to `main` publishes development images
under `ghcr.io/ctrliq/ascender-devel/`. The web image is built on Rocky
Linux 9 ubi-micro and the task image on Rocky Linux 9 minimal. See
[Building the Ascender Images](../build_images.md).

## Prerequisites

- **Go**, the version `src/go.mod` names (`go 1.27.0`, toolchain
  `go1.27.3`). The Go module, `github.com/ctrliq/ascender`, is in `src/`.
- **make** and **python3**: the top-level `Makefile` drives everything
  (`make help` lists the targets), and a few targets run scripts from
  `scripts/`.
- **docker or podman.** The compose stack (`deploy/docker-compose.yml`)
  runs PostgreSQL and the two images; the Makefile's container targets call
  `docker compose`. A task process run on the host starts execution
  environments with `docker` by default (`ASCENDER_CONTAINER_RUNTIME`).
- **PostgreSQL.** The compose file runs one
  (`quay.io/sclorg/postgresql-18-c9s`) and publishes it on
  `127.0.0.1:5442`; any other server works through the `ASCENDER_DB_*`
  variables or `ASCENDER_DATABASE_URL`.


## Running from source

The processes need the database password and the `SECRET_KEY` the
database's encrypted fields are written with. Put them in
`.secrets/ASCENDER_DB_PASSWORD` and `.secrets/SECRET_KEY` at the repository
root (git-ignored, and kept out of image builds); an environment variable of
the same name overrides each. For a new installation `make init` generates
them, and the `admin` password in `.secrets/ADMIN_PASSWORD`, and installs
podman compose (or docker compose) and Go when the host has none (see
`deploy/README.md`). Settings that differ per machine but are not secret go
in `.env` (`.env.example` lists them). A local stack reached over
plain HTTP from anywhere but `localhost` needs `ASCENDER_MODE=development`
there, or the browser drops the Secure cookies and login fails.

```bash
make start SERVICES=postgres   # only the compose database
make run-web                   # API and UI on http://localhost:8070/
make run-task                  # the task process: jobs, syncs, workflows, schedules
make start                     # or the whole stack in containers
```

An empty database is given the schema the first time either process starts
on it; `make migrate` does the same up front and lists the Go application's
migrations. The details (the compose services, host directories, running
the binaries by hand, the database schema) are in
[deploy/README.md](../../deploy/README.md#local-development).

`make run-web` sets `ASCENDER_TEMPLATE_DIR=web/templates` and
`ASCENDER_STATIC_DIR=web/static`, so the UI is served from `src/web` on disk
rather than from the copy embedded in the binary: a template is parsed again
when it changes, and edits to templates, stylesheets and scripts show on the
next page load without a restart. A change to Go code needs `make run-web`
run again.


## Checks

Run these before sending a change; pull requests run the same in CI
(`.github/workflows/ci.yml`):

| Target | Does |
| --- | --- |
| `make check` | `make fmt`, `make fmt-templates`, `make fmt-json`, `make fmt-docsite` and `make licenses` (each rewrites what needs it), then `make build`, `make vet` and `make docsite-check` |
| `make lint` | staticcheck (configured in `src/staticcheck.conf`), and deadcode, which fails on functions no binary can reach |
| `make test` | `go test ./...` in `src/`; `GOTESTFLAGS` adds flags (CI runs `make test GOTESTFLAGS='-race -count=1'`) |
| `make fmt-templates` | Lays out the UI templates on indented lines (`src/internal/tmplws/tmplfmt`) |
| `make fmt-json` | Pretty-prints the API's JSON under `src/internal/api` (the OPTIONS metadata and the `locale` files) with `scripts/prettyjson.py` |
| `make fmt-docsite` | Lays out the tables of the documentation site's pages (see [The documentation site](#the-documentation-site)) |
| `make docsite-check` | Fails on a broken link, a missing title or an unused image in the documentation site |
| `make hooks` | Installs the git pre-commit hook (`make init` does too), which runs `pre-commit.sh`: `make fmt-check` when anything under `src/` or `docs/` is staged, `make tidy-check` and `make licenses-check` when `src/go.mod` or `src/go.sum` is, and every executable in `pre-commit-user/` (git-ignored, your own) with the staged files in `CHANGED_FILES`. It checks the working tree, not the index. `ASCENDER_SKIP_HOOKS=1` or `git commit --no-verify` skips it; a hook already there that is not this one is left alone |

Templates follow JSX's whitespace rule: a line break between tags or
actions renders as nothing, so a space that must render goes on the same
line as its neighbours (`</b> <i>`). `make fmt-templates` keeps to that
rule.

CI runs the checks that report instead of rewrite: `make fmt-check`,
`make tidy-check` and `make licenses-check`. `make vulncheck` runs
govulncheck. `make licenses` writes `licenses/go/`, the license of every Go
module the binaries link, which the images ship; commit it with a
`go.mod` change.


## Tests and databases

Tests that need a database skip unless the environment names one:

- **`ASCENDER_TEST_DATABASE_URL`** is a PostgreSQL URL
  (`postgres://user:password@host:port/db?sslmode=disable`) of a database
  that already holds the schema. The API tests run against it as a
  throwaway `zz` superuser, which they create and delete again with the
  activity stream entries they wrote; each test removes the objects it made,
  and a few read existing rows and skip when there are none. Use a database
  whose data you can lose, never a real installation's.
- **Scratch databases.** Tests that need a database of their own (the
  schema baseline, the task claim races across processes, and API tests
  that make pending and running jobs) create an empty database beside the
  test database, on the same server, named `zz_..._<timestamp>`. They load
  the schema into it with the same code the processes run at startup, and
  drop it (`WITH (FORCE)`) when the test ends. No task process watches a
  scratch database, so nothing picks up the jobs the tests make. The role
  must be allowed to create databases (`CREATEDB`); without that these
  tests skip.
- **`ASCENDER_SCRATCH_DATABASE_URL`**, when set, is the server and role the
  API tests make their scratch databases with, instead of
  `ASCENDER_TEST_DATABASE_URL`'s, for example a role that has `CREATEDB`
  when the test role does not. The baseline and claim tests always use
  `ASCENDER_TEST_DATABASE_URL`.

CI and the release workflow run PostgreSQL as a service and connect as its
admin role, so every database-backed test runs there, the scratch ones
included.

To give an empty test database the schema (the baseline and the Go
migrations), run the web binary's `migrate` command against it, as CI does:

```bash
cd src
ASCENDER_DATABASE_URL="$ASCENDER_TEST_DATABASE_URL" ASCENDER_SECRET_KEY=test-only-key \
  go run ./cmd/ascender-web migrate
```

The test helpers are `src/internal/api/dbtest_helpers_test.go` (the test
database) and `src/internal/api/scratch_db_test.go` (scratch databases);
`src/internal/tasks/claim_lock_test.go` and `src/internal/db/baseline_test.go`
make their own scratch databases.

The LDAP tests (`src/internal/sso`) skip unless `ASCENDER_TEST_LDAP_URI`
names a directory seeded with `src/internal/sso/testdata/zz-seed.ldif`,
whose header gives the server image and the `ldapadd` command.


## Development tools

`tools/` at the top level holds services to develop and test integrations
against, each run beside the development stack as a compose project of its
own and driven by `tools/Makefile` (run from `tools/`; `make help` there
lists the targets). There is one so far:

- **NetBox**, for the `netbox` inventory source: a NetBox with an estate to
  sync, and an execution environment that has the `netbox.netbox`
  collection.

See [the tools' README](../../tools/README.md), which links to each tool's
own.


## Golden test data

Several packages port the behaviour of Python libraries Ascender used, and
are tested against what the original produced: Jinja2's parser and sandbox
(`internal/jinja`, `internal/jinjarun`), Python's `re` (`internal/pyre`),
PyYAML's `safe_load` (`internal/pyyaml`), dateutil's recurrence rules
(`internal/rrule`), the old project playbook discovery (`internal/models`),
the old callback's websocket throttle (`internal/tasks`; its script needs
only the standard library, so any `python3` runs it) and the old API's
translations (`internal/i18n`, `internal/api`). The
expected results are JSON files in each package's `testdata/`, written by
the Python script beside them (`gen_*.py`, `gen.py` in `internal/pyre`).

Each script's docstring gives the command that regenerates its file. Most
run in a throwaway container of the old application's image,
`ghcr.io/ctrliq/ascender_devel:main`, with `--network none`, some with the
old application's source mounted read-only.
`internal/api/testdata/gen_options_i18n.py` instead reads a running old API,
with GET and OPTIONS requests only; `gen_options_i18n_offline.py` beside it
adds the route documents that capture left untranslated, built from the old
views in the old image, and with `--check --all` compares every route
document's translations with the old views'. `internal/i18n/testdata/gen_intl.js`
runs under Node. Change the corpus in the script, regenerate the file, and
commit both.

Two more sets of data were captured from the old API: the OPTIONS documents
the API serves (`src/internal/api/metadata/`), and the settings registry
(`src/internal/settings/registry.json`, from `OPTIONS
/api/v2/settings/all/`).


## Where things are

Paths are under `src/`:

| Path | Contents |
| --- | --- |
| `cmd/ascender-web` | The API and UI server, and the setup commands (`migrate`, `createsuperuser`, ...) |
| `cmd/ascender-task` | The task process |
| `internal/api` | The REST API, one file per resource (`organizations.go`, `projects.go`). Shared parts: query-string filters (`filter.go`), lists with RBAC (`list.go`), JSON objects with the old field order and summary fields (`serialize.go`), request validation with the old error wording (`form.go`), OPTIONS metadata (`options.go`) |
| `internal/db` | The connection pool, the schema baseline (`baseline/`) and the Go application's migrations (`migrations/*.sql`), where every schema change goes |
| `internal/models` | Table structs and SQL; Django's `on_delete` rules (`cascade.go`); implicit RBAC roles and their ancestors (`roles.go`) |
| `internal/rbac` | Role lookups |
| `internal/auth`, `internal/sso` | Sessions, CSRF and users; LDAP, OAuth2, OIDC and SAML logins |
| `internal/crypto` | Django-compatible password hashes and the encryption of secret fields |
| `internal/tasks` | The dispatcher and the job runners (see [Background Tasks](../tasks.md)) |
| `internal/settings` | The settings registry and stored values (see [Settings](../settings.md)) |
| `internal/i18n` | Translation catalogs (`locales/<lang>/`) and message formatting |
| `internal/jinja`, `internal/jinjarun`, `internal/pyre`, `internal/pystr`, `internal/pyyaml` | Ports of Jinja2, Python's `re`, Python's str and number formatting, and PyYAML's `safe_load`, for what users write |
| `internal/web` | The UI's handlers. Pages call the API in-process, so the UI goes through the API's permissions and validation |
| `web/templates`, `web/static` | The UI's Go templates and static files (PatternFly CSS, themes, fonts, `js/app.js`) |
| `internal/tmplws` | The templates' whitespace rule and `make fmt-templates` |
| `internal/docsite`, `cmd/ascender-docsite` | The documentation site's renderer, and the command that builds, serves, checks and formats it |
| `internal/icons` | The PatternFly icons the UI and the documentation site draw |

Outside `src/`: `deploy/` has the Dockerfiles and the compose file (see
[Building the Ascender Images](../build_images.md)), `docs/docsite/` the
documentation site, `scripts/` the helper scripts the Makefile runs, and
`tools/` the [development tools](#development-tools).


## The documentation site

`docs/docsite/` holds the installation, administration and user guides,
the documentation for people who run and use Ascender (the rest of `docs/`
describes how the code works). `ascender-web` serves them under `/docs/`
(`ASCENDER_DOCS_DIR`; the web image carries them), and they publish on
docs.ciq.com unchanged, so they are written the way that site reads them:

- Every page is the `index.md` of a directory of its own, which holds its
  child pages' directories: `admin-guide/authentication/ldap/index.md` is
  the page `/admin-guide/authentication/ldap/`.
- Front matter gives the page's `title`, and optionally a `description`
  (shown under the title), a `weight` (pages sort by weight, then title)
  and `showInNav: false`.
- Markdown with GitHub's tables, strikethrough and task lists. A table is
  laid out with a pipe at each end of every row and one space each side
  of a cell's text, the one style that site's lint accepts;
  `make fmt-docsite` lays them out.
- Two of that site's components, each on lines of their own with a blank
  line inside: `<Hint type="note|info|tip|warning|danger" title="...">`
  ... `</Hint>` for an admonition, and `<Tabs>` with `<Tab label="...">`
  panels. HTML elements (`<details>`, `<kbd>`, `<br>`) pass through; any
  other `<word>` is shown as written, so placeholders such as `<hostname>`
  need no escaping.
- A link without a leading slash is from the page's own directory
  (`[LDAP](ldap)` on the authentication page); one with it is from the
  site's root (`/user-guide/credentials#machine`). A heading's anchor is
  its text in lower case, with spaces as hyphens and other punctuation
  dropped.
- Images are under `assets/images/`, as lossless WebP
  (`cwebp -lossless shot.png -o shot.webp`), and are linked as
  `/assets/images/<name>.webp`.

```bash
make docsite-serve   # http://127.0.0.1:8090/, every page read again on reload
make docsite-check   # broken links and anchors, missing titles, unused images
make fmt-docsite     # lay out the tables
make docsite         # the static site in bin/docsite (DOCSITE_BASE for its URL path)
```

`make run-web` serves the site from the same directory, read again when a
file in it changes.

The user interface's help links point into the site
(`/docs/user-guide/inventories/#smart-host-filter`), as does the browsable
API's API Guide link. `TestDocsLinks` in `internal/web` fails when one of
them reaches no page, or no heading on it, so renaming a page or a heading
they name means changing the link too.

On docs.ciq.com the guides are the Ascender part of the Ascender Pro
documentation. Copying a release's guides there maps `admin-guide/` to
`admin-guides/ascender/`, `user-guide/` to `user-guides/ascender/` and
`release-notes/` to `release-notes/ascender/`, rewrites the links to those
paths and `/assets/images/` to that site's image directory, and gives the
three section pages the titles they have there. The home page and
`installation/` stay here: that site has its own installation guide for
the Ascender Pro installer, at the same paths, so `/installation` links
work on both. The guides say "Ascender" and "the Ascender installer"
throughout, which reads true on both sites.


## Kubernetes

Ascender on Kubernetes is deployed by the Ascender operator, which lives in
its own repository. It runs the same `ascender-web` and `ascender-task`
images, with `IS_K8S` in the settings file, so jobs run in container group
pods and project updates in the receptor container beside the task
container (see [deploy/README.md](../../deploy/README.md#on-kubernetes)). To
try a local change there, build the images (see
[Building the Ascender Images](../build_images.md)), push them to a registry
the cluster can pull from, and point the operator at them; the operator
repository documents its image settings.
