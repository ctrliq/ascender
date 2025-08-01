# Ascender

Ascender provides a web interface and distributed task engine for scheduling and
running Ansible playbooks.  As such, it relies heavily on the interfaces
provided by Ansible.  This document provides a birds-eye view of the notable
touchpoints between Ascender and Ansible.


## Terminology

Ascender has a variety of concepts which map to components of Ansible, or
which further abstract them to provide functionality on top of Ansible.  A few
of the most notable ones are:


### Projects

Projects represent a collection of Ansible playbooks.  Most Ascender users create
Projects that import periodically from source control systems (such as git
or subversion repositories).  This import is accomplished via an
Ansible playbook included with Ascender (which makes use of the various source
control management modules in Ansible).


### Inventories

Ascender manages Inventories, Groups, and Hosts, and provides a RESTful interface
that maps to static and dynamic Ansible inventories.  Inventory data can
be entered into Ascender manually, but many users perform Inventory Syncs to import
inventory data from a variety of external sources.


### Job Templates

A Job Template is a definition and set of parameters for running
`ansible-playbook`.  If defines metadata about a given playbook run, such as:

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
`ansible_ssh_user` as an extra variable).


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


## Ascender's Interaction with Ansible

The touchpoints between Ascender and Ansible are mostly encompassed by
everything that happens *after* a job is started in Ascender.  Specifically, this
includes:

* Any time a Job Template is launched
* Any time a Project Update is performed
* Any time an Inventory Sync is performed
* Any time an Adhoc Command is run


### Spawning Ansible Processes

Ascender relies on a handful of stable interfaces in its interaction with Ansible.
The first of these are the actual CLI for `ansible-playbook` and
`ansible-inventory`.

When a Job Template or Project Update is run in Ascender, an actual
`ansible-playbook` command is composed and spawned in a pseudoterminal on one
of the servers/containers that make up the Ascender installation.  This process runs
until completion (or until a configurable timeout), and the return code,
`stdout`, and `stderr` of the process are recorded in the Ascender database.  Ad hoc
commands work the same way, though they spawn `ansible` processes instead of
`ansible-playbook`.

Similarly, when an Inventory Sync runs, an actual `ansible-inventory` process
runs, and its output is parsed and persisted into the Ascender database as Hosts and
Groups.

Ascender relies on stability in CLI behavior to function properly across Ansible
releases; this includes the actual CLI arguments _and_ the behavior of task
execution and prompts (such as password, `become`, and Vault prompts).


### Capturing Event Data

Ascender applies an Ansible callback plugin to all `ansible-playbook` and `ansible`
processes it spawns.  This allows Ansible events to be captured and persisted
into the Ascender database; this process is what drives the "streaming" web UI
you'll see if you launch a job from the Ascender web interface and watch its results
appears on the screen.  Ascender relies on stability in this plugin interface, the
hierarchy of emitted events based on strategy, and _especially_ the structure
of event data to work across Ansible releases:

![Event Data Diagram](https://user-images.githubusercontent.com/722880/35641610-ae7f1dea-068e-11e8-84fb-0f96043d53e4.png)


### Fact Caching

Ascender provides a custom fact caching implementation that allows users to store
facts for playbook runs across subsequent Job Template runs.  Specifically, Ascender
makes use of the `jsonfile` fact cache plugin;  after `ansible-playbook` runs
have exited, Ascender consumes the entire `jsonfile` cache and persists it in the
Ascender database.  On subsequent Job Template runs, prior `jsonfile` caches are
restored to the local file system so the new `ansible-playbook` process makes
use of them.


### Environment-Based Configuration

Ascender injects credentials and module configuration for a number of Ansible
modules via environment variables.  Examples include:

* `ANSIBLE_NET_*` and other well-known environment variables for network device authentication
* API keys and other credential values which are utilized
  (`AWS_ACCESS_KEY_ID`, `GCE_EMAIL`, etc...)
* SSH-oriented configuration flags, such as `ANSIBLE_SSH_CONTROL_PATH`

Ascender relies on stability in these configuration options to reliably support
credential injection for supported Ansible modules.
