---
title: Project Signing and Verification
description: Sign Ansible project content with ansible-sign and GPG, and have Ascender verify the signature on every project sync.
weight: 41
---

Project signing and verification provides the ability to sign files in your project directory and then verify whether or not that content has changed in any way, or files have been added or removed from the project unexpectedly. To accomplish this, a private key for signing and a matching public key for verifying are needed.

For project maintainers, the supported way to perform content signing is to use a utility called `ansible-sign`, through the command-line interface (CLI) that comes with it.

The CLI aims to make it easy to use cryptographic technology like GNU Privacy Guard (GPG) to validate that specified files within a project have not been tampered with in any way. Currently, GPG is the only supported means of signing and validation.

Ascender is used to verify the signed content. After a matching public key has been associated with the signed project, Ascender verifies that the files included during signing have not changed, and that files have not been added or removed unexpectedly. If the signature is not valid or a file has changed, the project fails to update, and no jobs making use of the project can launch. Verification status of the project ensures that only secure, untampered content is run in jobs.

Assuming that the repository has already been configured for signing and verification (see below), the usual workflow for altering the project becomes the following:

1. The user has a project repository set up already and wants to make a change to a file.
2. The user makes the change and runs `ansible-sign project gpg-sign /path/to/project`, which updates a checksum manifest and signs it.
3. The user commits the change, the updated checksum manifest, and the signature to the repository.
4. When the user syncs the project, Ascender (already configured, in this scenario) pulls in the new changes, checks that the public key associated with the project in Ascender matches the private key that the checksum manifest was signed with (this prevents tampering with the checksum manifest itself), then re-calculates checksums of each file in the manifest to ensure that the checksum matches (and thus that no file has changed). It also looks to ensure that all files are accounted for: they must have been either included in, or excluded from, the `MANIFEST.in` file discussed below. If files have been added or removed unexpectedly, verification fails.

![Content signing process diagram showing a project signed with a private key and verified by Ascender with the matching public key](/assets/images/content-sign-diagram.webp)

## Prerequisites

