# Multi-Credential Assignment

A job template has a list of zero or more credentials, and the jobs it
launches run with them. The list is managed through one endpoint, and the same
rules apply to the credentials given at launch time and to those saved on
schedules and workflow nodes.

The endpoints are in `src/internal/api/job_template_relations.go`
(attaching), `src/internal/api/job_launch.go` (launch time) and
`src/internal/api/inventory_source_write.go` (inventory sources); the rule that
decides which credentials conflict, and the passwords a credential prompts
for, are `UniqueHash` and `PasswordsNeeded` in
`src/internal/models/job_template.go`.

## Assigning credentials to a job template

`GET /api/v2/job_templates/N/credentials/` lists a template's credentials.
Credentials are attached and detached with `POST` requests to the same
endpoint:

```
POST /api/v2/job_templates/N/credentials/ {"associate": true, "id": X}
POST /api/v2/job_templates/N/credentials/ {"disassociate": true, "id": Y}
```

Attaching takes admin on the template and use on the credential. A template
is valid with no credentials at all, for instance for a playbook that only
talks to a cloud service with `connection: local`.

Attaching a credential the template already has is refused like a second one
of its type (`Cannot assign multiple <type name> credentials.`, `400`), as
with the old application, which compared the credential with every attached
one, itself included. Detaching a credential the template does not have
answers `204`.

Each attach and detach is recorded in the activity stream, as the old
application recorded changes to `JobTemplate.credentials`: an `associate` or
`disassociate` entry with `object1` `job_template`, `object2` `credential`
and the relationship
`ascender.main.models.unified_jobs.UnifiedJobTemplate_credentials`, linked to
both. A detach is recorded even when the credential was not attached.

A `POST` without an `id` creates the credential and attaches it in one step:

```
POST /api/v2/job_templates/N/credentials/ {"name": "...", "credential_type": T, "organization": O, "inputs": {...}}
```

The body is that of `POST /api/v2/credentials/`, with the same validation and
the same permission (admin or credential admin of the organization; only a
superuser can leave the organization out, and `user` and `team` are not
taken here). Once created, the credential is attached under the rules above:
the answer is `201 Created` with the credential, as `POST
/api/v2/credentials/` gives it, and its `Location`. A credential the template
cannot take (a second one of its type, or a kind it does not run with) is
deleted again and the answer is the `400` an attach would give. The activity
stream has the credential's `create` entry, then the `associate` entry of
the attach (or, for a credential deleted again, its `delete` entry). A user who
may create the credential but not attach it (no admin on the template) gets
`403` and keeps the credential, unattached, as with the old application.

A template can have credentials of the kinds `ssh` (Machine), `vault`,
`cloud`, `net` (Network) and `kubernetes`, at most one of each credential
type. Anything else is refused:

* a second credential of a type the template already has: `Cannot assign
  multiple <type name> credentials.`;
* a credential of another kind (Source Control, Container Registry, and so
  on): ``Cannot assign a Credential of kind `<kind>`.``

