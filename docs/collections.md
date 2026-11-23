## Collections and Roles

Ascender installs the Ansible collections and roles a project asks for when
it updates the project, and gives them to every job that runs from it. The
project update is the `project_update.yml` playbook
(`src/internal/tasks/playbooks/project_update.yml`), run by `ascender-task`
(`src/internal/tasks/project_update.go`); the content cache is handled in
`src/internal/tasks/project_cache.go`.

### Requirements files

A project update looks for these files in the project:

| File | Command | Installs when |
|---|---|---|
| `roles/requirements.yml` (or `.yaml`) | `ansible-galaxy role install -r <file>` | role download is enabled |
| `collections/requirements.yml` (or `.yaml`) | `ansible-galaxy collection install -r <file>` | collection download is enabled |
| `requirements.yml` (or `.yaml`) at the top of the project | `ansible-galaxy install -r <file>` (roles and collections) | both are enabled |

The commands run in the project directory, so the project's `ansible.cfg`
applies to them, with `-vvv` when the `PROJECT_UPDATE_VVV` setting is on.
`ansible-galaxy` installs into the project update's staging directory: the
playbook sets `ANSIBLE_COLLECTIONS_PATH` to
`<PROJECTS_ROOT>/.__awx_cache/<local_path>/stage/requirements_collections` and
`ANSIBLE_ROLES_PATH` to `.../stage/requirements_roles`.

