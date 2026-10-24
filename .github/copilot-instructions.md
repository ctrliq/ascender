# Ascender – Copilot Agent Instructions

## What This Repository Is
Ascender is a web-based UI, REST API, and task engine built on top of [Ansible](https://github.com/ansible/ansible). It is a downstream fork of [AWX](https://github.com/ansible/awx), maintained by Ctrl IQ, Inc. It provides job scheduling, inventory management, credential storage, workflow automation, RBAC, and a REST API.

**Trust these instructions. Search the repo only if the information below is incomplete or incorrect.**

The rules that apply to every contributor (DCO sign-off, rebasing instead of merging, referencing issues, what a new setting needs) are in [`CONTRIBUTING.md`](../CONTRIBUTING.md). Follow them too; they are not repeated here.

---

## Runtime Environment

All development tooling runs inside the **`tools_ascender_1` Docker container**. The repository root is mounted at `/ascender_devel` inside the container. The host working directory (`/root/ascender`) does not have the project's Python environment. Always prefix commands with:

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && <command>"
```

Supporting containers also running:
- `tools_postgres_1` – PostgreSQL database (used by the running app and by the test suite)
- `tools_valkey_1` – Valkey (Redis-compatible) cache

Runtime versions (inside container; `requirements/requirements.txt` and `tox.ini` pin them):
- **Python** 3.14
- **Django** 6.1.1
- **psycopg** 3.3.5
- **ruff** 0.16.6 | **yamllint** 1.38.0 | **ty** 0.0.74

---

## Linting

CI's `api-lint` job runs ruff format, ruff check and yamllint together, at the versions `tox.ini` pins:

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && /var/lib/ascender/venv/ascender/bin/tox -e linters"
```

### Ruff (formatting)
Config in `pyproject.toml` under `[tool.ruff]` and `[tool.ruff.format]`: `line-length = 160`, `quote-style = "preserve"`. Ruff replaced black here, and `make black` is still an alias for `make format`. Always auto-format new Python code before committing:

```bash
# Check (CI-style):
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ruff format --check ascender"
# Auto-fix:
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ruff format ascender"
```

### Ruff (linting)
Config in `pyproject.toml` under `[tool.ruff.lint]`. Selects 48 rules explicitly rather than by class, ported from the `[flake8]` block this replaced: the `E7xx` statement checks, `F4xx` through `F9xx`, and `W2xx`/`W3xx`/`W605`. `preview = true` is required because `E265`, `E266` and `W391` are still preview rules and are silently inert without it. Excludes `ascender/ui/node_modules`, `env`.

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ruff check ascender"
```

### Yamllint
Config in `.yamllint` (root). `line-length` and `truthy` rules are disabled. Ignores `.github`, `.tox`, `tools/docker-compose/_sources`, and a few test data paths.

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && yamllint -s ."
```

### Type checking (ty)
Config in `tox.ini`. `typecheck-strict` fails the pull request (CI job `api-type-check-strict`) and covers only the packages listed there, which already report nothing. `typecheck` covers all of `ascender` and `awx` and is advisory. Settings are typed through `ascender/settings/typed.py`; import `settings` from there rather than from `django.conf`.

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && /var/lib/ascender/venv/ascender/bin/tox -e typecheck-strict"
```

### UI API types
`ui-api-types-drift` regenerates the UI's API types from the serializers and fails if the committed copy differs, so run `make ui-api-types` and commit the result after any change to a serializer or a registered setting.

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && make ui-api-types && git diff --exit-code ascender/ui/src/types/api.generated.ts"
```

The UI lint, type-check and test targets are listed with the CI jobs below.

---

## Running Tests

Tests run against PostgreSQL, the same backend Ascender deploys on, with an in-memory channel layer. Settings: `ascender.main.tests.settings_for_test` (configured in `pyproject.toml`). Default pytest flags: `--reuse-db --nomigrations --tb=native --timeout=300`.

### Unit tests (~15 seconds, run frequently)
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider -n auto --dist=loadfile ascender/main/tests/unit/"
```

### Functional tests (~3 minutes)
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider -n auto --dist=loadfile ascender/main/tests/functional/"
```

### Full test suite (all dirs, ~4 minutes)
What CI's `api-test` job runs: every directory in the Makefile's `TEST_DIRS` (`ascender/main/tests/unit`, `ascender/main/tests/functional`, `ascender/conf/tests`, `ascender/sso/tests`), then `check_migrations` and `check_settings`. Run it before pushing, not only the tests for the files you changed.
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && make test"
```

### Migration tests
CI's `api-migrations` job:
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && make test_migrations"
```

### Migration check (always run after model changes)
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ascender-manage check_migrations --dry-run --check -n 'missing_migration_file'"
```
Expected output: `No changes detected`

### Target a single test file
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider ascender/main/tests/unit/test_capacity.py"
```

---

## Model Changes Require Migrations

After changing any Django model, always generate and commit the migration:

```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ascender-manage makemigrations"
```

Then verify no missing migration file:
```bash
docker exec tools_ascender_1 bash -c "cd /ascender_devel && ascender-manage check_migrations --dry-run --check -n 'missing_migration_file'"
```

Migration files live in `ascender/main/migrations/`.

---

## Project Layout

| Path | Purpose |
|---|---|
| `ascender/` | Main Django application package |
| `ascender/api/` | DRF REST API – views, serializers, permissions, fields, pagination |
| `ascender/conf/` | DB-backed dynamic settings system + tests |
| `ascender/main/` | Core business logic |
| `ascender/main/models/` | ORM models: jobs, inventory, credentials, workflows, orgs, RBAC, schedules |
| `ascender/main/tasks/` | Background task system (dispatcher-based) |
| `ascender/main/migrations/` | Django migrations |
| `ascender/main/tests/unit/` | Fast isolated unit tests |
| `ascender/main/tests/functional/` | Django TestClient-based API tests |
| `ascender/main/tests/settings_for_test.py` | Test settings (PostgreSQL, in-memory cache) |
| `ascender/settings/` | Settings modules: `defaults.py`, `development.py`, `production.py`, and the generated `typed.py` |
| `ascender/sso/` | SSO/LDAP/SAML backends + tests |
| `ascender/ui/` | UI / React frontend (npm) |
| `requirements/` | Pinned deps: `requirements.txt`, `requirements_dev.txt`, `requirements_git.txt` |
| `tools/` | Docker Compose, Ansible build playbooks, dev scripts |
| `docs/` | Project documentation |

### Key configuration files
| File | Purpose |
|---|---|
| `pyproject.toml` | Build system, package metadata and entry points, ruff, pytest and coverage config |
| `tox.ini` | tox testenvs: `linters`, `typecheck`, `typecheck-strict`, docs |
| `.yamllint` | yamllint rules |
| `Makefile` | All build/test/lint targets |

---

## CI/CD Workflows (`.github/workflows/`)

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull request | Lint, type checks, API and UI tests, a dev-environment smoke test, end-to-end UI tests (below) |
| `seed_ci_image_cache.yml` | Push to `main`, manual | Builds the `ascender_devel` image into the Actions cache that `ci.yml` restores from |
| `devel_images.yml` | Push to `main` or `feature_*`, manual | Builds and pushes the `ascender_devel` Docker image to GHCR |
| `stage.yml` | Manual (`workflow_dispatch`) | Builds and stages a release |
| `promote.yml` | Release published | Promotes a staged release |

`devel_images.yml` and `stage.yml` build images with `ansible-playbook tools/ansible/build.yml`.

`ci.yml` runs each check in a fresh `ascender_devel` container (`make docker-runner`) against a PostgreSQL service. Run the matching local command before pushing:

| CI job | Local command (inside `tools_ascender_1`) | Blocking |
|---|---|---|
| `api-test` | `make test` | yes |
| `api-migrations` | `make test_migrations` | yes |
| `api-lint` | `tox -e linters` | yes |
| `api-type-check-strict` | `tox -e typecheck-strict` | yes |
| `api-type-check` | `tox -e typecheck` | advisory |
| `api-dependency-audit` | `pip install pip-audit && pip-audit` | advisory |
| `ui-api-types-drift` | `make ui-api-types && git diff --exit-code ascender/ui/src/types/api.generated.ts` | yes |
| `ui-lint` | `make ui-lint` | yes |
| `ui-type-check` | `make ui-type-check` | yes |
| `ui-test-screens` | `make ui-test-screens` | yes |
| `ui-test-general` | `make ui-test-general` | yes |
| `dev-env` | `tools/docker-compose/ansible/smoke-test.yml` against a running dev environment | yes |
| `ui-e2e` | Playwright suite in `ascender/ui/e2e` against a built UI | yes |
| `ui-dependency-audit` | `npm audit --omit=dev` in `ascender/ui` | advisory |

`tox` is at `/var/lib/ascender/venv/ascender/bin/tox` in the container.

---

## Pre-commit Hook

`pre-commit.sh` runs `ruff format --check` on all staged Python files. Set `AWX_IGNORE_RUFF=1` to skip it. The Makefile rule that installs it is named `../../.git/hooks/pre-commit`, so `make .git/hooks/pre-commit` does nothing; set it up with:
```bash
make ../../.git/hooks/pre-commit
```

---

## Key Conventions

- **`ascender-manage`** is the Django management command (equivalent of `django-admin` with project settings loaded). It is in `PATH` inside the container.
- **RBAC** is implemented in `ascender/main/access.py` — one class per model, `can_*` methods.
- **API views** use a generic base in `ascender/api/generics.py`. Most views are in `ascender/api/views/`.
- **Serializers** are in `ascender/api/serializers/`, one module per resource, with shared fields in `ascender/api/fields.py`.
- **Tasks** (background jobs) are in `ascender/main/tasks/` — add new tasks there.
- **Signals** are in `ascender/main/signals.py`.
- **URL routing**: `ascender/urls.py` → `ascender/api/urls/` for the API, `ascender/main/urls.py` for main app.
- **Dynamic settings** stored in DB use `ascender/conf/` — settings definitions go in `ascender/conf/conf.py` and `ascender/main/conf.py`. A new setting also needs `ascender/settings/typed.py`, regenerated UI API types and bounds from its consumer; see "Adding a setting" in `CONTRIBUTING.md`.
- **External logging** writes `/var/lib/ascender/rsyslog/rsyslog.conf` (`ascender/main/utils/external_logging.py`), which includes operator drop-ins from `/var/lib/ascender/rsyslog/conf.d/*.conf`. After changing the generator, validate the output the way the logging test endpoint does, and check it against drop-ins (rsyslog loads each module only once):
  ```bash
  docker exec tools_ascender_1 rsyslogd -N1 -f /var/lib/ascender/rsyslog/rsyslog.conf
  ```
