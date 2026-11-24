# Deploying the Go rewrite

Two containers run the application:

- `web`: the REST API at `/api/` and the user interface, one static binary
  with the templates and assets embedded. The templates users write
  (notifications, credential type injectors) and the authentication maps'
  regular expressions are handled by the binary itself, as Jinja2 and
  Python's `re` did, so the image needs no Python. It is built on Rocky
  Linux's `ubi-micro` image, which has no package manager: the build adds
  only the CA certificates (and the updates published since the base image).
- `task`: background work: the dispatcher that runs jobs, project syncs
  and workflow jobs, and the session purge. Playbooks, project updates
  included (`project_update.yml` in the control plane execution
  environment), run in execution environment images through the
  container's own rootless podman, as in the old application's task
  container: it runs privileged for the nested containers, and needs no
  socket or container runtime from the host. It also runs the
  schedule pass every 30 seconds; run one task process per database, or
  rely on the advisory lock that keeps a second one from launching twice.

  What `privileged` gives the task container: no seccomp, AppArmor or
  SELinux confinement, the host's devices, and the full capability set. Its
  process runs as uid 1000, but anything that reaches uid 0 inside the
  container (an escape from a nested container among them) is root on the
  host. Job containers share the task container's network, so a playbook
  can reach the compose network (`postgres:5432` included), and the task
  container holds the database password and `SECRET_KEY`. Treat the host
  as part of the control plane, and run untrusted content in a container
  group instead: on Kubernetes job pods run unprivileged, in their own
  network namespace, with no secret of the control plane mounted.

To trust a private certificate authority (an LDAP server, an OIDC or SAML
provider, a webhook target), mount its PEM file into `/etc/pki/tls/certs/` in
the container, e.g. `/etc/pki/tls/certs/corp-ca.pem`: Go reads every
certificate in that directory along with the system bundle. (`ubi-micro` has
no `update-ca-trust`.) `SSL_CERT_FILE` instead replaces the system bundle.
For an LDAP server alone, the CA can instead be given in the UI (Settings,
LDAP, "LDAP CA Certificate", or `AUTH_LDAP[_n]_CA_CERT` in the API), where
"Fetch from server" reads the chain the server presents.

Both read the same PostgreSQL database the old application used, with the
same schema: the tables are the ones the Django application's migrations
created. A new installation needs nothing of the old application; see "The
database schema".

## Local development

The compose file runs three containers: `ascender_postgres`
(`quay.io/sclorg/postgresql-18-c9s`, data in the `postgres_data` volume),
`ascender_web` and `ascender_task`. The database is `ascender`, owned by the
user `ascender` (`ASCENDER_DB_NAME`, `ASCENDER_DB_USER`); its port is
published on `127.0.0.1:5442` (`ASCENDER_DB_LOCAL_PORT`) for the processes
`make run-web`, `make run-task` and `make migrate` run on the host. A new
volume starts with an empty database, which the first start gives the schema
(see "The database schema"); to bring over an existing one, `pg_dump
--no-owner --no-acl` it and load the dump with `psql` into the new database
before starting the web and task containers.

