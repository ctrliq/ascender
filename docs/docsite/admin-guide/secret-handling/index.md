---
title: Secret Handling and Connection Security
description: How Ascender stores and encrypts passwords and secrets, and how it secures connections to internal services, users, and managed nodes.
weight: 20
---

This page describes how Ascender handles secrets and connections in a secure fashion.

## Secret Handling

Ascender manages three sets of secrets:

- user passwords for local Ascender users
- secrets for Ascender operational use (database password, secret key, TLS certificate key, etc.)
- secrets for automation use (SSH keys, cloud credentials, external password vault credentials, etc.)

### User passwords for local users

Ascender hashes local Ascender user passwords with the PBKDF2 algorithm using a SHA256 hash. Users who authenticate via external account mechanisms (LDAP, SAML, OAuth, and others) do not have any password or secret stored.

### Secret handling for operational use

Ascender contains the following secrets used operationally:

- `<deployment>-secret-key`
  - A secret key used for encrypting automation secrets in the database (see below). If the secret key changes or is unknown, no encrypted fields in the database will be accessible.
- The ingress TLS secret
  - SSL certificate and key for the Ascender web service, supplied when the deployment is created.
- `<deployment>-postgres-configuration`
  - Host, database name, and password for connecting to PostgreSQL

These are Kubernetes secrets in the namespace Ascender is deployed to, readable by the Ascender service account so the service can read them at startup. Restrict who can read secrets in that namespace to control access to them.

List them with `kubectl get secrets -n <namespace>`.

<Hint type="note">

If the secrets system is down, Ascender will be unable to get the information and may fail in a way that would be recoverable once the service is restored. Using some redundancy on that system is highly recommended.

</Hint>

If you believe the secret key has been compromised, replacing it is not a routine operation. Everything already encrypted with it, meaning every stored credential, becomes unreadable the moment it changes. Plan to re-enter those credentials, and keep a copy of the old secret alongside a database backup taken before the change. See [Backup](../backup).

### Secret handling for automation use

Ascender stores a variety of secrets in the database that are either used for automation or are a result of automation. These secrets include:

- all secret fields of all credential types (passwords, secret keys, authentication tokens, secret cloud credentials)
- secret tokens and passwords for external services defined in Ascender settings
- "password" type survey fields entries

To encrypt secret fields, Ascender uses AES in CBC mode with a 256-bit key for encryption, PKCS7 padding, and HMAC using SHA256 for authentication. The encryption/decryption process derives the AES-256 bit encryption key from the `SECRET_KEY` (described above), the field name of the model field and, for most values, the database assigned auto-incremented record ID. Credential inputs, notification configurations, settings, and saved launch arguments include the record ID, so each record's values have keys of their own. Survey passwords, OAuth 2 application client secrets, and the workload identity signing key are encrypted without a record ID, so they share one key in an installation. Thus, if any attribute used in the key generation process changes, Ascender fails to correctly decrypt the secret. Ascender is designed such that the `SECRET_KEY` is never readable in playbooks Ascender launches, that these secrets are never readable by Ascender users, and no secret field values are ever made available via the Ascender REST API. If a secret value is used in a playbook, we recommend using `no_log` on the task so that it is not accidentally logged.

## Connection Security

### Internal Services

Ascender connects to a PostgreSQL database as part of internal operation; it uses no other internal service.

The connection to the PostgreSQL database is done via password authentication over TCP, either to the database deployed with Ascender or remotely (external database). Whether the connection uses SSL/TLS is set by PostgreSQL's `sslmode`: the `sslmode` key of the `<deployment>-postgres-configuration` secret on a deployment made by the Ascender Operator, or the `ASCENDER_DB_SSLMODE` environment variable. The default, `prefer`, uses SSL/TLS when the server offers it, but falls back to an unencrypted connection and does not verify the server's certificate. For an external database, use `verify-full`.

### External Access

Ascender is accessed via standard HTTP/HTTPS on standard ports. The Ascender web service serves HTTP itself, and HTTPS is normally terminated in front of it by the ingress, OpenShift route, or load balancer, with the certificate and key of the ingress TLS secret described above. SSL/TLS algorithm support is then configured in that ingress controller or load balancer.

Behind an OpenShift route with `passthrough` TLS termination, the web service serves HTTPS itself, with the certificate and key given by the `ASCENDER_TLS_CERT_FILE` and `ASCENDER_TLS_KEY_FILE` environment variables. It accepts TLS 1.2 and later, and reads the files again when they change, so a renewed certificate needs no restart.

### Managed Nodes

Ascender also connects to managed machines and services as part of automation. All connections to managed machines are done via standard secure mechanism as specified such as SSH, WinRM, SSL/TLS, and so on - each of these inherits configuration from the system configuration for the feature in question (such as the system OpenSSL configuration).
