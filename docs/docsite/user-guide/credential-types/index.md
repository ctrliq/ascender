---
title: Custom Credential Types
description: Define custom Ascender credential types with input and injector configurations that pass secrets to jobs as environment variables, extra variables, or files.
weight: 21
---

As an administrator with superuser access, you can define a custom credential type in a standard format using a YAML/JSON-like definition, allowing the assignment of new credential types to jobs and inventory updates. This allows you to define a custom credential type that works in ways similar to existing credential types. For example, you could create a custom credential type that injects an API token for a third-party web service into an environment variable, which your playbook or custom inventory script could consume.

Custom credentials support the following ways of injecting their authentication information:

- Environment variables
- Ansible extra variables
- File-based templating (i.e., generating `.ini` or `.conf` files that contain credential values)

You can attach one SSH and multiple cloud credentials to a Job Template. Each cloud credential must be of a different type. In other words, only one AWS credential, one GCE credential, etc., are allowed. Vault credentials and machine credentials are separate entities.

<Hint type="note">

When creating a new credential type, you are responsible for avoiding collisions in the `extra_vars`, `env`, and file namespaces. Also, avoid environment variable or extra variable names that start with `ANSIBLE_` because they are reserved. You must have Superuser permissions to create, edit or delete a credential type (`CredentialType`). Any user who can see a credential type can read its `injectors` field.

</Hint>

## Content sourcing from collections

