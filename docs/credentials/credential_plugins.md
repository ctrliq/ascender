# Credential Plugins

By default, the secret values of a credential (SSH passwords and private keys,
API tokens for cloud services, and so on) are stored in Ascender's database,
encrypted with AES-256 in CBC mode and authenticated with an HMAC-SHA256 (see
[Extracting Credential Values](extract_credentials.md)).

Instead of storing a secret, a credential can have it looked up in a
third-party secret management system, such as HashiCorp Vault or Microsoft
Azure Key Vault. A looked-up value is never stored: it is fetched every time
something that uses the credential starts, generally a job, a project update
or an inventory update, just before the playbook or the inventory plugin runs.

The lookups are in `src/internal/credplugins` (one file per secret store, and
the list of plugins in `plugins.go`). Resolving a credential's looked-up fields
and the test endpoints are in `src/internal/api/credentials_external.go`, and
the input sources that link a field to a lookup in
`src/internal/api/credential_input_sources.go`. The lookup credential types
themselves, with their inputs and metadata fields, are among the managed
types in `src/internal/models/managed_credential_types.json`.

## Supported plugins

Each plugin is a managed credential type of the `external` kind. A credential
of that type holds what is needed to reach and log in to the secret store; the
*metadata*, given where a field is linked to it, says which secret to fetch.

| Credential type | Namespace | Metadata |
|---|---|---|
| HashiCorp Vault Secret Lookup | `hashivault_kv` | `secret_backend`, `secret_path`, `auth_path`, `secret_key`, `secret_version` |
| HashiCorp Vault Secret Lookup (OIDC) | `hashivault_kv_oidc` | the same |
| HashiCorp Vault Signed SSH | `hashivault_ssh` | `public_key`, `secret_path`, `auth_path`, `role`, `valid_principals` |
| HashiCorp Vault Signed SSH (OIDC) | `hashivault_ssh_oidc` | the same |
| CyberArk Central Credential Provider Lookup | `aim` | `object_query`, `object_query_format` (`Exact` or `Regexp`), `object_property`, `reason` |
| CyberArk Conjur Secrets Manager Lookup | `conjur` | `secret_path`, `secret_version` |
| Centrify Vault Credential Provider Lookup | `centrify_vault_kv` | `account-name`, `system-name` |
| Thycotic DevOps Secrets Vault | `thycotic_dsv` | `path`, `secret_field`, `secret_decoding` (`No Decoding` or `Decode Base64`) |
| Thycotic Secret Server | `thycotic_tss` | `secret_id`, `secret_field` |
| AWS Secrets Manager lookup | `aws_secretsmanager_credential` | `region_name`, `secret_name` |
| Microsoft Azure Key Vault | `azure_kv` | `secret_field`, `secret_version` |
| GitHub App Installation Access Token Lookup | `github_app_lookup` | `description` (see [github_app.md](github_app.md)) |

`GET /api/v2/credential_types/<id>/` shows a type's input fields under
`inputs.fields`, its metadata fields under `inputs.metadata`, and which of
both are required under `inputs.required`.

The list is fixed. Ascender does not load plugins from anywhere else, and a
custom credential type cannot be an external one (custom types are `cloud`
or `net`, see [Custom Credential Types](custom_credential_types.md)).

## Linking a field to a secret store

Pulling a secret from a secret store generally takes three steps. To give a
Machine credential with the static username `example-user` a password kept in
HashiCorp Vault's key/value store:

1. Create the Machine credential with the username `example-user`.
2. Create a second credential, of the HashiCorp Vault Secret Lookup type, that
   *authenticates* with Vault: in this example, its URL and a Vault token.
3. *Link* the Machine credential's `password` field to the Vault credential,
   with metadata saying where the secret is (for example the path
   `/kv/example` and the key `password`).

