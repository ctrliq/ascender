# Custom Credential Types

Every credential has a type. The type defines the credential's *inputs*, the
fields a user fills in, and its *injectors*, which say how those values reach
the job: as environment variables, extra variables, or files.

Ascender ships with managed types (Machine, Vault, Source Control, Network,
Amazon Web Services, the [secret lookups](credential_plugins.md), and so on),
defined in `src/internal/models/managed_credential_types.json`. Superusers can
add custom types for services Ascender does not know about, for instance to
hand a playbook an API token in an environment variable, or to write a
configuration file with a certificate and key for an inventory script.

The API and its validation are in `src/internal/api/credential_types.go`, the
check of the injector templates in `src/internal/api/credential_type_jinja.go`,
and the injection at run time in `src/internal/tasks/credentials.go`.

## Kinds

Every type has a kind: `ssh` (Machine), `vault` (Vault), `net` (Network),
`scm` (Source Control), `cloud` (Cloud), `registry` (Container Registry),
`token` (Personal Access Token), `external` (External), `kubernetes`
(Kubernetes), `galaxy` (Galaxy/Automation Hub) or `cryptography`
(Cryptography). A custom type is either `cloud` or `net`
(`Must be 'cloud' or 'net', not <kind>`). The kind decides where a credential
of the type can be used: a job template takes `cloud` and `net` credentials of
any type, one of each type (see
[Multi-Credential Assignment](multi_credential_assignment.md)).

## API

`GET /api/v2/credential_types/` lists all types, the managed ones
(`"managed": true`) among them. Only superusers can create, change or delete a
type:

```
POST /api/v2/credential_types/

{
    "name": "Third Party Cloud",
    "description": "Integration with Third Party Cloud",
    "kind": "cloud",
    "inputs": {
        "fields": [{
            "id": "api_token",
            "label": "API Token",
            "type": "string",
            "secret": true
        }]
    },
    "injectors": {
        "env": {
            "THIRD_PARTY_CLOUD_API_TOKEN": "{{ api_token }}"
        }
    }
}
```

A credential of the type then takes the inputs the type defines:

```
POST /api/v2/credentials/

{
    "name": "Example Third Party Cloud API Token",
    "organization": <pk>,
    "credential_type": <pk>,
    "inputs": {
        "api_token": "<the token>"
    }
}
```

Secret inputs are stored encrypted and read back as `$encrypted$`:

```
GET /api/v2/credentials/<pk>/

{
    "name": "Example Third Party Cloud API Token",
    "credential_type": <pk>,
    "inputs": {
        "api_token": "$encrypted$"
    },
    ...
}
```

The name has to be unique among the types of its kind. Managed types cannot be
changed or deleted (`Modifications not allowed for managed credential types`,
`Deletion not allowed for managed credential types`). Once credentials of a
type exist, its inputs can no longer be changed (`Modifications to inputs are
not allowed for credential types that are in use`) and the type cannot be
deleted (`Credential types that are in use cannot be deleted`); its name,
description and injectors still can. Creating, changing and deleting a type is
recorded in the activity stream.

## Inputs

The `inputs` of a type are an ordered list of fields and the list of those
that are required:

```
"inputs": {
    "fields": [{
        "id": "api_token",          # required: the name the field is referred
                                    # to by, a letter or underscore followed by
                                    # letters, digits and underscores
        "label": "API Token",       # required: what the form shows
        "help_text": "User-facing short text describing the field.",
        "type": "string",           # "string" (the default) or "boolean"
        "format": "ssh_private_key",# optional: "ssh_private_key" checks the value
                                    # is a private key, "url" that it is a URL
                                    # with a scheme and a host
        "secret": true,             # stored encrypted, read back as $encrypted$
        "multiline": false,         # shown as a multi-line text box
        "default": "a value",       # filled in when a credential is created
        "choices": ["A", "B", "C"]  # optional: the only values allowed
    }, {
        # field 2...
    }],
    "required": ["api_token"]
}
```

`format`, `secret`, `multiline` and `choices` only apply to string fields
(`<key> not allowed for boolean type (<id>)`), and a default must be of the
field's type. Choices must be a non-empty list of distinct strings. Field ids
must be unique, and `ascender` and `tower` are reserved (`"ascender" is a
reserved field name`). No other keys are accepted: `ask_at_runtime` (prompting
for the value at launch, as the Machine type does for its passwords) and
`dependencies` are not supported for custom types.

## Injectors

Injectors fill templates with a credential's inputs, referred to by their
field ids:

```
"injectors": {
    "env": {
        "THIRD_PARTY_CLOUD_API_TOKEN": "{{ api_token }}"
    },
    "extra_vars": {
        "some_extra_var": "{{ username }}:{{ password }}",
        "auth": {
            "username": "{{ username }}",
            "password": "{{ password }}"
        }
    }
}
```

A type can also have files written for the job, such as an `.ini` file or
certificate and key data. The name of the file is `{{ ascender.filename }}`:

```
"injectors": {
    "file": {
        "template": "[mycloud]\ntoken={{ api_token }}"
    },
    "env": {
        "MY_CLOUD_INI_FILE": "{{ ascender.filename }}"
    }
}
```

For several files, name each one `template.<name>` and refer to it as
`{{ ascender.filename.<name> }}`:

```
"injectors": {
    "file": {
        "template.cert": "{{ cert }}",
        "template.key": "{{ key }}"
    },
    "env": {
        "MY_CERT": "{{ ascender.filename.cert }}",
        "MY_KEY": "{{ ascender.filename.key }}"
    }
}
```

