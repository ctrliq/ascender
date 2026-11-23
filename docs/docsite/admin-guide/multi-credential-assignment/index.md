---
title: Multi-Credential Assignment
description: Assign zero or more credentials, including multiple Vault credentials, to Ascender job templates through the API and UI.
weight: 42
---

Ascender provides support for assigning zero or more credentials to a job template.

## Important Changes

Job templates now have a single interface for credential assignment. From the API endpoint:

`GET /api/v2/job_templates/N/credentials/`

You can associate and disassociate credentials using `POST` requests, similar to the behavior in the deprecated `extra_credentials` endpoint:

```text
POST /api/v2/job_templates/N/credentials/ {'associate': true, 'id': 'X'}
POST /api/v2/job_templates/N/credentials/ {'disassociate': true, 'id': 'Y'}
```

Under this model, a job template is considered valid even when there are *no* credentials assigned to it. This model also provides users the ability to assign multiple Vault credentials to a job template.

## Launch Time Considerations

Job templates have a configurable attribute, `ask_credential_on_launch`. When set to `True`, it signifies that if desired, you may specify a list of credentials at launch time to override those defined on the job template. For example:

```text
POST /api/v2/job_templates/N/launch/ {'credentials': [A, B, C]}
```

If `ask_credential_on_launch` is `False`, it signifies that custom credentials provided in the `POST /api/v2/job_templates/N/launch/` will be ignored.

Under this model, the only purpose for `ask_credential_on_launch` is to signal API clients to prompt the user for (optional) changes at launch time.

## Multi-Vault Credentials

As it is possible to assign multiple credentials to a job, you can specify multiple Vault credentials to decrypt when your job template runs. This functionality mirrors the support for [multiple vault passwords for a playbook run](http://docs.ansible.com/ansible/latest/vault.html#vault-ids-and-multiple-vault-passwords) in Ansible 2.4 and later.

Vault credentials now have an optional field, `vault_id`, which is analogous to the `--vault-id` argument to `ansible-playbook`. To run a playbook which makes use of multiple vault passwords:

1. Create a Vault credential in Ascender for each vault password; specify the Vault ID as a field on the credential and input the password (which will be encrypted and stored).
2. Assign multiple vault credentials to the job template via the new credentials endpoint:

   ```text
   POST /api/v2/job_templates/N/credentials/

   {
       'associate': true,
       'id': X
   }
   ```

Alternatively, you can perform the same assignment in the Ascender user interface in the *Create Credential* page:

![Create Credential page for a Vault credential with the Vault Identifier set to first](/assets/images/credentials-create-multivault-credential.webp)

In the above example, the credential created specifies the secret to be used by its Vault Identifier ("first") and password pair. When this credential is used in a Job Template, as in the example below, it will only decrypt the secret associated with the "first" Vault ID:

![Create New Job Template form with a multi-vault Vault credential selected in the Credentials field](/assets/images/job-template-include-multi-vault-credential.webp)

If you have a playbook that is set up the traditional way with all the secrets in one big file without distinction, then leave the **Vault Identifier** field blank when setting up the Vault credential.

### Prompted Vault Credentials

For Vault credentials that are marked with "Prompt on launch", the launch endpoint of any related Job Templates will communicate necessary Vault passwords via the `passwords_needed_to_start` key:

```text
GET /api/v2/job_templates/N/launch/
{
    'passwords_needed_to_start': [
        'vault_password.X',
        'vault_password.Y',
    ]
}
```

`X` and `Y` in the above example are the Vault Identifiers of the associated Vault credentials. A Vault credential without a Vault Identifier is listed as `vault_password`.

```text
POST /api/v2/job_templates/N/launch/
{
    'credential_passwords': {
        'vault_password.X': 'first-vault-password'
        'vault_password.Y': 'second-vault-password'
    }
}
```

### Linked credentials

Instead of uploading sensitive credential information into Ascender, you can link credential fields to external systems and use them to run your playbooks. Refer to the [Secret Management System](/user-guide/secret-management) section of the [Ascender user guides](/user-guide).