Vault credentials are the exception to "one of each type", see
[Multiple Vault credentials](#multiple-vault-credentials) below.

A template's detail and list responses link the list under
`related.credentials`, and show it under `summary_fields.credentials`, each
entry with its `id`, `name`, `description`, `kind` and `cloud`.

## Credentials at launch time

When `ask_credential_on_launch` is true, a launch can give the credentials to
run with:

```
POST /api/v2/job_templates/N/launch/ {"credentials": [A, B, C]}
```

A credential in the list replaces the template's credential of the same type
(the same type and vault ID, for vault credentials), and is added when the
template has none of that type. The template's other credentials have to be in
the list too: leaving one out without giving another of its type is refused
(`Removing <type name> credential at launch time without replacement is not
supported. Provided list lacked credential(s): <names>.`). The rules above
apply to the list itself (one per type, the allowed kinds), and the user needs
use on each credential that is not already on the template.

When `ask_credential_on_launch` is false, credentials given at launch that the
template does not have are ignored, and the launch response lists them under
`ignored_fields`.

`GET /api/v2/job_templates/N/launch/` lists the template's credentials under
`defaults.credentials`, each with its `id`, `name`, `credential_type` and
`passwords_needed` (and `vault_id` for vault credentials).

Schedules and workflow job template nodes keep prompted credentials of their
own (`/api/v2/schedules/N/credentials/`,
`/api/v2/workflow_job_template_nodes/N/credentials/`). They take a credential
only when their job template asks for credentials (`Related template is not
configured to accept credentials on launch.`), one per type (`This launch
configuration already provides a <type name> credential.`, also the answer
for one the configuration has already), not one the template already has,
and never one that asks for a password at launch (`Credential that requires
user input on launch cannot be used in saved launch configuration.`), since
nobody is there to type it. A workflow node with no template takes none
(`Cannot assign credential when related template is null.`). Attaching and
detaching record `associate` and `disassociate` entries in the activity
stream, as for a job template, with `object1` `schedule` or
`workflow_job_template_node` and the relationship
`ascender.main.models.schedules.Schedule_credentials` or
`ascender.main.models.workflow.WorkflowJobTemplateNode_credentials`. A
schedule made from a job (`POST /api/v2/jobs/N/create_schedule/`) records an
`associate` entry for each credential, label and instance group it takes from
the job, after its `create` entry.

## Passwords asked at launch

A Machine credential can leave its password, privilege escalation password or
private key passphrase to be given at launch (the value `ASK`), and a Vault
credential its vault password. The launch endpoint lists what it needs under
`passwords_needed_to_start`, and the launch provides them under
`credential_passwords`:

```
GET /api/v2/job_templates/N/launch/
{
    "passwords_needed_to_start": [
        "ssh_password",
        "vault_password.dev",
        "vault_password.prod"
    ],
    ...
}

POST /api/v2/job_templates/N/launch/
{
    "credential_passwords": {
        "ssh_password": "...",
        "vault_password.dev": "first-vault-password",
        "vault_password.prod": "second-vault-password"
    }
}
```

The names are `ssh_password`, `become_password`, `ssh_key_unlock`, and
`vault_password`, or `vault_password.<vault id>` for a vault credential with a
vault ID. A launch that lacks one is refused, with the missing names under
`passwords_needed_to_start`. The same names are accepted at the top level of
the launch body. Relaunching a job asks for the passwords its credentials need
in the same way (`POST /api/v2/jobs/N/relaunch/`).

## Multiple Vault credentials

Ansible can decrypt content encrypted with several vault passwords in one run,
each identified by a vault ID
(https://docs.ansible.com/ansible/latest/vault_guide/vault_managing_passwords.html).
A Vault credential has an optional `vault_id` field, which is what
`--vault-id` is for `ansible-playbook`; it cannot contain `@`.

Vault credentials conflict only when they have the same vault ID, so a
template can have one Vault credential without a vault ID and one for each
vault ID (a second one with the same ID is refused as `Cannot assign multiple
Vault (id=<vault id>) credentials.`). To run a playbook that uses several vault
passwords:

1. Create a Vault credential for each password, with its vault ID and the
   password.
2. Attach them all to the job template:

   ```
   POST /api/v2/job_templates/N/credentials/ {"associate": true, "id": X}
   ```

3. Launch the template: `ansible-playbook` is given one `--vault-id` for each.

A vault ID can come from a secret store (see
[Credential Plugins](credential_plugins.md)). Such a vault ID is looked up
each time credentials are compared, when one is attached to a template,
schedule or workflow node, at launch, and when a workflow node's credentials
are combined with the workflow's, and the looked-up value is what counts, as
if it were stored. A lookup that fails there leaves the credential
conflicting with no other one (the old application answered `500`); the job
that uses it then fails on the same lookup. A vault ID cannot come from a
lookup that logs in as the job (see
[Credential Plugins](credential_plugins.md#logging-in-as-the-job)), since it
is needed before any job runs.

## Inventory source credentials

Inventory sources and the inventory updates they launch have a credentials
list too, `/api/v2/inventory_sources/N/credentials/` (attach and detach) and
`/api/v2/inventory_updates/N/credentials/` (read only), but an inventory
source takes a single credential: attaching a second one, or the one it has
again, is refused with `Source already has credential assigned.`. As in the
old application, attaching and detaching an inventory source's credential
write no activity stream entry. A cloud source needs a credential
of its cloud's type (`Cloud-based inventory sources (such as <source>) require
credentials for the matching cloud service.`). A sourced-from-project
inventory source cannot take a Vault credential, and a custom one cannot take
a Machine, Source Control or Vault credential.