A link is a *credential input source*:
`POST /api/v2/credentials/<target id>/input_sources/` (or
`POST /api/v2/credential_input_sources/` with `target_credential`), with the
`source_credential`, the `input_field_name` and the `metadata`. Creating one
takes admin on the target credential and use on the source credential. A link
is refused when:

* the source is not of an external type (`Source must be an external
  credential`);
* the source and the target are the same credential (`Target and source
  credentials must be different`);
* the field is not one of the target type's fields (`Input field must be
  defined on target credential (options are ...).`);
* the field is already linked: each field has at most one input source;
* the metadata does not match the source type's metadata fields: a field of
  the wrong type, a value that is not among its choices, a required field left
  empty (`required for <type name>`), or a key the type does not declare;
* the link would close a loop (`This would create a circular dependency
  between credentials`).

Any field of any credential can be linked, including the fields of custom
credential types: an AWS credential could take its access key and secret key
from a secret store just as well.

Through the API, the three steps of the example above are (with an OAuth2
token in `$TOKEN`, and the ids the answers give):

```shell
# The ids of the Machine and HashiCorp Vault Secret Lookup types
curl -s -H "Authorization: Bearer $TOKEN" \
    "https://ascender.example.com/api/v2/credential_types/?namespace=ssh"
curl -s -H "Authorization: Bearer $TOKEN" \
    "https://ascender.example.com/api/v2/credential_types/?namespace=hashivault_kv"

# 1. The Machine credential, with only the username
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -X POST "https://ascender.example.com/api/v2/credentials/" \
    -d '{"name": "Example Machine", "organization": 1, "credential_type": <machine type id>,
         "inputs": {"username": "example-user"}}'

# 2. The Vault credential
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -X POST "https://ascender.example.com/api/v2/credentials/" \
    -d '{"name": "Example Vault", "organization": 1, "credential_type": <vault lookup type id>,
         "inputs": {"url": "https://vault.example.com", "token": "<vault token>", "api_version": "v2"}}'

# 3. The link: the Machine credential's password comes from the Vault credential
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -X POST "https://ascender.example.com/api/v2/credentials/<machine credential id>/input_sources/" \
    -d '{"source_credential": <vault credential id>, "input_field_name": "password",
         "metadata": {"secret_path": "/kv/example", "secret_key": "password"}}'
```

To have Vault sign an SSH key instead, create a HashiCorp Vault Signed SSH
credential the same way (its inputs are the URL and how to log in) and link
the Machine credential's `ssh_public_key_data` field to it, with the public key
to sign and the role in the metadata:

```shell
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -X POST "https://ascender.example.com/api/v2/credentials/<machine credential id>/input_sources/" \
    -d '{"source_credential": <signed ssh credential id>, "input_field_name": "ssh_public_key_data",
         "metadata": {"public_key": "ssh-ed25519 AAAA... example", "secret_path": "ssh", "role": "example-role"}}'
```

The Machine credential holds the private key that goes with the public key.
When a job uses it, Vault signs the key and the job loads both (see
[HashiCorp Vault](#hashicorp-vault) below).

An external credential's own fields can be linked too, for instance to keep
the Vault token of a HashiCorp Vault credential in Azure Key Vault. The lookup
then runs first, and its value fills the field when the external credential
stores no value of its own for it.

## When lookups run

Each time a credential with linked fields is used, all of its linked fields
are looked up, when the credential is loaded for the job: a lookup that fails
fails the job, even for a field the job would not have used. The job's
traceback names the field and the credential it belongs to (the one the job
uses, not the lookup credential), followed by the error, for example:

```
Traceback (most recent call last):
  Looking up password of credential Example Machine
