# Ascender – Copilot Agent Instructions

## What This Repository Is
Ascender is a web-based UI, REST API, and task engine built on top of [Ansible](https://github.com/ansible/ansible). It is a downstream fork of [AWX](https://github.com/ansible/awx), maintained by Ctrl IQ, Inc. It provides job scheduling, inventory management, credential storage, workflow automation, RBAC, and a REST API. ~987 Python source files, ~154 K lines of Python.

**Trust these instructions. Search the repo only if the information below is incomplete or incorrect.**

---

## Runtime Environment

All development tooling runs inside the **`tools_awx_1` Docker container**. The repository root is mounted at `/awx_devel` inside the container. The host working directory (`/root/ascender`) does not have the project's Python environment. Always prefix commands with:

```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && <command>"
```

Supporting containers also running:
- `tools_postgres_1` – PostgreSQL database (used by the running app; tests use SQLite)
- `tools_valkey_1` – Valkey (Redis-compatible) cache

Runtime versions (inside container):
- **Python** 3.12.12
- **Django** 5.2.14
- **psycopg** 3.1.18
- **black** 26.5.1 | **flake8** 7.3.0 | **yamllint** 1.38.0

---

## Linting

### Black (code formatting)
Config in `pyproject.toml`: `line-length = 160`, `skip-string-normalization = true`. Always auto-format new Python code before committing:

```bash
# Check (CI-style):
docker exec tools_awx_1 bash -c "cd /awx_devel && black --check awx awxkit"
# Auto-fix:
docker exec tools_awx_1 bash -c "cd /awx_devel && black awx awxkit"
```

### Flake8
Config in `tox.ini` (section `[flake8]`). Checks only: `F401,F402,F821,F823,F841,F811,E265,E266,F541,W605,E722,F822,F523,W291,F405`. Excludes `awx/ui/node_modules`, `env`.

```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && flake8 awx awxkit"
```

### Yamllint
Config in `.yamllint` (root). `line-length` and `truthy` rules are disabled. Ignores `.github`, `.tox`, `tools/docker-compose/_sources`, and a few test data paths.

```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && yamllint -s ."
```

---

## Running Tests

Tests use SQLite (not PostgreSQL) and in-memory channel layer — no database setup needed. Settings: `awx.main.tests.settings_for_test` (configured in `pytest.ini`). Default pytest flags: `--reuse-db --nomigrations --tb=native --timeout=300`.

### Unit tests (~15 seconds, run frequently)
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider -n auto --dist=loadfile awx/main/tests/unit/"
```
Result: 1139 passed, 1 skipped.

### Functional tests (~3 minutes)
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider -n auto --dist=loadfile awx/main/tests/functional/"
```
Result: 1987 passed, 5 skipped.

### Full test suite (all dirs, ~4 minutes)
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider -n auto --dist=loadfile awx/main/tests/unit awx/main/tests/functional awx/conf/tests awx/sso/tests"
```

### Migration check (always run after model changes)
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && awx-manage check_migrations --dry-run --check -n 'missing_migration_file'"
```
Expected output: `No changes detected`

### Target a single test file
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && PYTHONDONTWRITEBYTECODE=1 py.test -p no:cacheprovider awx/main/tests/unit/test_capacity.py"
```

---

## Model Changes Require Migrations

After changing any Django model, always generate and commit the migration:

```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && awx-manage makemigrations"
```

Then verify no missing migration file:
```bash
docker exec tools_awx_1 bash -c "cd /awx_devel && awx-manage check_migrations --dry-run --check -n 'missing_migration_file'"
```

Migration files live in `awx/main/migrations/` (218 existing files).

---

## Project Layout

| Path | Purpose |
|---|---|
| `awx/` | Main Django application package |
| `awx/api/` | DRF REST API – views, serializers, permissions, fields, pagination |
| `awx/conf/` | DB-backed dynamic settings system + tests |
| `awx/main/` | Core business logic |
| `awx/main/models/` | ORM models: jobs, inventory, credentials, workflows, orgs, RBAC, schedules |
| `awx/main/tasks/` | Background task system (dispatcher-based) |
| `awx/main/migrations/` | 218 Django migrations |
| `awx/main/tests/unit/` | Fast isolated unit tests (~1139 tests) |
| `awx/main/tests/functional/` | Django TestClient-based API tests (~1987 tests) |
| `awx/main/tests/settings_for_test.py` | Test settings (SQLite, in-memory cache) |
| `awx/settings/` | Settings modules: `defaults.py`, `development.py`, `production.py` |
| `awx/sso/` | SSO/LDAP/SAML backends + tests |
| `awx/ui/` | UI / React frontend (npm) |
| `awx/ui_next/` | New UI (not currently used, built separately via `make ui-next`) |
| `awxkit/` | Python client library for the AWX API (own tox suite) |
| `requirements/` | Pinned deps: `requirements.txt`, `requirements_dev.txt`, `requirements_git.txt` |
| `tools/` | Docker Compose, Ansible build playbooks, dev scripts |
| `docs/` | Project documentation |

### Key configuration files
| File | Purpose |
|---|---|
| `pyproject.toml` | Build system + black config |
| `tox.ini` | flake8 config + tox testenv definitions |
| `.yamllint` | yamllint rules |
| `pytest.ini` | pytest settings and markers |
| `setup.cfg` | Python package metadata and entry points |
| `Makefile` | All build/test/lint targets |

---

## CI/CD Workflows (`.github/workflows/`)

| File | Trigger | Purpose |
|---|---|---|
| `devel_images.yml` | Push to `main` or `feature_*` | Builds and pushes `awx_devel` Docker image to GHCR |
| `stage.yml` | Manual (`workflow_dispatch`) | Builds and stages a release |
| `promote.yml` | Manual | Promotes a staged release |

CI uses `ansible-playbook tools/ansible/build.yml` to build images. No automated lint or test runs in CI — validation is done locally before pushing.

---

## Pre-commit Hook

`pre-commit.sh` runs `black --check` on all staged Python files. Set up with:
```bash
make .git/hooks/pre-commit
```

---

## Key Conventions

- **`awx-manage`** is the Django management command (equivalent of `django-admin` with project settings loaded). It is in `PATH` inside the container.
- **RBAC** is implemented in `awx/main/access.py` — one class per model, `can_*` methods.
- **API views** use a generic base in `awx/api/generics.py`. Most views are in `awx/api/views/`.
- **Serializers** are in `awx/api/serializers.py` (large file, ~5000 lines) and `awx/api/fields.py`.
- **Tasks** (background jobs) are in `awx/main/tasks/` — add new tasks there.
- **Signals** are in `awx/main/signals.py`.
- **URL routing**: `awx/urls.py` → `awx/api/urls/` for the API, `awx/main/urls.py` for main app.
- **Dynamic settings** stored in DB use `awx/conf/` — settings definitions go in `awx/conf/conf.py` and `awx/main/conf.py`.