Download is controlled by two settings, both on by default:
`ASCENDER_ROLES_ENABLED` ("Enable Role Download") and
`ASCENDER_COLLECTIONS_ENABLED` ("Enable Collection(s) Download"). Both also
require at least one Galaxy credential on the project's organization (see
[Galaxy server selection](#galaxy-server-selection)). When neither applies,
the update prints "Collection and role syncing disabled. Check the
ASCENDER_ROLES_ENABLED and ASCENDER_COLLECTIONS_ENABLED settings and Galaxy
credentials on the project's organization." and installs nothing.

`GALAXY_TASK_ENV` adds environment variables to the `ansible-galaxy` commands
only (a proxy for Galaxy but not for git, for example), and
`GALAXY_IGNORE_CERTS` sets `ANSIBLE_GALAXY_IGNORE=True` for the update.

### In the job

Before a job runs, its private data directory gets a copy of the project
and of the roles and collections installed for the revision it runs
(`makeLocalCopy`): `requirements_collections/` when collection download is
enabled and `requirements_roles/` when role download is enabled. The job sets
`ANSIBLE_COLLECTIONS_PATH` and `ANSIBLE_ROLES_PATH` with
`/runner/requirements_collections` and `/runner/requirements_roles` first,
followed by any path the job's environment or the project's `ansible.cfg`
gives (`collections_path`, `roles_path`) and Ansible's defaults.

The private data directory of a job looks like this:

```
├── requirements_collections
│   └── ansible_collections
│       └── namespace
│           └── collection_name
│               ├── FILES.json
│               ├── MANIFEST.json
│               ├── README.md
│               ├── roles
│               │   └── role_in_collection_name
│               │       ├── defaults
│               │       │   └── main.yml
│               │       ├── tasks
│               │       │   └── main.yml
│               │       └── templates
│               │           └── stuff.j2
│               └── tests
│                   └── main.yml
└── requirements_roles
    └── namespace.role_name
        ├── defaults
        │   └── main.yml
        ├── meta
        │   └── main.yml
        ├── README.md
        ├── tasks
        │   ├── main.yml
        │   └── some_role.yml
        ├── templates
        │   └── stuff.j2
        └── vars
            └── Archlinux.yml
```

An SCM inventory source whose project installed collections also gets
`/runner/requirements_collections` first in its `ANSIBLE_COLLECTIONS_PATH`
(`src/internal/tasks/inventory_update.go`).

### Cache folder mechanics

Every project update that installs content (one started through
`/api/v2/projects/N/update/`, by a schedule, a workflow, or as a dependency
of a job) saves the roles and collections to the project's content cache,
either freshly downloaded or reused from the requirements cache described
below.

Project updates install into a staging directory such as:

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/stage
```

(`/var/lib/ascender/projects/` is the default `PROJECTS_ROOT`, set with the
`ASCENDER_PROJECTS_ROOT` environment variable.)

After a successful update, the staging directory is renamed to the cache id
of the revision the update fetched: the commit hash for git, the revision
for Subversion, the archive's checksum for an archive. An update that ran on
a branch other than the project's (a job template's branch override) uses
the update's id instead:

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/0a1b2c3d...
```

Everything else in the project's cache folder is removed, except the
requirements caches below and, after an update on another branch, the cache
of the project's own revision. A failed update discards the staging
directory.

Before a job runs, it may sync the project (a project update of job type
`run`; see [Background Tasks](./tasks.md#project-updates)). That sync installs the roles and
collections again when it updates the checkout, when the job runs on another
branch, or when the cache of the project's revision is incomplete.

### Requirements cache

Installed roles and collections are also kept for reuse across project
revisions in a folder keyed by a SHA-256 of the requirements files, the
project's `ansible.cfg`, whether roles and collections are enabled, the
organization's Galaxy credentials (their URLs, and a fingerprint of their
URLs, auth URLs and tokens), the `GALAXY_TASK_ENV`, `ASCENDER_TASK_ENV` and
`GALAXY_IGNORE_CERTS` settings, and the latest refresh (see below):

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/reqcache_<hash>
```

Before running `ansible-galaxy`, the project update computes that key (the
`requirements_cache_key` module in `src/internal/tasks/playbooks/library/`).
When the folder already exists, installation is skipped, the revision's cache
folder holds only a `.requirements_hash` file, and jobs copy (or extract the
`.tar` archive of) the content from `reqcache_<hash>` instead. Otherwise the
freshly installed content is published there after a successful update.

- Reuse is controlled per project by the **Reuse Downloaded Requirements**
  option (`reuse_requirements`, on by default). When it is off, every update
  of that project installs afresh and the next successful update removes the
  requirements caches that the kept revision does not rely on.
- Updates that run for a job or workflow (update on launch, job project
  syncs, workflow project nodes) reuse the requirements cache. Updates you
  start, scheduled updates and relaunches always install fresh copies and
  replace it, which picks up new releases of unpinned requirements. A refresh
  applies to every node: other nodes install afresh on their next update
  instead of reusing what they installed before it.
- Requirements files that reference a source control repository, URL, file,
  directory or `include:` are not keyed by their content and are never
  reused. This includes any collection whose name is not a
  `namespace.collection` name and any role whose source is a file in the
  project. The update says why: "Requirements are not reused between
  revisions: ...".
- Up to 10 requirements caches are kept per project. The least recently used
  are evicted, except one that a kept revision still relies on. A revision
  whose requirements cache is gone is treated as uncached, so the next job
  sync installs again.

### Galaxy server selection

For how Galaxy servers are configured in Ansible in general, see
https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html.

Project updates download roles and collections from the Galaxy credentials
of the project's organization, in order. They are managed at
`/api/v2/organizations/N/galaxy_credentials/`: `POST {"id": <credential id>}`
adds one at the end and `POST {"id": <credential id>, "disassociate": true}`
removes it. Both take admin on the organization and read access to the
credential, as in the old application: read is enough, since the token goes
only to the servers the credential itself names (its URL and Auth URL) and
is hidden from the update's `job_env`. A credential of another type is
refused with
`{"msg": "Credential must be a Galaxy credential, not Machine."}`.
Authentication with an API token is optional for public servers such as
https://galaxy.ansible.com/, but other content sources (such as Red Hat
Ansible Automation Hub) need the Auth URL and Token.

The update passes the credentials to `ansible-galaxy` as
`ANSIBLE_GALAXY_SERVER_LIST=server0,server1,...` with
`ANSIBLE_GALAXY_SERVER_SERVER<n>_URL`, `..._AUTH_URL` and `..._TOKEN` for
each.

If an organization has no Galaxy credentials, roles and collections are
*not* installed from the requirements files of its projects' updates; a
project without an organization has none. A new installation
(`ascender-web create_preload_data`) gives its Default organization the
managed `Ansible Galaxy` credential, an organization created by an SSO login
gets it too, and the UI's new organization form starts with it selected.

Even when Galaxy servers are configured, a requirement can name its own
server with the `source:` option, as described in the Ansible documentation.