- A valid GPG public/private keypair is required for signing content. Refer to [How to create GPG keypairs](https://www.redhat.com/sysadmin/creating-gpg-keypairs) for details.

  Visit the [GnuPG documentation](https://www.gnupg.org/documentation/index.html) for more information regarding GPG keys.

  You can verify that you have a valid GPG keypair in your default GnuPG keyring with the following command:

  ```bash
  gpg --list-secret-keys
  ```

  If the above command produces no output, or one line of output that states `trustdb was created`, then you do not have a secret key in your default keyring. In this case, refer to [How to create GPG keypairs](https://www.redhat.com/sysadmin/creating-gpg-keypairs) to learn how to create a new keypair before proceeding. If it produces output other than that, you have a valid secret key and are ready to move on to using `ansible-sign`.

## Add a GPG key to Ascender

To use the GPG key for content signing and validation in Ascender, you must first export the public key by running the following commands in the CLI:

```bash
gpg --list-keys
gpg --export --armour <key fingerprint> > my_public_key.asc
```

Then add it to Ascender as a credential:

1. In the Ascender user interface, click **Credentials** from the left side navigation menu, then click the **Add** button.

2. Provide the new credential a meaningful name (for example, "Infrastructure team public GPG key").

3. In the **Credential Type** field, select **GPG Public Key**.

4. Click **Browse** to locate and select the public key file (for example, `my_public_key.asc`).

5. Click **Save** when done.

![Example GPG Public Key credential details](/assets/images/credentials-gpg-details.webp)

This credential can now be selected in [projects](../projects#add-a-new-project), and content verification automatically takes place on future project syncs.

![Create New Project form with an example GPG credential selected as the Content Signature Validation Credential](/assets/images/project-create-with-gpg-creds.webp)

<Hint type="note">

Use the project cache SCM timeout to control how often you want Ascender to re-validate the signed content. When a project is configured to update on launch (of any job template configured to use that project), you can enable the cache timeout setting, which tells it to update after N seconds have passed since the last update. If validation is running too frequently, you can slow down how often project updates occur by specifying the time in the **Cache Timeout** field of the Option Details pane of the project.

![Update Revision on Launch option selected with a Cache Timeout value specified on the Create New Project page](/assets/images/project-update-launch-cache-timeout.webp)

</Hint>

## Access the ansible-sign CLI utility

The `ansible-sign` utility provides options for the user to sign and verify whether the project is signed.

1. Run the following command to install `ansible-sign`:

   ```bash
   dnf install ansible-sign
   ```

2. Verify that `ansible-sign` was successfully installed:

   ```bash
   ansible-sign --version
   ```

   Output similar to the following displays (possibly with a different version number):

   ```text
   ansible-sign 0.1
   ```

   This indicates you have successfully installed `ansible-sign`.

## Signing your project

As the name suggests, signing a project involves an Ansible project directory. Refer to the [Ansible documentation](https://docs.ansible.com/ansible/latest/user_guide/sample_setup.html) for more sophisticated examples of project directory structures.

The following sample project has a very simple structure: an inventory file, and two small playbooks under a playbooks directory:

```text
$ cd sample-project/
$ tree -a .
.
├── inventory
└── playbooks
    └── get_uptime.yml
    └── hello.yml

1 directory, 3 files
```

<Hint type="note">

The commands used in this section assume that your working directory is the root of your project. As a rule, `ansible-sign project` commands always take the project root directory as their last argument, and therefore, we use `.` to indicate the current working directory.

</Hint>

The way that `ansible-sign` protects content from tampering is by taking checksums (SHA256) of all of the secured files in the project, compiling those into a checksum manifest file, and then finally signing that manifest file.

The first step toward signing content is to create a file that tells `ansible-sign` which files to protect. This file should be called `MANIFEST.in` and reside in the project root directory.

Internally, `ansible-sign` makes use of the `distlib.manifest` module of Python's distlib library, and thus `MANIFEST.in` must follow the syntax that this library specifies. See the [Python Packaging User Guide](https://packaging.python.org/en/latest/guides/using-manifest-in/#manifest-in-commands) for an explanation of the `MANIFEST.in` file directives.

The sample project includes two directives, resulting in a `MANIFEST.in` file that looks like this:

```text
include inventory
recursive-include playbooks *.yml
```

With this file in place, generate your checksum manifest file and sign it. Both of these steps are achieved in a single `ansible-sign` command:

```text
$ ansible-sign project gpg-sign .
[OK   ] GPG signing successful!
[NOTE ] Checksum manifest: ./.ansible-sign/sha256sum.txt
[NOTE ] GPG summary: signature created
```

Now the project has been signed.

Notice that the `gpg-sign` subcommand resides under the `project` subcommand. For signing project content, every command starts with `ansible-sign project`. As noted above, as a rule, every `ansible-sign project` command takes the project root directory as its final argument.

As mentioned earlier, `ansible-sign` by default makes use of your default keyring and looks for the first available secret key that it can find to sign your project. You can specify a specific secret key to use with the `--fingerprint` option, or even a completely independent GPG home directory with the `--gnupg-home` option.

<Hint type="note">

If you are using a desktop environment, GnuPG automatically prompts you for your secret key's passphrase. If this functionality does not work, or you are working without a desktop environment (for example, via SSH), you can use the `-p/--prompt-passphrase` flag after `gpg-sign` in the above command, which causes `ansible-sign` to prompt for the password instead.

</Hint>

Upon viewing the structure of the project directory, notice that a new `.ansible-sign` directory was created. This directory contains the checksum manifest and a detached GPG signature for it.

```text
$ tree -a .
.
├── .ansible-sign
│   ├── sha256sum.txt
│   └── sha256sum.txt.sig
├── inventory
├── MANIFEST.in
└── playbooks
    ├── get_uptime.yml
    └── hello.yml
```

## Verifying your project

If you want to verify that a signed Ansible project has not been altered, you can use `ansible-sign` to check whether the signature is valid and that the checksums of the files match what the checksum manifest says they should be. In particular, the `ansible-sign project gpg-verify` command can be used to automatically verify both of these conditions.

```text
$ ansible-sign project gpg-verify .
[OK   ] GPG signature verification succeeded.
[OK   ] Checksum validation succeeded.
```

<Hint type="note">

By default, `ansible-sign` makes use of your default GPG keyring to look for a matching public key. You can specify a keyring file with the `--keyring` option, or a different GPG home with the `--gnugpg-home` option.

</Hint>

If verification fails for any reason, information is displayed to help you debug the cause. More verbosity can be enabled by passing the global `--debug` flag immediately after `ansible-sign` in your commands.

<Hint type="note">

When a GPG credential is used in a project, content verification automatically takes place on future project syncs.

</Hint>

## Automate signing

In environments with highly trusted CI environments (for example, OpenShift, Jenkins, and so on), it is possible to automate the signing process. For example, you could store your GPG private key in a CI platform of choice as a secret, and import that into GnuPG in the CI environment. You could then run through the signing workflow above within the normal CI workflow, container, or environment.

When signing a project using GPG, the environment variable `ANSIBLE_SIGN_GPG_PASSPHRASE` can be set to the passphrase of the signing key. This can be injected (and masked or secured) in a CI pipeline.

Depending on the scenario at hand, `ansible-sign` returns a different exit code during both signing and verification. This can also be useful in the context of CI and automation, as a CI environment can act differently based on the failure (for example, sending alerts for some errors but silently failing for others).

These are the exit codes currently used in `ansible-sign`, which can be considered stable:

| Exit code | Approximate meaning | Example scenarios |
| --- | --- | --- |
| 0 | Success | Signing was successful; verification was successful. |
| 1 | General failure | The checksum manifest file contained a syntax error during verification; the signature file did not exist during verification; `MANIFEST.in` did not exist during signing. |
| 2 | Checksum verification failure | The checksum hashes calculated during verification differed from what was in the signed checksum manifest (for example, a project file was changed but the signing process was not re-completed). |
| 3 | Signature verification failure | The signer's public key was not in the user's GPG keyring; the wrong GnuPG home directory or keyring file was specified; the signed checksum manifest file was modified in some way. |
| 4 | Signing process failure | The signer's private key was not found in the GPG keyring; the wrong GnuPG home directory or keyring file was specified. |
