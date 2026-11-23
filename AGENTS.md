# Ascender (Go rewrite)

This repository rewrites Ascender (CIQ's fork of AWX,
https://github.com/ctrliq/ascender) in Go. The goals, in order: identical REST API (`/api/v2/...`), identical
look and feel (PatternFly 6 markup rendered by Go templates), and the same
PostgreSQL schema, so an existing Ascender database (at the old
application's last migration, 0233) upgrades in place. The old and new
applications never share a database: nothing is kept only so the old
application can keep using one the Go application runs on.

## Layout

The Go module (`go.mod`, import path `github.com/ctrliq/ascender`) lives
in `src/`; the paths below are relative to it. The top-level `Makefile`
drives everything (`make help`); binaries go to `bin/`.

- `cmd/ascender-web` — API + UI server. `cmd/ascender-task` — background work.
- `internal/api` — REST API. One file per resource (`organizations.go`,
  `projects.go`). Shared machinery: `filter.go` (query-string filters,
  mirrors Django's FieldLookupBackend), `list.go` (generic list runner with
  RBAC), `serialize.go` (ordered JSON objects, summary field loaders),
  `form.go` (request validation with DRF wording), `options.go` (OPTIONS
  metadata captured from the old API in `metadata/*.json`).
- `internal/db` — the pool, the schema baseline (`baseline/`: the Django
  schema at its last migration, 0233, loaded into an empty database and
  the level every other database is checked against) and the Go
  application's own migrations (`migrations/*.sql`), which is where every
  schema change goes now.
- `internal/models` — table structs and SQL. `cascade.go` reproduces
  Django's on_delete rules; `roles.go` creates implicit RBAC roles and
  rebuilds the ancestor closure.
- `internal/rbac` — role lookups against `main_rbac_*`.
- `internal/auth` — sessions in `django_session`, CSRF, user loading.
- `internal/crypto` — Django pbkdf2 passwords and the AWX Fernet256 field
  encryption (`$encrypted$UTF8$AESCBC$...`).
- `internal/jinja`, `internal/jinjarun`, `internal/pyre`, `internal/pystr`,
  `internal/pyyaml` — ports of Jinja2, Python's `re` and PyYAML's
  `safe_load` for what users write (notification and injector templates,
  approval context, SSO map regexes, variables), with golden tests
  regenerated from the old image (`testdata/gen_*.py`).
- `internal/i18n` — translation: JSON catalogs in `locales/<lang>/`
  (`ui.json` from the old UI's Lingui catalogs, `api.json` from the old
  API's Django catalogs), ICU formatting for the UI. Templates use
  `{{t "msgid"}}`, Go `p.Loc.T`, scripts `t('msgid')`, always with the old
  msgid; see `review-docs/ARCHITECTURE.md`, "Translation".
- `internal/settings` — settings registry (`registry.json`, captured from
  the old `OPTIONS /api/v2/settings/all/`) with `conf_setting` overrides.
- `internal/web` — UI handlers; `web/templates` (Go templates) and
  `web/static` (PatternFly CSS, themes, fonts, `js/app.js`).
- `internal/tmplws` — JSX's whitespace rule for the templates (applied when
  they are parsed) and the layout tool behind `make fmt-templates`.
- At the top level, beside `src/`: `deploy/` — Dockerfiles and compose
  (build context is the repository root). `docs/` — the architecture and
  feature documentation, describing the Go implementation, and in
  `docs/docsite/` the installation, administration and user guides:
  Markdown laid out as docs.ciq.com reads it (see
  `docs/development/README.md`, "The documentation site"), rendered by
  `internal/docsite`, served by ascender-web under `/docs/` and built with
  `make docsite`.
  `review-docs/` (git-ignored) — architecture,
  roadmap and the reviews. `scripts/` — helper scripts the Makefile runs
  (`prettyjson.py`, behind `make fmt-json`; `golicenses.py`, behind
  `make licenses`, which writes `licenses/go/` for the images; `init.sh` and
  `init-secrets.sh`, behind `make init`: compose, Go, a new installation's
  secrets and `.env`). `pre-commit.sh` at the top level is the git
  pre-commit hook's checks (`make hooks`).

## Working rules

- API parity is checked against golden responses captured from the old app
  (see `review-docs/ARCHITECTURE.md`, "Parity testing"). Field order matters: build
  responses with `api.OMap`.
- UI pages call the API in-process (`UI.apiCall`) so the UI never bypasses
  API behaviour. Templates reproduce the old React DOM; compare screenshots
  with Playwright.
- Template whitespace follows JSX: a line break between tags or actions
  renders as nothing, so a space that must render goes on the same line
  (`</b> <i>`). See `review-docs/ARCHITECTURE.md`, "Template layout".
- Never write to the old application's database; develop against `ascender`
  in the `ascender_postgres` container.
- A change in behaviour updates the doc in `docs/` that describes it. The
  docs describe what the code does; never mention `review-docs/` in them.
- Fix data that only the Go application ever wrote wrongly by patching the
  development database, not with a migration: migrations are for what a
  database upgraded from the old application, or a new one, needs.
- Run `make check` (gofmt, template and docs table layout, Go module
  licenses, build, vet, the docs site's links) before finishing.

## Running locally

See `deploy/README.md`. The quick way:

The database password and `SECRET_KEY` live in `.secrets/ASCENDER_DB_PASSWORD`
and `.secrets/SECRET_KEY`, which the Makefile reads (an environment variable
of the same name overrides each); `make init` generates them, with the
admin password, for a new installation. Don't take either from the old
application's installation.

```
make init         # once: compose and Go if missing, the secrets and .env
make run-web      # or run-task; templates served from src/web on disk
make start        # docker compose: build and start both containers
```