The Makefile reads the secrets from `.secrets/` at the repository root
when they are there; an environment variable of the same name overrides
each (`ADMIN_PASSWORD_FILE` names the admin password's file). `.secrets/`
is never part of an image (`.dockerignore`).

A new checkout needs none of them by hand. `make init` prepares the host
(`scripts/init.sh`): without a working podman compose or docker compose it
installs one, as root or through sudo (EPEL, podman and podman-compose on
RHEL, Rocky, AlmaLinux, CentOS Stream and Oracle Linux; podman and
podman-compose on Fedora; elsewhere Docker and its compose plugin from the
distribution's packages, or from Docker's apt repository on Debian and Ubuntu
releases whose own packages lack the plugin). Without Go as recent as
`src/go.mod` needs, it installs the release `go.mod` names (its `toolchain`)
from go.dev into `/usr/local/go`, checked against its published SHA-256, and
puts it first on the PATH (`/etc/profile.d/ascender-golang.sh`, at the next
login; the Makefile uses it at once). An older `/usr/local/go` is moved aside
to `/usr/local/go-<version>`, not deleted. The images build in a Go
container of their own, so `make start` needs no Go, and a failed Go install
is only a warning; `make test`, `check`, `run-web`, `run-task` and `migrate`
need it. Then it generates the secrets
(`scripts/init-secrets.sh`): `.secrets/ASCENDER_DB_PASSWORD`,
`.secrets/SECRET_KEY` and `.secrets/ADMIN_PASSWORD`, the password to log in
as `admin` with. Last, when there is no `.env`, it copies `.env.example`
there with `ASCENDER_MODE=development` uncommented (see below). Without
`make init`, the first target that uses the secrets
(`make start`, `run-web`, ...) generates them the same way. Back them up
with the database. They are generated only when neither the database
password nor the `SECRET_KEY` is configured, in a file or the environment,
and not when the compose database volume
(`deploy_postgres_data`) exists: with one of them, or that volume, there is
an installation already, which a new `SECRET_KEY` could not read and a new
password could not open, so the target stops and asks for the missing one.

| File | Holds |
|---|---|
| `.secrets/ASCENDER_DB_PASSWORD` | The database password |
| `.secrets/SECRET_KEY` | The `SECRET_KEY` the database's encrypted fields were written with: the old deployment's, or nothing stored encrypted can be read |
| `.secrets/ADMIN_PASSWORD` | Optional (generated with the other two). The password of the `admin` account, set at every start (see "The admin account"). Missing or blank, the account is left as it is |

Settings that differ per machine but are not secret (`ASCENDER_MODE`, the
published ports, cookie names, host directories) go in `.env` at the
repository root, one `KEY=value` per line; `.env.example` lists them. The
Makefile passes them to the processes it starts and to docker compose (run
compose by hand with `--env-file .env`). A variable set on the command line
or in the environment wins. `.env` is git- and docker-ignored, but keep the
secrets in `.secrets/`: files are not copied into every process's
environment.

The server defaults to production mode, which marks cookies Secure: a
browser drops them over plain HTTP (except from `localhost`), so login fails.
A local stack reached over HTTP needs `ASCENDER_MODE=development` in `.env`,
which the `.env` that `make init` creates has.
The compose file publishes the web port on `127.0.0.1` only; set
`ASCENDER_WEB_BIND=0.0.0.0` in `.env` to answer other hosts.

```bash
make init         # once: compose and Go if missing, the secrets and .env
make start        # podman compose -f deploy/docker-compose.yml up -d --build
```

The compose targets use `podman compose` when it works, else `docker
compose`, and fail when neither does; `COMPOSE_CMD="docker compose"` picks
one.

`make start` and `make restart` first create the task container's host
directories (`ASCENDER_PROJECTS_DIR`, default `/var/lib/ascender/projects`, and
`ASCENDER_JOB_PRIVATE_DIR`, default `/var/lib/ascender/job_private`) and give
them to uid 1000, the container's user (`make host-dirs`). Set the job
execution path setting (`ASCENDER_ISOLATION_BASE_PATH`) to
`/var/lib/ascender/job_private` to keep job private data in that host
directory; any path inside the container works too. Execution environment
images are pulled into the task container's podman and kept in the
`podman_storage` volume, so the first job on an image waits for the pull.
Podman's settings for running nested are in `deploy/podman/containers.conf`.
The task container registers itself as an instance
(`ascender-task`) and joins the `controlplane` and `default` groups by their
policies.

`make stop`, `make restart`, `make logs` and `make ps` manage the
containers (`SERVICES=web` or `SERVICES=task` limits them to one); `make
help` lists every target. The Go source is in `src/` and the image build
context is the repository root.

The UI is then at http://localhost:8070/ and the API at http://localhost:8070/api/v2/.

Services to develop integrations against (a NetBox for the `netbox`
inventory source) run beside these containers from `tools/`, which has its own
Makefile and `.env`: see `tools/README.md`.

## Running the binaries directly

`make run-web` and `make run-task` do this with the defaults below and the
secrets from `.secrets/`. By hand, from `src/`:

```bash
ASCENDER_DB_PASSWORD="$(cat ../.secrets/ASCENDER_DB_PASSWORD)" ASCENDER_DB_PORT=5442 ASCENDER_DB_SSLMODE=disable \
ASCENDER_SECRET_KEY_FILE=../.secrets/SECRET_KEY \
ASCENDER_LISTEN=:8070 ASCENDER_PROJECTS_ROOT=/var/lib/ascender/projects \
ASCENDER_STATIC_DIR=web/static ASCENDER_TEMPLATE_DIR=web/templates \
ASCENDER_DOCS_DIR=../docs/docsite \
go run ./cmd/ascender-web
```

`ASCENDER_STATIC_DIR` and `ASCENDER_TEMPLATE_DIR` serve the UI from disk and
reload templates whenever one changes, so pages can be edited without a rebuild.
`ASCENDER_DOCS_DIR` serves the documentation site under `/docs/`; with
`ASCENDER_TEMPLATE_DIR` set, it is read again whenever one of its files
changes.

## The database schema

The schema is the Django application's at one level, the last of its
migrations (`main.0233_job_monitor_lease`), and the Go binaries carry it
(`src/internal/db/baseline/`). At startup both processes look at the
database before reading anything else:

- **An empty database** is given the schema and the rows the migrations
  wrote (content types, permissions, the managed credential types, the
  system job templates and their schedules), in one transaction, and its
  own `INSTALL_UUID`.
- **A database the Django application migrated** must have reached that
  level; it says so in `django_migrations`, which a new database carries
  too. One that has not is refused with the migrations it lacks named: the
  last release of the Python application brings it there, and nothing else
  can, so that is the one step an older installation takes first.
- **A database that holds other tables** and no `django_migrations` is
  refused, and left as it is.

### The admin account

The process that gives an empty database the schema (web or task, whichever
starts first) also creates the system administrator `admin`, and then what
`create_preload_data` creates: the organization `Default`, with the managed
`Ansible Galaxy` credential (`https://galaxy.ansible.com/`, which cannot be
changed or deleted) as its Galaxy server. Last come the execution environments
`register_default_execution_environments` registers: `Ascender EE (latest)`,
which jobs run in, and the managed `Control Plane Execution Environment`,
which project updates run in and which cannot be deleted (only its pull
policy can be changed). Both use `ghcr.io/ctrliq/ascender-ee:latest` (or
what the settings file names in `GLOBAL_JOB_EXECUTION_ENVIRONMENTS` and
`CONTROL_PLANE_EXECUTION_ENVIRONMENT`) and pull their image only when it is
missing; the command itself leaves the pull policy at the default, as the
old one did. The `admin` password is
the admin password (`ASCENDER_ADMIN_PASSWORD`, or the file
`ASCENDER_ADMIN_PASSWORD_FILE` names: `.secrets/ADMIN_PASSWORD` for the
Makefile and the compose file) when one is set. Without one it is a random
password, written once to that process's output (`make logs`, or `docker
logs ascender_web` / `ascender_task`) and never to an external log
aggregator:

```
level=WARN msg="admin: created the system administrator with a generated password; ..." username=admin password=...
```

When the admin password is set, every start of the server (`ascender-web`
without a command) or the task process also makes it the `admin` account's
password, creating the account if there is none. An account already holding
that password is left as it is, sessions included; a changed password ends
the account's sessions. Remove the password, or leave it blank, to manage the
account from the user interface instead. `ascender-web migrate` and the other
commands do neither: an installation set up with them creates its
administrator with `createsuperuser` (below).

Changes to the schema after that level are the Go application's own
(`src/internal/db/migrations`, recorded in `ascender_migrations`): a few
indexes so far. Both `ascender-web` and `ascender-task` apply pending ones
in the background at startup, so an upgrade needs no extra step. Index
builds use `CREATE INDEX CONCURRENTLY` and do not block writes. To do all
of it before anything serves, and to see the state, run `ascender-web
migrate` (`make migrate`; in the container, `ascender-web migrate`): it
creates or checks the schema and waits for the migrations. The trigram
search indexes need `CREATE EXTENSION pg_trgm`, which the database owner may
run on PostgreSQL 13 and later. Where that is not allowed they are skipped
with a warning, retried at each start, and search stays unindexed.

## Setting up a new installation

`ascender-web` has the old management commands a new installation is set up
with, under their old names (`ascender-web help` lists them). Each is one
invocation of the binary, with the same environment as the server, and is
safe to repeat:

```
ascender-web migrate
ASCENDER_SUPERUSER_PASSWORD=... ascender-web createsuperuser --username admin --email admin@example.com --if-missing
ascender-web register_default_execution_environments
ascender-web create_preload_data
```

`register_default_execution_environments` registers what the settings file
names in `GLOBAL_JOB_EXECUTION_ENVIRONMENTS` and
`CONTROL_PLANE_EXECUTION_ENVIRONMENT` (the old defaults without them), with a
registry credential when `--registry-url`, `--registry-username` and a
password (`--registry-password` or `ASCENDER_REGISTRY_PASSWORD`) are given.
`provision_instance`, `add_receptor_address` and `deprovision_instance`
register and remove mesh nodes from outside the API, as the operator does
for a mesh ingress, and `update_password` sets a user's password.

The instance groups jobs run in come from the first task process: in a
database with no instance group it creates `controlplane` and `default`
(on Kubernetes it registers them at every start, `default` as a container
group). `register_queue --queuename NAME [--instance_percent N]
[--instance_minimum N] [--hostnames NODE,...]` creates or updates others,
as the old installer's command did.

For performance work, `make perf-seed ASCENDER_DB_NAME=ascender_perf`
loads scale data (`src/cmd/zz-perfseed`; it refuses any database whose name
does not end in `_perf`) into a copy of the database. The users it creates
get `ASCENDER_PERF_PASSWORD`, or a random password it prints; users that
already exist keep theirs.

## Configuration

| Variable | Meaning | Old setting |
| --- | --- | --- |
| `ASCENDER_DATABASE_URL` or `ASCENDER_DB_*` | PostgreSQL connection: a URL, or `ASCENDER_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD` and `_SSLMODE` (default `prefer`, which falls back to an unencrypted connection and checks no certificate: use `verify-full` for a database on another host) | `DATABASES` |
| `ASCENDER_DB_STATEMENT_TIMEOUT` | Seconds any one SQL statement may run (unset: no limit). Set it for the web process, where a request's filters decide the work; migrations lift it for themselves | — |
| `ASCENDER_DB_MAX_CONNS` | Database connections each process may hold (default 20) | `CONN_MAX_AGE` and the worker count |
| `ASCENDER_SQL_DEBUG` | `1` reports each API request's and UI page's statement count and time in `X-API-Query-Count` and `X-API-Query-Time` (a page's count includes the API calls it makes); `2` also logs every statement with its duration and request id (default off) | `SQL_DEBUG` |
| `ASCENDER_LOG_LEVEL` | Lowest level `ascender-web` and `ascender-task` write to their output: `debug`, `info` (default), `warn` or `error` | `LOG_AGGREGATOR_LEVEL` and the Django logging levels |
| `ASCENDER_SECRET_KEY` / `ASCENDER_SECRET_KEY_FILE` | Key for encrypted fields | `SECRET_KEY` |
| `ASCENDER_ADMIN_PASSWORD` / `ASCENDER_ADMIN_PASSWORD_FILE` | The `admin` account's password, set at each start; blank or unset leaves the account as it is (see "The admin account"). Surrounding whitespace is ignored | the installer's `ASCENDER_ADMIN_PASSWORD` |
| `ASCENDER_LISTEN` | Web listen address (default `:8070`) | nginx/uvicorn |
| `ASCENDER_DOCS_DIR` | The documentation site's directory (`docs/docsite`), which `ascender-web` serves under `/docs/` to anyone, signed in or not. The web image sets it to `/usr/share/ascender/docs`; unset, there is no `/docs/`, and the user interface's help links, which point there, find nothing | the separate documentation site |
| `ASCENDER_TLS_CERT_FILE`, `ASCENDER_TLS_KEY_FILE` | A certificate and its key (PEM) make the web server serve HTTPS itself; both or neither. The files are read again when they change, so a renewed certificate needs no restart. Without them it serves HTTP, for whatever terminates TLS in front of it | nginx's `ssl_certificate` behind a passthrough route |
| `ASCENDER_SETTINGS_FILE` | A JSON object of settings the deployment decides (see "Settings from a file") | `/etc/tower/settings.py` and `conf.d/*.py` |
| `ASCENDER_PROJECTS_ROOT` | Project checkouts | `PROJECTS_ROOT` |
| `ASCENDER_JOBOUTPUT_ROOT` | Job artifacts and the callback plugin cache | `JOBOUTPUT_ROOT` |
| `ASCENDER_TASK_WORKERS` | How many runs the task process starts at once (default 4); the instances' capacity still decides what fits | the dispatcher's worker pool |
| `ASCENDER_CONTAINER_RUNTIME` | `podman` or `docker` for execution environments (default: podman if installed, else docker) | runner's `process_isolation_executable` |
| `ASCENDER_CLUSTER_HOST_ID` | This node's name. `ascender-task` registers it in the instance list at startup (and places a new node in the instance groups by their policies), as the old `provision_instance` did | `CLUSTER_HOST_ID` |
| `ASCENDER_NODE_TYPE` | The type `ascender-task` registers its node as: `hybrid` (the default) or `control` | `provision_instance --node_type` |
| `ASCENDER_RECEPTOR_CONFIG` | The local receptor node's configuration, read for its control socket, first TLS client and work signing (default `/etc/receptor/receptor.conf`); without it the task process runs no mesh work | the fixed `/etc/receptor/receptor.conf` |
| `ASCENDER_RECEPTOR_SOCKET` | The control socket's path as this process sees it, when it differs from the configuration's | `control-service` `filename` |
| `ASCENDER_LOG_AGGREGATOR_ERROR_LOG_FILE` | Where records an HTTP log aggregator refused are written (default `/var/log/ascender/rsyslog.err` when that directory exists) | `LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE` |
| `ASCENDER_AUTH_MAP_CASE_INSENSITIVE` | Trigger rules in the login maps compare group names, attribute names and values without regard to case (default off) | `AUTH_MAP_CASE_INSENSITIVE` |
| `OAUTH2_FEDERATED_TOKEN_FILE`, `AZURE_FEDERATED_TOKEN_FILE` | A workload identity token that Azure AD and Entra ID logins present instead of a client secret | the same variables |
| `ASCENDER_SHUTDOWN_TIMEOUT` | Seconds a stopping task process waits for its jobs to detach, re-queue or stop (default 30) | the dispatcher's graceful stop |
| `JOB_MONITOR_LEASE_SECONDS`, `JOB_MONITOR_RENEW_SECONDS`, `JOB_MONITOR_RETRY_SECONDS`, `JOB_MONITOR_WEDGE_SECONDS`, `JOB_MONITOR_STREAM_IDLE_SECONDS`, `JOB_MONITOR_SWEEP_BATCH`, `JOB_MONITOR_MAX_DEFERRALS` | The job monitor (defaults 60, 10, 30, 60, 120, 50, 120); it needs the old app's migration 0233 (`main_jobmonitorlease`) | the same settings |
| `ASCENDER_SESSION_COOKIE_NAME` | Session cookie (default `ascender_sessionid`) | `SESSION_COOKIE_NAME` |
| `ASCENDER_SESSION_COOKIE_SECURE` | Secure flag on cookies, and HSTS on responses (default on, off when `ASCENDER_MODE` is `development`) | `SESSION_COOKIE_SECURE` |
| `ASCENDER_CSRF_COOKIE_NAME` | CSRF cookie (default `csrftoken`) | `CSRF_COOKIE_NAME` |
| `ASCENDER_CSRF_TRUSTED_ORIGINS` | Comma-separated origins, besides the server's own, that may send state-changing requests with a session (`https://ui.example.com`). Browsers mark a request from another site, including a sibling subdomain, and such requests are refused unless their origin is listed | `CSRF_TRUSTED_ORIGINS` |
| `ASCENDER_CORS_ALLOWED_ORIGINS` | Comma-separated origins whose pages may read the API's responses from a browser (`https://tools.example.com`, `http://127.0.0.1:9000`, or `null`): a scheme and host[:port] with no path. Empty (the default) allows none. No credentials are allowed, so such pages authenticate with a token; see [docs/cors.md](../docs/cors.md) | `CORS_ALLOWED_ORIGINS` |
| `ASCENDER_ALLOWED_HOSTS` | Comma-separated Host names the server answers to (`ascender.example.com`, `.example.com` for a domain and its subdomains, `*`); others get a 400. Empty (the default) answers any. Set it in production: SSO callback and redirect addresses are built from the Host header | `ALLOWED_HOSTS` |
| `ASCENDER_SAML_REJECT_UNSOLICITED` | Refuse SAML responses no login here asked for (IdP-initiated sign-on), which another site could post to sign a browser in as someone else (default off) | none |
| `ASCENDER_LOGGED_IN_COOKIE_NAME` | The UI's logged-in marker cookie (default `userLoggedIn`) | the old UI's `userLoggedIn` |
| `ASCENDER_VERSION` | Reported version string (the published images set it at build time: the release tag, or the date and commit for a development image) | package version |
| `ASCENDER_MODE` | `production` (the default) for a deployment served over HTTPS; `development` leaves cookies without the Secure flag, sends no HSTS, and adds the swagger link, for plain HTTP | `MODE` |

Browsers share cookies between the ports of one host. When the Go server
runs beside the old application on the same host, give it its own session,
CSRF and logged-in cookie names (in `.env`, which `.env.example` shows
with `ascender_new_*`); with the defaults, each application's responses
replace the other's session cookie and its users are signed out within
minutes. The defaults are the old names, for a Go server that replaces the
old one, and the compose file keeps them unless `.env` sets others.

## Settings from a file

`ASCENDER_SETTINGS_FILE` names a JSON object, a setting's name to its value,
for what the deployment decides rather than an administrator:

```json
{"IS_K8S": true, "ASCENDER_AUTO_DEPROVISION_INSTANCES": true, "SESSION_COOKIE_AGE": 3600}
```

It is what the old application's settings files were. A setting given
there is not overridden by the database, is left out of what the API
writes, and reports `defined_in_file` in the category's OPTIONS. Both
processes read the file once, at startup, and should be given the same
one. A registered setting gets the validation a PUT of it would get; a
value that fails it, a value of the wrong type and a name the application
does not read are each logged and skipped, and the process starts with the
rest.

Besides the registered settings, the file takes the ones the old
application read from its files alone:

| Setting | Meaning |
| --- | --- |
| `IS_K8S` | The deployment runs on Kubernetes. The task process registers the control plane group and the default container group at startup, has project updates run as `local` work of the receptor beside it instead of starting a container itself, keeps that receptor's configuration in step with the peers in the database, and works out capacity without the 2 GiB a host's services take |
| `ASCENDER_AUTO_DEPROVISION_INSTANCES` | A control node the heartbeat loses is removed rather than marked unavailable: a pod that is gone does not come back under its name |
| `DISABLE_ALL_SCHEDULES` | No schedule launches, and new ones cannot be enabled |
| `DEFAULT_CONTROL_PLANE_QUEUE_NAME`, `DEFAULT_EXECUTION_QUEUE_NAME` | The two groups' names (`controlplane`, `default`) |
| `DEFAULT_EXECUTION_QUEUE_POD_SPEC_OVERRIDE`, `DEFAULT_EXECUTION_QUEUE_MAX_FORKS`, `DEFAULT_EXECUTION_QUEUE_MAX_CONCURRENT_JOBS` | What the default container group is registered with on Kubernetes |
| `RECEPTOR_LOG_LEVEL` | The log level written into the receptor configuration on Kubernetes (`info`) |
| `VMWARE_VALIDATE_CERTS` | Whether VMware inventory sources verify certificates |

## On Kubernetes

The operator runs the two containers as they are, with `IS_K8S` in the
settings file. The task container then needs no container runtime and no
privileges: jobs run in the pods of container groups, and project updates
(the sync before a job too) in the receptor container beside it, which
runs `ansible-runner worker` in the control plane execution environment
with the projects directory mounted at the same path. `ascender-task
check_instance_ready` is the old management command, for a readiness
probe: it exits 0 when this node's instance is ready.

Settings stored in the database (`conf_setting`) apply exactly as before,
including `SESSION_COOKIE_AGE`, `CUSTOM_LOGIN_INFO`, `CUSTOM_TITLE`,
`AUTH_BASIC_ENABLED`, and for jobs `ASCENDER_ISOLATION_BASE_PATH`,
`ASCENDER_ISOLATION_SHOW_PATHS`, `ASCENDER_TASK_ENV`,
`DEFAULT_CONTAINER_RUN_OPTIONS`, `DEFAULT_EXECUTION_ENVIRONMENT`,
`DEFAULT_JOB_TIMEOUT`, `DEFAULT_JOB_IDLE_TIMEOUT`, `MAX_FORKS`,
`ALLOW_JINJA_IN_EXTRA_VARS` and `ANSIBLE_FACT_CACHE_TIMEOUT`.

## Running jobs in development

The task process on the host uses docker when podman is absent (`make
run-task`, or from `src/`):

```bash
ASCENDER_DB_PASSWORD="$(cat ../.secrets/ASCENDER_DB_PASSWORD)" ASCENDER_DB_PORT=5442 ASCENDER_DB_SSLMODE=disable \
ASCENDER_SECRET_KEY_FILE=../.secrets/SECRET_KEY \
ASCENDER_PROJECTS_ROOT=/var/lib/ascender/projects ASCENDER_JOBOUTPUT_ROOT=/var/lib/ascender/job_status \
ASCENDER_CONTAINER_RUNTIME=docker go run ./cmd/ascender-task
```

Launching a job template then runs its playbook in the template's
execution environment image (`ghcr.io/ctrliq/ascender-ee:latest` by
default), with the output appearing on the job's Output page.
