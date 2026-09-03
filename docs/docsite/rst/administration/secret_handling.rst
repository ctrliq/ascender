
.. _ag_secret_handling:

Secret handling and connection security 
=======================================


This document describes how Ascender handles secrets and connections in a secure fashion.

Secret Handling
---------------

Ascender manages three sets of secrets:

-  user passwords for local Ascender users

-  secrets for Ascender operational use (database password, message
   bus password, etc.)

-  secrets for automation use (SSH keys, cloud credentials, external
   password vault credentials, etc.)

User passwords for local users
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Ascender hashes local Ascender user passwords with the PBKDF2 algorithm using a SHA256 hash. Users who authenticate via external
account mechanisms (LDAP, SAML, OAuth, and others) do not have any password or secret stored.

Secret handling for operational use
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. index:: 
   single: keys
   pair: secret key; handling
   pair: secret key; regenerate


Ascender contains the following secrets used operationally:

-  ``<deployment>-secret-key``

   -  A secret key used for encrypting automation secrets in the
      database (see below). If the secret key changes or is unknown,
      no encrypted fields in the database will be accessible.

-  The ingress TLS secret

   -  SSL certificate and key for the Ascender web service, supplied
      when the deployment is created.

-  ``<deployment>-postgres-configuration``

   -  Host, database name, and password for connecting to PostgreSQL

These are Kubernetes secrets in the namespace Ascender is deployed to, readable by the Ascender service account so the service can read them at startup. Restrict who can read secrets in that namespace to control access to them.

List them with ``kubectl get secrets -n <namespace>``.

.. note::

    If the secrets system is down, Ascender will be unable to get the information and may fail in a way that would be recoverable once the service is restored. Using some redundancy on that system is highly recommended.


If you believe the secret key has been compromised, replacing it is not a routine operation. Everything already encrypted with it, meaning every stored credential, becomes unreadable the moment it changes. Plan to re-enter those credentials, and keep a copy of the old secret alongside a database backup taken before the change. See :ref:`ag_backup_restore`.


Secret handling for automation use
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Ascender stores a variety of secrets in the database that are
either used for automation or are a result of automation. These secrets
include:

-  all secret fields of all credential types (passwords, secret keys,
   authentication tokens, secret cloud credentials)

-  secret tokens and passwords for external services defined in Ascender settings

-  “password” type survey fields entries

To encrypt secret fields, Ascender uses AES in CBC mode with a 256-bit key
for encryption, PKCS7 padding, and HMAC using SHA256 for authentication.
The encryption/decryption process derives the AES-256 bit encryption key
from the ``SECRET_KEY`` (described above), the field name of the model field
and the database assigned auto-incremented record ID. Thus, if any
attribute used in the key generation process changes, Ascender fails to
correctly decrypt the secret. Ascender is designed such that the
``SECRET_KEY`` is never readable in playbooks Ascender launches, that
these secrets are never readable by Ascender users, and no secret field values
are ever made available via the Ascender REST API. If a secret value is
used in a playbook, we recommend using ``no_log`` on the task so that
it is not accidentally logged.


Connection Security
-------------------

Internal Services
~~~~~~~~~~~~~~~~~

Ascender connects to the following services as part of internal
operation:

-  PostgreSQL database

-  A Valkey key/value store

The connection to valkey is over a local unix socket, restricted to the awx service user.

The connection to the PostgreSQL database is done via password authentication over TCP, either via localhost or remotely (external
database). This connection can use PostgreSQL’s built in support for SSL/TLS, as natively configured by the installer support.
SSL/TLS protocols are configured by the default OpenSSL configuration.

External Access
~~~~~~~~~~~~~~~

Ascender is accessed via standard HTTP/HTTPS on standard ports, provided by nginx. A self-signed cert/key is installed by default; the
customer can provide a locally appropriate certificate and key. SSL/TLS algorithm support is configured in the ``/etc/nginx/nginx.conf`` file. An “intermediate” profile is used by default, and can be configured. Changes must be reapplied on each update.

Managed Nodes
~~~~~~~~~~~~~

Ascender also connects to managed machines and services as part of automation. All connections to managed machines are done via standard
secure mechanism as specified such as SSH, WinRM, SSL/TLS, and so on - each of these inherits configuration from the system configuration for the feature in question (such as the system OpenSSL configuration).