RuntimeError: password is not present at /kv/example
```

The old application left Python's full traceback there; its last line, the
error, is the same, and the line above it stands in for the frames.

A Vault credential's `vault_id` that comes from a lookup is also looked up
whenever credentials are compared by type and vault ID: attaching a
credential to a job template, launching with credentials, saving credentials
on a schedule or workflow node, and combining a workflow node's credentials
with the workflow's (see
[Multi-Credential Assignment](multi_credential_assignment.md#multiple-vault-credentials)).
Listing or showing credentials runs no lookup.

Lookups run with the **Extra Environment Variables** setting
(`ASCENDER_TASK_ENV`, **Settings > Jobs**) laid over the process environment.
That is where a lookup takes its proxy (`HTTPS_PROXY`, `HTTP_PROXY`,
`ALL_PROXY`, `NO_PROXY`) and, for a plugin with no CA certificate of its own,
its CA bundle (`REQUESTS_CA_BUNDLE` or `CURL_CA_BUNDLE`, which replace the
system's trusted roots).

A lookup never connects to a link-local address (`169.254.0.0/16`, where the
cloud providers serve instance metadata and credentials) or to one of the
other cloud metadata addresses (`fd00:ec2::254`, `100.100.100.200`,
`192.0.0.192`, `168.63.129.16`). The check is made on the address actually
dialed, so a name that resolves there is refused too; through a proxy, the
host the request is for is checked before it is sent (`src/internal/netguard`). The one exception is
the AWS plugin looking for the controller's own AWS identity (see below).
A lookup reads at most 16 MB of a server's answer.

## Testing a lookup

Two endpoints try a lookup without saving anything:

* `POST /api/v2/credentials/<id>/test/` tries a saved external credential.
  The body holds `metadata` (what to look up) and optionally `inputs`, the
  changes to try: the inputs that are not sent, or sent as `$encrypted$`, are
  the stored ones. Testing takes use of the credential; changing an input for
  the test takes admin, as changing the credential itself does (`You do not
  have permission to test this credential with changed inputs.`). Only the
  type's declared metadata fields are accepted in `metadata`, so the metadata
  can never stand in for an input such as the URL. The one other key taken is
  `job_template_id`, the template a test of a credential that logs in as the
  job signs its token for (see [Logging in as the job](#logging-in-as-the-job)).
  It never reaches the lookup, and for any other type it is ignored.
* `POST /api/v2/credential_types/<id>/test/` tries a credential that has not
  been saved yet, with every input in `inputs` and the metadata in `metadata`.
  Only superusers can use it. This test runs without the Extra Environment
  Variables.

A lookup that works answers `202 Accepted`. One that fails answers
`400 Bad Request` with `{"inputs": "<message>"}`, where the message is
`HTTP <status>` when the secret store answered with an error, and otherwise
the name of the error, such as `ConnectionError`, `SSLError` or `KeyError` (or
the connect timeout, `Connection to <host> timed out. (connect timeout=<seconds>)`).
The body of the server's answer is never shown, since the URL is whatever the
credential names. The full error message is in the traceback of a job that
uses the credential.

> **Note:** a credential test refuses metadata keys the credential type does
> not declare, other than `job_template_id`
> (`Additional properties are not allowed ('<key>' was unexpected)`). The old
> application merged any key into the lookup's arguments, which let a user who
> could only use a credential replace its URL through the metadata and have
> its secret sent elsewhere.

## Logging in as the job

The two OIDC variants of the HashiCorp Vault types store no secret to log in
with. For each lookup, Ascender signs a workload identity token for the job,
with the credential's `url` as the audience, logs in with it to Vault's JWT
authentication method (mounted at the metadata's `auth_path`, or
the credential's `default_auth_path`, `jwt` when empty) as the credential's
`jwt_role`, uses the Vault token it gets back for the lookup, and revokes that
token when the lookup is done (`withWorkloadIdentityLogin` in
`src/internal/credplugins/hashivault.go`). The Vault role decides, from the
claims in the job's token (its template, organization, project, inventory and
so on), which jobs may log in and with which policies. How the token is issued
and verified is described on the Workload Identity page of the administration
guide (`docs/docsite/admin-guide/workload-identity/index.md`).

These types declare an internal field, `workload_identity_token`, that the
token is handed over in. The API does not show it among the type's fields and
refuses a value for it. A token can only be issued for a running job: outside
one the lookup fails with `A workload identity token can only be issued for a
running job.` For the same reason a Vault credential's `vault_id` cannot come
from a lookup that logs in as the job (`A vault id cannot be looked up as the
job: it is needed before any job runs.`).

When Vault refuses the login, the error keeps Vault's reasons: `Vault turned
down the workload identity login with role <role>: HTTP <status>, <errors>`.
A test of such a credential shows that message rather than only the status.

A test has no running job, so it signs the token for a job template the user
picks, given as `job_template_id` in the test's `metadata`, with either test
endpoint. The user must be able to launch that template (`You cannot launch
job template <id>.`), and without one the test answers `Pick the job template
to test this credential as.`. The answer carries the claims the token was
signed with, under `details.sent_jwt_payload`, to compare with what the Vault
role expects.

## Notes on the plugins

### HashiCorp Vault

A HashiCorp Vault credential logs in with the first of these that is set: a
`token`; a `username` and `password` (posted to
`<url>/v1/auth/<auth path>/login/<username>`, so set the auth path to where
the userpass or LDAP method is mounted); an AppRole `role_id` and `secret_id`;
a `kubernetes_role`, with the service account token mounted where Ascender
runs (`/var/run/secrets/kubernetes.io/serviceaccount/token`); or a TLS
client certificate and key, with `client_cert_role`. Otherwise the lookup
fails with `Token, Username/Password, AppRole, Kubernetes, or TLS
authentication parameters must be set`. The auth path is the metadata's
`auth_path`, or the credential's `default_auth_path` (`approle` by default).
`namespace` is sent as `X-Vault-Namespace` for Vault Enterprise. A request
that an Enterprise performance standby answers with `412` is retried, up to
five times.

The key/value lookup reads `<secret_backend>/<secret_path>` (with
`api_version` `v2`, `<secret_backend>/data/<secret_path>`, and the
`secret_version` if one is given). Without a `secret_backend`, the first
segment of the path is the mount. The value is the secret's `secret_key`; a
key the secret does not have fails with `<key> is not present at <path>`.

The SSH lookup signs `public_key` with the `role` of the SSH secrets engine
mounted at `secret_path`, optionally for `valid_principals`, and returns the
signed certificate. Link it to the **Signed SSH Certificate** field
(`ssh_public_key_data`) of a Machine credential that holds the matching
private key: the job writes the certificate next to the key, and `ssh-add`
loads both into the job's SSH agent.

### AWS Secrets Manager

The lookup returns the secret's `SecretString`, or its decoded `SecretBinary`.
With the access key and secret key left empty, it would use the AWS identity
of the Ascender controller itself, which is only allowed when **Allow AWS
Secrets Manager Lookups Without Keys**
(`AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS`, **Settings > System**) is on;
otherwise the lookup fails without contacting AWS. Read the setting's help
text before turning it on: every user who can create a credential gets that
identity's Secrets Manager permissions. The identity is looked for in the
`AWS_*` environment variables, a web identity token (IRSA on EKS), the shared
credentials and config files (static keys only: SSO, `credential_process` and
assume-role profiles are not supported), the container credentials endpoint,
and the EC2 instance metadata service (IMDSv2).

### Microsoft Azure Key Vault

The credential logs in as a Microsoft Entra application (`client`, `secret`
and `tenant`) in the cloud chosen by `cloud_name`, and reads the secret named
by `secret_field`, at `secret_version` or the current version. The vault URL
must be `https`.

### CyberArk

The Central Credential Provider lookup queries
`<url>/<webservice_id>/api/Accounts` (`AIMWebService` when no web service ID
is given) with the application ID and the object query, optionally with a
client certificate and key, and returns the account's `Content` (the
password), or the `UserName` or `Address` when `object_property` asks for
`username` or `address`. With `verify` off, the server's certificate is not
checked.
