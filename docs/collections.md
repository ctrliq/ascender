## Collections

Ascender supports the use of Ansible Collections. This section will give ways to use Collections in job runs.

### Project Collections Requirements

If you specify a collections requirements file in SCM at `collections/requirements.yml` of a project,
 then Ascender will install collections from that file to a special cache folder in project updates.
Before a job runs, the roles and/or collections will be copied from the special
cache folder to the job temporary folder.

The invocation looks like:

```
ansible-galaxy collection install -r requirements.yml -p <project cache location>/_<project #>__<project name>/stage/requirements_collections
```

Example of the resultant job `tmp` directory where job is running:

```
├── requirements_collections
│   └── ansible_collections
│       └── namespace
│           └── collection_name
│               ├── FILES.json
│               ├── MANIFEST.json
│               ├── README.md
│               ├── roles
│               │   ├── role_in_collection_name
│               │   │   ├── defaults
│               │   │   │   └── main.yml
│               │   │   ├── tasks
│               │   │   │   └── main.yml
│               │   │   └── templates
│               │   │       └── stuff.j2
│               └── tests
│                   └── main.yml
└── requirements_roles
    └── namespace.role_name
        ├── defaults
        │   └── main.yml
        ├── meta
        │   └── main.yml
        ├── README.md
        ├── tasks
        │   ├── main.yml
        │   └── some_role.yml
        ├── templates
        │   └── stuff.j2
        └── vars
            └── Archlinux.yml
```

### Cache Folder Mechanics

Every time a project is updated as a "check" job
(via `/api/v2/projects/N/update/` or by a schedule, workflow, etc.),
the roles and collections are saved to the project's content cache, either freshly
downloaded or reused from the requirements cache described below.

Project updates all initially target a staging directory at a path like:

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/stage
```

After the update finishes, the task logic will decide what id to associate
with the content downloaded.
Then the folder will be renamed from "stage" to the cache id.
For instance, if the cache id is determined to be 63:

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/63
```

The cache may be updated by project syncs (the "run" type) which happen before
job runs. It will populate the cache id set by the last "check" type update.

### Requirements Cache

Installed roles and collections are also kept for reuse across project revisions in
a folder keyed by a SHA256 of the requirements files, the project's `ansible.cfg`,
the organization's Galaxy credentials (URL, auth URL and token, the latter two only as
a fingerprint), the `GALAXY_TASK_ENV` and `ASCENDER_TASK_ENV` settings and the latest
refresh (see below):

```
/var/lib/ascender/projects/.__awx_cache/_42__project_name/reqcache_<hash>
```

Before running `ansible-galaxy`, the project update computes that key. When the folder
already exists, installation is skipped, the revision's cache folder holds only a
`.requirements_hash` file, and jobs copy (or extract the `.tar` archive of) the
content from `reqcache_<hash>` instead. Otherwise the freshly installed content
is published there after a successful update.

- Reuse is controlled per project by the **Reuse Downloaded Requirements** option
  (`reuse_requirements`, on by default). When it is off, every update of that project
  installs afresh and the next successful update removes the requirements caches that
  the kept revision does not rely on.
- Updates that run for a job or workflow (update on launch, job project syncs, workflow
  project nodes) reuse the requirements cache. Updates you start, scheduled updates and
  relaunches always install fresh copies and replace it, which picks up new releases of
  unpinned requirements. A refresh applies to every node: other nodes install afresh on
  their next update instead of reusing what they installed before it.
- Requirements files that reference a source control repository, URL, file, directory
  or `include:` are not keyed by their content and are never reused. This includes any
  collection whose name is not a `namespace.collection` name and any role whose source
  is a file in the project.
- Up to 10 requirements caches are kept per project. The least recently used are evicted,
  except one that a kept revision still relies on. A revision whose requirements cache is
  gone is treated as uncached, so the next job sync installs again.

### Galaxy Server Selection

For details on how Galaxy servers are configured in Ansible in general see:

https://docs.ansible.com/ansible/devel/user_guide/collections_using.html
(if "devel" link goes stale in the future, it is for Ansible 2.9)

You can specify a list of zero or more servers to download roles and
collections from for Ascender Project Updates.  This is done by associating Galaxy
credentials (in sequential order) via the API at
`/api/v2/organizations/N/galaxy_credentials/`.  Authentication
via an API token is optional (i.e., https://galaxy.ansible.com/), but other
content sources (such as Red Hat Ansible Automation Hub) require proper
configuration of the Auth URL and Token.

If no credentials are defined at this endpoint for an Organization, then roles and
collections will *not* be installed based on requirements.yml for Project Updates
in that Organization.

Even when these settings are enabled, this can still be bypassed for a specific
requirement by using the `source:` option, as described in Ansible documentation.
