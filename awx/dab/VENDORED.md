# Vendored subset of django-ansible-base

This package is a vendored subset of [django-ansible-base](https://github.com/ansible/django-ansible-base)
(Apache-2.0, see `LICENSE.md`), copied from the `devel` branch at commit:

    5d64aaf1616a1fa8393ebd15aa26f592a6e70fd3  (2026-08-26)

It replaces the former `django-ansible-base[jwt-consumer,resource-registry,rest-filters]`
git requirement so that dependency upgrades (CVE fixes) and upstream API changes are
under our control.

## What is included

| Path | Upstream | Notes |
|------|----------|-------|
| `jwt_consumer/` | `ansible_base/jwt_consumer/` | `eda/` and `hub/` consumers removed |
| `resource_registry/` | `ansible_base/resource_registry/` | see prune list below |
| `rest_filters/` | `ansible_base/rest_filters/` | `ansible_id_backend.py` removed (required DAB RBAC) |
| `lib/` | `ansible_base/lib/` | only the submodules the three apps and awx use |

Module paths were rewritten `ansible_base.*` -> `awx.dab.*`. `ansible_base/lib/utils/views/ansible_base.py`
was renamed to `lib/utils/views/base_view.py` (the filename collided with the package rename).

The Django app labels are **unchanged** (`dab_resource_registry`, `dab_jwt_consumer`,
`dab_rest_filters`). This is load-bearing: `django_migrations` and `django_content_type`
rows are keyed by app label, so existing databases upgrade with no migration work.
Do not rename the labels.

## Pruned relative to upstream

- `jwt_consumer/eda/`, `jwt_consumer/hub/` — consumers for services we do not run.
- `resource_registry/tasks/` and `management/commands/resource_sync.py` — resource-server
  (gateway) sync; hard module-level dependency on `ansible_base.rbac`, which we do not vendor.
- `RoleDefinitionType`, `FeatureFlagType`, `LenientPermissionSlugListField` in
  `resource_registry/shared_types.py`, and `RoleDefinitionProcessor` — DAB RBAC only.
- `rest_filters/rest_framework/ansible_id_backend.py` — imports DAB RBAC models; unused here.
- `lib/`: `testing/`, `redis/`, `routers/`, `serializers/`, `sessions/`, `templatetags/`,
  `backends/`, `admin/`, `workload_identity/`, `cache/`,
  `middleware/profiling|observability|request_context` — unused by the vendored apps or awx.
- `lib/dynamic_config/` — its `dynamic_settings.py` include used to compute a handful of
  settings at import time; the entire net effect for the three installed apps was
  snapshotted and inlined into `awx/settings/defaults.py` (DEFAULT_FILTER_BACKENDS,
  ANSIBLE_BASE_REST_FILTERS_RESERVED_NAMES). This also dropped the `dynaconf` dependency.
- Resource-server (gateway) client machinery — we do not deploy behind a gateway:
  `resource_registry/{resource_server,rest_client,service_client,workload_identity_client}.py`
  and `resource_registry/utils/{sync_to_resource_server,service_backed_sso_pipeline,auth_code}.py`,
  plus the reverse-sync signal handlers in `signals/handlers.py` and their wiring in `apps.py`.
  The service-index API (gateway pushing resources to us) is unaffected; only the code for
  talking *to* a resource server was removed. `jwt_consumer` now skips claims processing with
  a warning when no RESOURCE_SERVER is configured (previously it failed authentication), and
  `_fetch_jwt_claims_from_gateway` remains only as an overridable hook.

## Local modifications

- `lib/dynamic_config/settings_logic.py` — removed upstream's auto-injection of the DAB
  RBAC app into INSTALLED_APPS whenever jwt_consumer is installed. Before vendoring, this
  injection was live: existing databases have 10 `dab_rbac` migrations applied and empty
  `dab_rbac_*` tables. Those leftovers are harmless (Django ignores `django_migrations`
  rows for uninstalled apps) but can be cleaned up in a future migration.
- `jwt_consumer/common/auth.py::process_rbac_permissions` — guarded the DAB RBAC claims
  machinery behind `is_rbac_installed()`. Without the (un-vendored) `rbac` app it still
  fetches claims from the gateway on a claims-hash change and exposes them via
  `_saved_claims`, which `AwxJWTAuthentication._sync_old_rbac` uses to sync the old
  AWX `Role` model. The names it imports from `awx.main.models.rbac`
  (`ROLE_DEFINITION_TO_ROLE_FIELD`, `disable_rbac_sync`) only exist in upstream AWX;
  they were added to our `rbac.py` so the sync actually works — before that the
  ImportError fallback made JWT role sync a silent no-op. Covered by
  `awx/main/tests/functional/test_dab_jwt_auth.py`.
- `resource_registry/views.py` — `DEFAULT_MAX_PAGE_SIZE = 200` inlined from
  `ansible_base.rest_pagination` (app not vendored).

Remaining `awx.dab.rbac.*` / `awx.dab.oauth2_provider.*` / `awx.dab.activitystream.*`
imports are lazy and guarded by INSTALLED_APPS checks; those apps are never installed here.

## Updating

There is no automatic sync. To pull an upstream fix, diff the relevant file against the
commit above in the upstream repo, apply the change here manually, and update the commit
hash in this file if you re-baseline.
