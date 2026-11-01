.. _ag_workload_identity:

Workload Identity
=================

.. index::
   single: workload identity
   pair: OIDC; workload identity
   pair: HashiCorp Vault; workload identity
   pair: WORKLOAD_IDENTITY_ENABLED; workload identity

With workload identity, Ascender acts as an OpenID Connect issuer for its own jobs. Every job that needs it gets a short lived JSON Web Token, signed by Ascender, that says which job it is: its organization, job template, project, inventory, who launched it and so on. A system that trusts Ascender as an issuer, such as the JWT auth method of HashiCorp Vault or the workload identity federation of a cloud provider, checks the signature and the claims and lets the job in. Nothing is stored in Ascender to do it: no Vault token, no AppRole secret, no cloud access key.

There are three credential types that use it:

* **HashiCorp Vault Secret Lookup (OIDC)** reads a secret from Vault, logging in as the job. See :ref:`ug_credentials_hashivault_oidc`.
* **HashiCorp Vault Signed SSH (OIDC)** has Vault sign an SSH key, logging in as the job. See :ref:`ug_credentials_hashivaultssh_oidc`.
* **OIDC Workload Identity Token** hands the token to the playbook, so it can trade it with any system that accepts it. See :ref:`ug_credentials_oidc_workload_identity`.

The two Vault lookups are new types. The older **HashiCorp Vault Secret Lookup** and **HashiCorp Vault Signed SSH** keep working exactly as they did.

The claim names follow those of Ansible Automation Platform 2.7, with the ``aap_controller_`` prefix replaced by ``ascender_``, so a Vault role written for one is easy to carry over.


.. _ag_workload_identity_enable:

Turning it on
-------------

Workload identity is off by default. To turn it on:

1. Go to **Settings**, **Miscellaneous System settings**.
2. Make sure **Base URL of the service** is the address Ascender is reached at, for example ``https://ascender.example.com``. It becomes part of the issuer, so it has to be the address the external system can reach.
3. Enable **Enable Workload Identity**.

The issuer is the base URL followed by ``/api/o``, for example ``https://ascender.example.com/api/o``. Ascender publishes two documents under it, both without authentication:

* ``https://ascender.example.com/api/o/.well-known/openid-configuration``, the OpenID discovery document.
* ``https://ascender.example.com/api/o/.well-known/jwks.json``, the public keys that verify a token.

While the feature is off, or the base URL is not set, both answer ``404``, and a job that uses one of the credential types above ends in error with an explanation.

The form of a workload identity credential shows the issuer as the server sees it, ready to copy.

**Workload Identity Token Lifetime** (``WORKLOAD_IDENTITY_DEFAULT_TTL``, 300 seconds by default) is how long the token of a Vault lookup lasts: the lookup uses it straight away, while the job is being prepared. The token handed to a playbook by **OIDC Workload Identity Token** lasts as long as the timeout of the job instead, since the playbook may need it near the end, and falls back to this setting when the job has no timeout. No token lasts more than a day, and a minute is always added to allow for clock drift.


.. _ag_workload_identity_vault:

Setting up HashiCorp Vault
--------------------------

Vault needs the JWT auth method pointed at the issuer, a role that says which jobs may log in and with which policies, and the policies themselves. This is done once.

Enable the auth method and point it at Ascender:

.. code-block:: bash

    vault auth enable jwt
    vault write auth/jwt/config \
        oidc_discovery_url="https://ascender.example.com/api/o" \
        bound_issuer="https://ascender.example.com/api/o"

Vault has to be able to reach the discovery URL. If Ascender uses a certificate from a private CA, add ``oidc_discovery_ca_pem=@ca.pem``. If Vault cannot reach Ascender at all, give it the keys instead of the URL, with ``jwt_validation_pubkeys`` and the keys from ``jwks.json`` in PEM form; keep in mind they then have to be updated by hand when the key is rotated. ``jwks.json`` is empty until the first token is signed, and ``ascender-manage rotate_workload_identity_key`` makes the first key ahead of that.