A "managed" credential type of `kind=galaxy` represents a content source for fetching collections defined in `requirements.yml` when project updates are run (e.g., galaxy.ansible.com or a private automation hub). This type represents a URL and (optional) authentication details necessary to construct the environment variables when a project update runs `ansible-galaxy collection install` as described in the Ansible documentation, [Configuring the ansible-galaxy client](https://docs.ansible.com/ansible/latest/user_guide/collections_using.html#configuring-the-ansible-galaxy-client). It has fields which map directly to the configuration options exposed to the Ansible Galaxy CLI, e.g., per-server. An endpoint in the API reflects an ordered list of these credentials at the Organization level:

```text
/api/v2/organizations/N/galaxy_credentials/
```

Installations of Ascender migrate existing Galaxy-oriented setting values in such a way that post-upgrade, proper credentials are created and attached to every Organization. After upgrading to the latest version, every organization that existed prior to upgrade now has a list of (one or more) "Galaxy" credentials associated with it.

Additionally, post-upgrade, these settings are not visible (or editable) from the `/api/v2/settings/jobs/` endpoint.

Ascender should still continue to fetch roles directly from public Galaxy even if galaxy.ansible.com is not the first credential in the list for the Organization. The global "Galaxy" settings are no longer configured at the jobs level, but at the Organization level in the User Interface. The Organization's Add and Edit windows have an optional **Galaxy Credentials** lookup field for credentials of `kind=galaxy`.

![Create a new Organization with Galaxy Credentials](/assets/images/organizations-galaxy-credentials.webp)

It is very important to specify the order of these credentials as order sets precedence for the sync and lookup of the content. For more information, see [Creating a New Organization](../organizations#creating-a-new-organization). For detail on how to set up a project using collections, see [Collections Support](../projects#collections-support).

## Backwards-Compatible API Considerations

Support for version 2 of the API (`api/v2/`) means a one-to-many relationship for Job Templates to credentials (including multi-cloud support). Credentials can be filtered using the v2 API:

```bash
curl "https://ascender.example.org/api/v2/credentials/?credential_type__namespace=aws"
```

In the V2 CredentialType model, the relationships are defined as follows:

| Credential kind | Relationship |
| --- | --- |
| Machine | SSH |
| Vault | Vault |
| Network | Sets environment variables (e.g., `ANSIBLE_NET_AUTHORIZE`) |
| SCM | Source Control |
| Cloud | EC2, AWS, and lots of others |
| Galaxy | galaxy.ansible.com, on-premise private automation hub |

## Content verification

Ascender uses GNU Privacy Guard (GPG) to verify content. For more information, refer to [The GNU Privacy Handbook](https://www.gnupg.org/gph/en/manual/c14.html).

## Getting Started with Credential Types

Access the Credential Types by clicking **Credential Types** from the left navigation bar. If no custom credential types have been created, the Credential Types view will not have any to display and will prompt you to add one:

![Credential Types view without any credential types populated](/assets/images/credential-types-home-empty.webp)

If credential types have been created, this page displays a list of all existing and available Credential Types.

![Credential Types list view with example credential types](/assets/images/credential-types-home-with-example-types.webp)

To view more information about a credential type, click on its name or the **Edit** (pencil) icon from the **Actions** column.

Each credential type displays its own unique configurations in the **Input Configuration** field and the **Injector Configuration** field, if applicable. Both YAML and JSON formats are supported in the configuration fields.

## Create a New Credential Type

<Hint type="note">

When creating a new credential type, do not use `ascender` or `tower` as an input field ID: they are reserved names. In the injector configuration, environment variable names may not start with `ANSIBLE_`, and a few variables that Ascender sets itself, such as `PATH`, `JOB_ID` and `INVENTORY_ID`, are not allowed either.

</Hint>

To create a new credential type:

1. Click the **Add** button in the **Credential Types** screen.

   ![Create new credential type form](/assets/images/credential-types-create-new.webp)

2. Enter the appropriate details in the **Name** and **Description** field.
3. In the **Input Configuration** field, specify an input schema which defines a set of ordered fields for that type. The format can be in YAML or JSON, as shown:

   **YAML**

   ```yaml
   fields:
     - type: string
       id: username
       label: Username
     - type: string
       id: password
       label: Password
       secret: true
   required:
     - username
     - password
   ```

   **JSON**

   ```json
   {
   "fields": [
     {
     "type": "string",
     "id": "username",
     "label": "Username"
     },
     {
     "secret": true,
     "type": "string",
     "id": "password",
     "label": "Password"
      }
     ],
    "required": ["username", "password"]
   }
   ```

   The configuration in JSON format below shows each field and how they are used:

   ```text
   {
     "fields": [{
       "id": "api_token",               # required - a unique name used to
                                        # reference the field value

       "label": "API Token",            # required - a unique label for the
                                        # field

       "help_text": "User-facing short text describing the field.",

       "type": ("string" | "boolean")   # defaults to 'string'

       "choices": ["A", "B", "C"]       # (only applicable to `type=string`)

       "format": "ssh_private_key"      # optional, can be used to enforce data
                                        # format validity for SSH private key
                                        # data (only applicable to `type=string`)

       "secret": true,                  # if true, the field value will be encrypted

       "multiline": false               # if true, the field should be rendered
                                        # as multi-line for input entry
                                        # (only applicable to `type=string`)
   },{
       # field 2...
   },{
       # field 3...
   }],

   "required": ["api_token"]            # optional; one or more fields can be marked as required
   },
   ```

   When `type=string`, fields can optionally specify multiple choice options:

   ```text
   {
     "fields": [{
         "id": "api_token",          # required - a unique name used to reference the field value
         "label": "API Token",       # required - a unique label for the field
         "type": "string",
         "choices": ["A", "B", "C"]
     }]
   },
   ```

4. In the **Injector Configuration** field, enter environment variables or extra variables that specify the values a credential type can inject. The format can be in YAML or JSON (see examples in the previous step). The configuration in JSON format below shows each field and how they are used:

   ```json
   {
     "file": {
         "template": "[mycloud]\ntoken={{ api_token }}"
     },
     "env": {
         "THIRD_PARTY_CLOUD_API_TOKEN": "{{ api_token }}"
     },
     "extra_vars": {
         "some_extra_var": "{{ username }}:{{ password }}"
     }
   }
   ```

   Credential Types can also generate temporary files to support .ini files or certificate/key data:

   ```json
   {
     "file": {
         "template": "[mycloud]\ntoken={{ api_token }}"
     },
     "env": {
         "MY_CLOUD_INI_FILE": "{{ ascender.filename }}"
     }
   }
   ```

   In this example, Ascender will write a temporary file that contains:

   ```text
   [mycloud]\ntoken=SOME_TOKEN_VALUE
   ```

   The absolute file path to the generated file will be stored in an environment variable named `MY_CLOUD_INI_FILE`. `ascender` is the reserved namespace for the generated files; `tower.filename` works as well.

   An example of referencing multiple files in a custom credential template is as follows:

   **Inputs**

   ```json
   {
     "fields": [{
       "id": "cert",
       "label": "Certificate",
       "type": "string"
     },{
       "id": "key",
       "label": "Key",
       "type": "string"
     }]
   }
   ```

   **Injectors**

   ```json
   {
     "file": {
       "template.cert_file": "[mycert]\n{{ cert }}",
       "template.key_file": "[mykey]\n{{ key }}"
     },
     "env": {
       "MY_CERT_INI_FILE": "{{ ascender.filename.cert_file }}",
       "MY_KEY_INI_FILE": "{{ ascender.filename.key_file }}"
     }
   }
   ```

5. Click **Save** when done. The Details page of the new credential type opens.
6. The new credential type also appears in the list of credential types:

   ![Credential Types list view with newly created credential type shown](/assets/images/credential-types-new-listed.webp)

   Click the **Edit** (pencil) icon under the Actions column to modify the credential type options.

7. Verify that the newly created credential type can be selected from the **Credential Type** selection window when creating a new credential:

   ![Newly created credential type selected from the credentials drop-down menu](/assets/images/credential-types-new-listed-verify.webp)

<Hint type="note">

The **Delete** button is on the credential type's Details screen, not in the Edit form. While any credential uses the credential type, **Delete** is disabled, with the tooltip "This credential type is currently being used by some credentials and cannot be deleted". To delete the credential type, first delete the credentials that use it, or change them to another credential type, which is possible only for a credential that no resource uses. The disabled button looks like this:

![Credential type delete confirmation](/assets/images/credential-types-delete-confirmation.webp)

</Hint>

For details on how to create a new credential, see [Credentials](../credentials).
