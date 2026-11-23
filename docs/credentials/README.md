# Credentials

This folder describes credentials: how their secrets are stored, how they can
be looked up in an external secret store instead, how to define credential
types of your own, and how credentials are attached to job templates and
inventory sources.

* [Credential Plugins](credential_plugins.md): looking secrets up in
  HashiCorp Vault, CyberArk, AWS Secrets Manager, Azure Key Vault and other
  secret stores, testing a lookup, and logging in to Vault as the job.
* [GitHub App Installation Access Token Lookup](github_app.md): syncing
  private GitHub repositories with a GitHub App token.
* [Custom Credential Types](custom_credential_types.md): defining a type's
  inputs and injectors, and how the injectors reach the job.
* [Multi-Credential Assignment](multi_credential_assignment.md): which
  credentials a job template can have, credentials and passwords at launch
  time, multiple vault IDs, and inventory source credentials.
* [Extracting Credential Values](extract_credentials.md): how secrets are
  encrypted, why they cannot be read back, and the `SECRET_KEY`.