Then a role. This one lets in the jobs of the ``infra`` organization, with the ``infra-linux`` policy, for five minutes:

.. code-block:: bash

    vault write auth/jwt/role/ascender-infra - <<EOF
    {
      "role_type": "jwt",
      "user_claim": "sub",
      "bound_audiences": ["https://vault.example.com:8200"],
      "bound_claims_type": "glob",
      "bound_claims": {
        "sub": "workload_type:ascender_automation_job:organization:infra:job_template:*"
      },
      "token_policies": ["infra-linux"],
      "token_type": "batch",
      "token_ttl": "5m"
    }
    EOF

``bound_audiences`` has to be exactly the **Server URL** of the Ascender credential, port included: the lookups use it as the audience of the token. Any claim can be bound, not only ``sub``; for example ``"ascender_job_template_name": "patch-linux"`` lets in the jobs of that one template.

With ``claim_mappings`` a policy can use the claims of the job that logged in, so one policy covers every organization and template:

.. code-block:: bash

    vault write auth/jwt/role/ascender-infra ... \
        claim_mappings="ascender_organization_name=org,ascender_job_template_name=job_template"

.. code-block:: hcl

    path "secret/data/ascender/{{identity.entity.aliases.<jwt accessor>.metadata.org}}/*" {
      capabilities = ["read"]
    }

The accessor of the auth method is in ``vault auth list``.

Vault only maps claims whose value is a string, so map the ``*_name`` claims. The ``*_id`` claims are numbers, as in AAP, and a role that maps one turns every login down with ``error converting claim to string``. They can still be used in ``bound_claims``.

When Vault turns a job down, the job ends in error and its traceback ends with the reason Vault gave, for example ``claim "sub" does not match any associated bound claim values``.

The lookups revoke the Vault token they were given as soon as they have the secret. A batch token cannot be revoked and simply runs out, which is fine.


Claims
------

Every token carries the registered claims ``iss``, ``sub``, ``aud``, ``iat``, ``nbf``, ``exp`` and ``jti``, and the claims below for whatever the job has. A claim with no value is left out. They are read from the database when the job starts; nothing the user or the playbook supplies can change them.

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Claim
     - Value
   * - ``ascender_unified_job_type``
     - What kind of job: ``job``, ``project_update``, ``inventory_update``, ``ad_hoc_command`` or ``workflow_job``.
   * - ``ascender_job_id``, ``ascender_job_name``
     - The job.
   * - ``ascender_job_type``
     - ``run`` or ``check``.
   * - ``ascender_launch_type``
     - How it was launched: ``manual``, ``relaunch``, ``scheduled``, ``workflow``, ``webhook``, ``callback``, ``dependency``...
   * - ``ascender_launched_by_name``, ``ascender_launched_by_id``, ``ascender_launched_by_type``
     - Who or what launched it, and what kind of thing that is: ``user``, ``schedule``, ``workflow_job``... The id alone is ambiguous, so bind the type along with it.
   * - ``ascender_organization_name``, ``ascender_organization_id``
     - Its organization. An ad hoc command has none of its own and gets its inventory's.
   * - ``ascender_job_template_name``, ``ascender_job_template_id``
     - Its job template.
   * - ``ascender_unified_job_template_name``, ``ascender_unified_job_template_id``
     - The template it came from, of whatever kind.
   * - ``ascender_project_name``, ``ascender_project_id``
     - Its project.
   * - ``ascender_playbook_name``
     - Its playbook.
   * - ``ascender_inventory_name``, ``ascender_inventory_id``
     - Its inventory.
   * - ``ascender_execution_environment_name``, ``ascender_execution_environment_id``
     - Its execution environment.
   * - ``ascender_instance_group_name``, ``ascender_instance_group_id``
     - The instance group it runs on.

The subject is built from the organization and the job template, always with the same shape, so a glob in a Vault role matches it the same way every time:

.. code-block:: text

    workload_type:ascender_automation_job:organization:<organization name>:job_template:<job template name>

