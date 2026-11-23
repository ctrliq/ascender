---
title: Kerberos Authentication
description: Build an execution environment with the Kerberos client and your realm configuration so Ascender jobs can authenticate to Windows hosts with Active Directory credentials.
weight: 4
---

User authentication via Active Directory (AD), also referred to as authentication through Kerberos, is supported through Ascender.

Ascender runs every job inside an [execution environment](/user-guide/execution-environments), a container image that holds Ansible, its Python libraries, and any system tools a job needs. Kerberos authentication happens inside that container, so the Kerberos client packages and your realm configuration (`krb5.conf`) must be built into the execution environment image. Do not install Kerberos packages on the Ascender nodes or generate tickets there; jobs never see them.

## What the Execution Environment Needs

To authenticate to Windows hosts with Kerberos, the execution environment must contain:

- **Kerberos client tools and libraries**: the `krb5-workstation` package (which provides `kinit` and `klist`) and `krb5-libs`. Building the Python Kerberos bindings also needs `krb5-devel`, `gcc`, and the Python development headers at build time.
- **Python Kerberos support**: `pywinrm[kerberos]` for the WinRM connection plugin, and `pypsrp[kerberos]` if you use the PSRP connection plugin.
- **Your realm configuration**: an `/etc/krb5.conf` that names your AD realm and its domain controllers (KDCs).

<Hint type="tip" title="Start from the default Ascender execution environment">

