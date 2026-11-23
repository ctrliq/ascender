# Ascender

Ascender provides a web interface and distributed task engine for scheduling and
running Ansible playbooks.  As such, it relies heavily on the interfaces
provided by Ansible.  This document provides a bird's-eye view of the notable
touchpoints between Ascender and Ansible.


## Terminology

Ascender has a variety of concepts which map to components of Ansible, or
which further abstract them to provide functionality on top of Ansible.  A few
of the most notable ones are:


### Projects

Projects represent a collection of Ansible playbooks.  Most Ascender users create
Projects that import periodically from source control systems (such as git
or subversion repositories) or from a remote archive.  This import is
accomplished via an Ansible playbook included with Ascender (which makes use
of the various source control management modules in Ansible), and it also
installs the roles and collections the project requires (see
[Collections and Roles](./collections.md)).


### Inventories

Ascender manages Inventories, Groups, and Hosts, and provides a RESTful interface
that maps to static and dynamic Ansible inventories.  Inventory data can
be entered into Ascender manually, but many users perform Inventory Syncs to import
inventory data from a variety of external sources (see
[Inventories](./inventory/README.md)).


### Job Templates

A Job Template is a definition and set of parameters for running
`ansible-playbook`.  It defines metadata about a given playbook run, such as:

* a named identifier
* an associated inventory to run against
* the project and `.yml` playbook to run
* a variety of other options which map directly to `ansible-playbook`
  arguments (`extra_vars`, verbosity, forks, limit, etc...)


### Credentials

Ascender stores sensitive credential data which can be attached to `ansible-playbook`
processes that it runs.  This data can be oriented towards SSH connection
authentication (usernames, passwords, SSH keys and passphrases),
Ansible-specific prompts (such as Vault passwords), or environmental
authentication values which various Ansible modules depend on (such as setting
`AWS_ACCESS_KEY_ID` in an environment variable, or specifying
`ansible_ssh_user` as an extra variable).  See
[Credentials](./credentials/README.md).


## Canonical Example

Bringing all of this terminology together, a "Getting Started Using Ascender" might
involve:

* Creating a new Project that imports playbooks from, for example, a remote git repository
* Manually creating or importing an Inventory which defines where the playbook(s) will run
* Optionally, saving a Credential which contains SSH authentication details for
  the host(s) where the playbook will run
* Creating a Job Template that specifies which Project and playbook to run and
  where to run it (Inventory), and any necessary Credentials (*e.g.*, SSH
  authentication)
* Launching the Job Template and viewing the results


## How Ascender Is Put Together

Ascender is two programs and a PostgreSQL database:

* `ascender-web` serves the REST API (`/api/v2/`) and the web UI. Launching a
  job through either records a pending job in the database.
* `ascender-task` runs on every control or hybrid node. It picks up pending
  jobs, prepares them and runs Ansible for them, writes their output to the
  database, and does the periodic work (schedules, the cluster heartbeat,
  cleanup).

The two share nothing but the database. See [Background Tasks](./tasks.md)
and [Clustering](./clustering.md).


## Ascender's Interaction with Ansible

The touchpoints between Ascender and Ansible are mostly encompassed by
everything that happens *after* a job is started in Ascender.  Specifically, this
includes:

* Any time a Job Template is launched
* Any time a Project Update is performed
* Any time an Inventory Sync is performed
* Any time an ad hoc command is run


### Spawning Ansible Processes

Ascender relies on a handful of stable interfaces in its interaction with Ansible.
The first of these are the actual CLI for `ansible-playbook` and
`ansible-inventory`.

When a Job Template or Project Update is run in Ascender, `ascender-task`
composes an actual `ansible-playbook` command and runs it in an execution
environment (a container image holding Ansible and its dependencies): with
podman or docker on a pseudo-terminal on the node itself, through receptor on
an execution node, or in a Kubernetes pod of a container group (see
[Ansible Runner Integration](./ansible_runner_integration.md)).  The process
runs until completion (or until a configurable timeout); its output is
recorded in the Ascender database as job events, and its exit status
decides the job's status.  Ad hoc commands work the same way, though they
spawn `ansible` processes instead of `ansible-playbook`.

Similarly, when an Inventory Sync runs, an actual `ansible-inventory` process
runs, and the JSON it prints is parsed by `ascender-task` and persisted into
the Ascender database as Hosts and Groups.

Ascender relies on stability in CLI behavior to function properly across Ansible
releases; this includes the actual CLI arguments _and_ the behavior of task
execution and prompts (such as password, `become`, and Vault prompts).


### Capturing Event Data

Ascender applies an Ansible callback plugin, ansible-runner's `awx_display`,
to all `ansible-playbook` and `ansible` processes it spawns.  This allows
Ansible events to be captured and persisted into the Ascender database; this
process is what drives the "streaming" web UI you'll see if you launch a job
from the Ascender web interface and watch its results appear on the screen.
Ascender relies on stability in this plugin interface, the hierarchy of
emitted events based on strategy, and _especially_ the structure of event
data to work across Ansible releases (see [Job Events](./job_events.md)):

![Event Data Diagram](https://user-images.githubusercontent.com/722880/35641610-ae7f1dea-068e-11e8-84fb-0f96043d53e4.png)


### Fact Caching

Ascender provides a custom fact caching implementation that allows users to store
facts for playbook runs across subsequent Job Template runs.  Specifically, Ascender
makes use of the `jsonfile` fact cache plugin: before a job runs, the facts
stored for its hosts are written as `jsonfile` cache files so the
`ansible-playbook` process makes use of them, and after it exits, Ascender
reads back the files that changed and persists them in the Ascender database
(see [Fact Caching](./fact_cache.md)).


### Environment-Based Configuration

Ascender injects credentials and module configuration for a number of Ansible
modules via environment variables.  Examples include:

* `ANSIBLE_NET_*` and other well-known environment variables for network device authentication
* API keys and other credential values which are utilized
  (`AWS_ACCESS_KEY_ID`, `GCE_EMAIL`, etc...)
* SSH-oriented configuration flags, such as `ANSIBLE_SSH_CONTROL_PATH_DIR`

Ascender relies on stability in these configuration options to reliably support
credential injection for supported Ansible modules.