The separator can't appear inside a name: in the subject, every ``%`` in a name is written as ``%25`` and every ``:`` as ``%3A``, so a template called ``db:patch`` shows up as ``db%3Apatch``. Without that, the admin of an organization could rename it to ``infra:job_template:x`` and match a role bound to the ``infra`` organization. The ``*_name`` claims keep the name as it is.

Project syncs, inventory syncs and ad hoc commands get tokens too, when one of their credentials is looked up as the job, and their subject ends in an empty ``job_template:``. A role bound to ``job_template:`` alone lets all of them in, so bind ``ascender_unified_job_type`` as well when the role is meant for one kind only. Otherwise a project admin could point the SCM credential of a project at that lookup, with an SCM URL on a server they control, and receive the secret as the git password.


Testing a credential
--------------------

The **Test** button of a Vault OIDC credential, and the one in the metadata step of the key icon, ask for a job template. The test logs in to Vault with a token carrying the claims a manual launch of that template by you would have, so a role bound to the template can be tried out without launching it. Only templates the user can launch can be picked. The result shows the claims that were sent, which makes it easy to see why a role turned the token down. A real job carries a few more claims the test cannot know (its id, its instance group, how it was launched), so a role bound to those can pass the test and still turn a job down, or the other way round.


Signing keys
------------

Ascender makes an RSA key the first time it signs a token and keeps it in the database, encrypted with the secret key, like any other secret. ``ascender-manage regenerate_secret_key`` re-encrypts it along with the rest.

To rotate it:

.. code-block:: bash

    ascender-manage rotate_workload_identity_key

The new key signs from then on. The previous one stays published, so the tokens it signed keep validating until they run out; the ones before it are dropped. Running the command twice, a token lifetime apart, retires a key completely. ``--keep 0`` drops every old key at once, which invalidates every token already issued.


Security notes
--------------

* A token says which job it is; what the job may do is decided by the external system. Bind the Vault roles as tightly as the job needs, by organization, template or project.
* The lookups use the Vault address as the audience, and the token never reaches the playbook. With **OIDC Workload Identity Token**, on the other hand, the playbook holds the token and can send it anywhere. A role bound to such a template trusts the content of its project, so only bind it to templates whose project you trust.
* Tokens are signed by Ascender itself, for a job: the one running, or the one whose status is posted back to a webhook. There is no API that issues a token for arbitrary claims. The credential test signs for a template the user can launch, with the audience the user gives, and sends the token only to that address.
* Anyone who can launch a template can get a token with its claims and an audience of their choosing, through the credential test or an **OIDC Workload Identity Token** credential of their own. Always bind the audience in the relying party (``bound_audiences`` in Vault); a token meant for one system is then useless against another.
* The audience is compared as an exact string: ``https://vault.example.com:8200`` and ``https://vault.example.com:8200/`` are different audiences.
* The token handed to a playbook is in a file, and only its path is in the environment: the environment of a play against ``localhost`` ends up in ``ansible_env``, which is stored with the facts of the job.


Limitations
-----------

* A token can only be signed for a job. Credentials read when no job is running cannot be looked up as the job: the credential of a container group, which the pod reaper also uses on its own schedule, and the vault id of a vault credential, which tells a template's vault credentials apart before any job runs. Ascender refuses a vault id looked up that way; a container group credential that is cannot be used by the reaper, which logs the failure and leaves orphaned pods behind.
* **OIDC Workload Identity Token** is a cloud credential, and a job takes one credential of each cloud type, so a job gets a token for one audience.
* When an SSH key is looked up as the job, whether it is encrypted is only known once a job runs, so **Prompt on launch** for its passphrase cannot ask for it.


Coming from Ansible Automation Platform
---------------------------------------

The model is the same as AAP 2.7. What changes in Vault:

* The issuer is ``<base URL>/api/o`` rather than ``<gateway URL>/o``.
* Claims start with ``ascender_`` rather than ``aap_controller_``.
* The subject starts with ``workload_type:ascender_automation_job:`` rather than ``workload_type:aap_controller_automation_job:``.