The two forms cannot be mixed in one type (`Must use multi-file syntax when
injecting multiple files`). `tower` is another name for `ascender`, so a type
written with `{{ tower.filename }}` keeps working.

What the injectors may contain:

* Environment variable names are a letter or underscore followed by letters,
  digits and underscores, and their templates are ASCII. Names starting with
  `ANSIBLE_` are refused (`Environment variable <name> may affect Ansible
  configuration so its use is not allowed in credentials.`), and so are the
  variables the job itself relies on: `VIRTUAL_ENV`, `PATH`, `PYTHONPATH`,
  `JOB_ID`, `INVENTORY_ID`, `INVENTORY_SOURCE_ID`, `INVENTORY_UPDATE_ID`,
  `AD_HOC_COMMAND_ID`, `REST_API_URL`, `REST_API_TOKEN`, `MAX_EVENT_RES`,
  `CALLBACK_QUEUE`, `CALLBACK_CONNECTION`, `CACHE`, `JOB_CALLBACK_DEBUG`,
  `INVENTORY_HOSTVARS`, `AWX_HOST`, `PROJECT_REVISION` and
  `SUPERVISOR_CONFIG_PATH` (`Environment variable <name> is not allowed to be
  used in credentials.`). Any other name may be set, `ASCENDER_*` and `AWX_*`
  ones included: the managed CIQ Ascender Automation Platform type sets
  `ASCENDER_HOST`, `ASCENDER_USERNAME`, `ASCENDER_PASSWORD`,
  `ASCENDER_VERIFY_SSL` and `ASCENDER_OAUTH_TOKEN`. The same rule applies when
  a job runs: a refused variable that reached the database another way is
  skipped, and the task log says `Ignoring prohibited env var <name>, reason:
  [...]`.
* Extra variables are strings, lists, or nested objects of them. Their keys
  are templates too.

When a job runs, the files are written to the job's private data directory
(`/runner/env/` in the execution environment), readable only by the job. The
extra variables are written to a file passed to Ansible with `-e @<file>`,
with every string tagged `!unsafe`, so Ansible never treats a
value a credential holds as a template. Environment variables are set for the
job, and the copy stored with the job (its `job_env`) shows the secret inputs
as `**********`.

Injectors apply to jobs and inventory updates. An inventory update gets the
files and environment variables but not the extra variables, which
`ansible-inventory` does not take: its `extra_vars` templates are not even
rendered. A managed type without injectors of its own (Machine, Vault, Source
Control, Amazon Web Services and others) is applied by Ascender's built-in code
for that type instead.

### How the templates are rendered

When a type is saved, each of its injector templates, and each key of
`extra_vars`, is rendered with Ascender's port of Jinja2's
`ImmutableSandboxedEnvironment` (`src/internal/jinja`), with each field
standing in as `EXAMPLE` and undefined names as errors. That reports:

* a syntax error (`Syntax error rendering template for <key> inside of
  <injector> (<error>)`);
* a name that is not one of the type's fields, or `{{ ascender.filename }}`
  without an unnamed file template (`<key> uses an undefined field (<error>)`);
* what the sandbox refuses (`Encountered unsafe code execution: <error>`):
  attributes whose name starts with `_`, methods that change lists and
  dictionaries, and ranges of more than 100,000 items.

This check runs in a child process (`src/internal/jinjarun`) limited to 20
seconds of CPU time, a 15-second render deadline, and 16 MB of output, with its
memory capped, so a template that never ends cannot hold up the server.

When a job or inventory update runs, the templates are rendered with the same
sandbox (`jinjarun.Credential`, called from `injectCredential` in
`src/internal/tasks/credentials.go`), so Jinja2's filters
(`{{ token | trim }}`), conditionals and loops work. Ansible's own filters,
such as `b64encode`, are not Jinja2's and are refused when the type is saved. The rendering runs in a child
process with the same limits as the check above, and must finish within 30
seconds. The templates see:

* each input the credential holds or [looks up](credential_plugins.md), by its
  field id, with secrets decrypted. An empty value is left out, so it renders
  as an empty string. A boolean field missing from the credential's stored
  inputs is `False`, even when a lookup supplies it, and a private key field (`format: ssh_private_key`) always ends with a
  newline. A lookup that returns a dictionary or a list is passed as it is,
  so `{{ field.key }}` and `{{ field | join(',') }}` work. A lookup that returns
  a number or null fails the job (`TypeError: object of type 'int' has no
  len()`);
* `ascender` (or `tower`), whose `filename` is the path of the file template,
  or holds one path for each `template.<name>`.

An undefined name renders as an empty string, as Jinja2's default does, but
an attribute of one (`{{ missing.attr }}`) is an error. The files are written
first, in the order the type's injectors are stored in, and each file's name can
be used by the files after it and by the other injectors. Then come the
environment variables, then the extra variables. The copy of the environment
stored with the job is rendered a second time, with every secret input as
`**********`. The extra variables file lists the top-level variables in the
stored order (PostgreSQL keeps the keys of a stored type shortest first), and
the keys of nested objects sorted.

A template that fails to render (a syntax error, an undefined attribute,
something the sandbox refuses, a division by zero) stops the job before it
starts. The job ends with the status `error`, and its traceback ends with the
exception, for instance `jinja2.exceptions.UndefinedError: 'missing' is
undefined`.

## Using a custom credential

Credentials of custom types are attached to job templates like any other
credential (see [Multi-Credential Assignment](multi_credential_assignment.md)),
can be prompted for at launch when the template asks for credentials, and can
be attached to inventory sources, where an inventory script or plugin can read
what the injectors set. Their fields can also be looked up in a secret store
rather than stored (see [Credential Plugins](credential_plugins.md)).