The default Ascender execution environment, [ascender-ee](https://github.com/ctrliq/ascender-ee) (`ghcr.io/ctrliq/ascender-ee`), already includes `krb5-workstation`, `krb5-devel`, `pykerberos`, `pywinrm[kerberos]`, and `pypsrp[kerberos]`, along with the Windows collections. It does not include a `krb5.conf` for your realm. Building on top of it, as in the example below, means you only have to add your configuration file; the Kerberos packages are listed in the example so the build still works if you switch to a different base image.

</Hint>

## Build a Kerberos Execution Environment

Execution environments are built with [ansible-builder](https://ansible.readthedocs.io/projects/builder/en/latest/). Create a build directory with this layout:

```text
kerberos-ee/
├── execution-environment.yml
└── files/
    └── krb5.conf
```

### Create the Kerberos Configuration

Create `files/krb5.conf` with the address of the AD, the domain, and so on. Replace `WEBSITE.COM` and the KDC hostnames with your own realm and domain controllers:

```ini
[libdefaults]
 default_realm = WEBSITE.COM
 dns_lookup_realm = false
 dns_lookup_kdc = false
 ticket_lifetime = 24h
 renew_lifetime = 7d
 forwardable = true
 # Containers have no kernel keyring, so keep credential caches in files
 default_ccache_name = FILE:/tmp/krb5cc_%{uid}

[realms]
 WEBSITE.COM = {
  kdc = WIN-SA2TXZOTVMV.website.com
  admin_server = WIN-SA2TXZOTVMV.website.com
 }

[domain_realm]
 .website.com = WEBSITE.COM
 website.com = WEBSITE.COM
```

The realm name in `[realms]`, `default_realm`, and `[domain_realm]` must be uppercase. Kerberos is case sensitive.

### Create the Execution Environment Definition

Create `execution-environment.yml`. The `system` and `python` dependencies install the Kerberos client and Python bindings, `additional_build_files` adds your `krb5.conf` to the build context, and the `append_final` step copies it to `/etc/krb5.conf` in the image:

```yaml
---
version: 3

images:
  base_image:
    name: ghcr.io/ctrliq/ascender-ee:latest

options:
  package_manager_path: /usr/bin/dnf

dependencies:
  python_interpreter:
    python_path: /usr/bin/python3.12
  system: |
    krb5-workstation [platform:rpm]
    krb5-libs [platform:rpm]
    krb5-devel [platform:rpm compile]
    gcc [platform:rpm compile]
    python3.12-devel [platform:rpm compile]
  python: |
    pywinrm[kerberos]
    pypsrp[kerberos]

additional_build_files:
  - src: files/krb5.conf
    dest: configs

additional_build_steps:
  append_final:
    - COPY --chmod=644 _build/configs/krb5.conf /etc/krb5.conf
```

If you need additional collections or Python packages for your playbooks, add them under `dependencies` in the same file. See the [ansible-builder definition reference](https://ansible.readthedocs.io/projects/builder/en/latest/definition/) for every available option.

### Build and Publish the Image

Build the image from the `kerberos-ee` directory, then push it to a container registry that Ascender can pull from:

```bash
ansible-builder build -v3 -t registry.example.com/automation/kerberos-ee:1.0
podman push registry.example.com/automation/kerberos-ee:1.0
```

### Test the Image

Before using the image in Ascender, confirm that you can get a ticket from inside the container:

```text
$ podman run --rm -it registry.example.com/automation/kerberos-ee:1.0 kinit username@WEBSITE.COM
Password for username@WEBSITE.COM:
```

To check the ticket, run `kinit` and `klist` in the same container session:

```text
$ podman run --rm -it registry.example.com/automation/kerberos-ee:1.0 bash -c 'kinit username@WEBSITE.COM && klist'
Password for username@WEBSITE.COM:
Ticket cache: FILE:/tmp/krb5cc_1000
Default principal: username@WEBSITE.COM

Valid starting     Expires            Service principal
01/25/26 11:42:56  01/25/26 21:42:53  krbtgt/WEBSITE.COM@WEBSITE.COM
  renew until 02/01/26 11:42:56
```

If `kinit` cannot find the realm or reach the KDC, check `files/krb5.conf` and that the container can resolve and reach your domain controllers.

## Use the Execution Environment in Ascender

1. Add the image in Ascender under **Administration** > **Execution Environments**, with a registry credential if the registry requires authentication. See [Execution Environments](/user-guide/execution-environments#use-an-execution-environment-in-jobs).
2. Select the new execution environment on the job templates that target Windows hosts, or set it as the default for the organization.
3. Make sure your inventory targets the Windows hosts by name and uses WinRM with Kerberos. For example:

```ini
[windows]
win01.WEBSITE.COM

[windows:vars]
ansible_user = username@WEBSITE.COM
ansible_connection = winrm
ansible_port = 5986
ansible_winrm_transport = kerberos
```

You should also:

- Ensure that the hostname is the proper client hostname matching the entry in AD and is not the IP address.
- In the username declaration, ensure that the domain name (the text after `@`) is properly entered with regard to upper- and lower-case letters, as Kerberos is case sensitive. For Ascender, you should also ensure that the inventory looks the same.

<Hint type="note">

If you encounter a `Server not found in Kerberos database` error message, and your inventory is configured using FQDNs (**not IP addresses**), ensure that the service principal name is not missing or mis-configured.

</Hint>

## AD and Kerberos Credentials

Active Directory only:

- If you are only planning to run playbooks against Windows machines with AD usernames and passwords as machine credentials, you can use `user@<domain>` format for the username and an associated password.

With Kerberos:

- Create a machine credential with the username and password, using the `user@<DOMAIN>` format for the username (realm in uppercase), and attach it to the job template along with the Kerberos execution environment.

## Working with Kerberos Tickets

Ansible defaults to automatically managing Kerberos tickets when both the username and password are specified in the machine credential for a host that is configured for Kerberos. A new ticket is created in a temporary credential cache for each host, before each task executes (to minimize the chance of ticket expiration). The temporary credential caches are deleted after each task, and will not interfere with the default credential cache. This is the recommended approach in Ascender, because each job runs in its own short-lived execution environment container.

To disable automatic ticket management (for example, to call `kinit` yourself to populate the default credential cache), set `ansible_winrm_kinit_mode=manual` via the inventory. In manual mode the ticket must be obtained inside the job's execution environment during the job run; tickets created on another machine, including the Ascender nodes, are not visible to the job.

Automatic ticket management requires a standard `kinit` binary on the system path of the execution environment, which the `krb5-workstation` package provides. To specify a different location or binary name, set the `ansible_winrm_kinit_cmd` inventory variable to the fully-qualified path to an MIT krbv5 kinit-compatible binary.
