# Project Signing and Verification

Project signing and verification lets project maintainers sign the files of
their project with GPG, and lets Ascender check them every time it updates
the project.

## Signing

Signing is done with [`ansible-sign`](https://github.com/ansible/ansible-sign),
a command line tool and library that uses `python-gnupg`, which in turn runs
`gpg`. Ascender does not sign anything itself; it uses the same library to
verify (see below).

`ansible-sign` expects a `MANIFEST.in` file, in the `distlib.manifest` format
familiar to Python project maintainers, which lists the files to include in
and exclude from the signature.

Internally, a "differ" works out which files were added or removed and which
files to sign and verify. Only one is shipped:
`DistlibManifestChecksumFileExistenceDiffer`, which uses `distlib.manifest` to
read `MANIFEST.in`.

When asked to sign a project (`ansible-sign project gpg-sign <directory>`),
`ansible-sign`:

* Asks `distlib.manifest` to read `MANIFEST.in` and resolve its entries to
  file paths, one directive at a time. Lines starting with `#` and blank
  lines are skipped, and `MANIFEST.in` itself is always included.
* Calculates the SHA-256 checksum of each resolved file, reading the files in
  chunks.
* Writes the checksums to `.ansible-sign/sha256sum.txt`, the "checksum
  manifest", one line per file in GNU Coreutils `sha256sum` format.
* Signs the checksum manifest. Only GPG is implemented, through the
  `GPGSigner` class, which takes the passphrase, the GnuPG home directory, the
  private key to use and so on. By default `gpg` uses the first private
  signing key in the user's default keyring. The detached signature is
  written to `.ansible-sign/sha256sum.txt.sig`.
* Checks that `gpg` returned `0`.

Commit `.ansible-sign/` with the project, so that a project update checks
out the manifest and the signature with the files.

## Verifying

### Setting it up

Ascender ships a managed credential type, `GPG Public Key` (kind
`cryptography`), whose one input, `gpg_public_key`, holds the public key that
matches the signing key. The key is not checked when the credential is
saved.

A project uses the credential through its `signature_validation_credential`
field (`src/internal/api/projects.go`). As in the old application, the field
takes a credential of any kind, but only a `GPG Public Key` credential turns
on the signature check (see below): with another kind, an update checks the
checksum manifest alone, and the credential's inputs are used nowhere. When
the field is empty, the project is not verified.

### When verification runs

Verification runs in project updates, never when a job is launched. A
project update made with a signature validation credential
(`NewProjectUpdate` and `InsertProjectUpdate` in `src/internal/models/jobs.go`)
gets two more job tags besides `update_<scm_type>`, `install_roles` and
`install_collections`:

* `validation_<namespace>`, from the credential's type: `validation_gpg_public_key`
  for the managed type;
* `validation_checksum_manifest`.

The project update runs `project_update.yml`
(`src/internal/tasks/playbooks/project_update.yml`, which `ascender-task`
carries in its binary) with `-t` and those tags, in the control plane
execution environment. Its second play, "Perform project signature/checksum
verification", has one task per tag, both using the `verify_project` action
plugin (`src/internal/tasks/playbooks/action_plugins/verify_project.py`):

* "Verify project content using GPG signature" (tag
  `validation_gpg_public_key`) checks the signature with the key, which
  `ascender-task` passes as the extra variable `gpg_pubkey` (`writeExtraVars`
  in `src/internal/tasks/project_update.go`).
* "Verify project content against checksum manifest" (tag
  `validation_checksum_manifest`) checks the files against the manifest.

A credential of any other type (a custom `cryptography` type, or a
credential of another kind) has another namespace, or none
(`validation_None`), so only the checksum manifest is checked for it.

The syncs a job makes of its project before it runs (see
[Background Tasks](./tasks.md#project-updates)) are given only the tags they need
(`update_<scm_type>`, `install_roles`, `install_collections`), so they never
verify.

The control plane execution environment must provide `ansible-sign`,
`python-gnupg` and `gpg`.

### What is checked

The plugin reverses the signing process. For the GPG signature:

* It fails with `Expected file not found: <path>` unless both
  `.ansible-sign/sha256sum.txt.sig` and `.ansible-sign/sha256sum.txt` exist.
* It imports the public key into a new GnuPG home directory made for the
  check and asks `ansible-sign`'s `GPGVerifier` (`python-gnupg`'s
  `verify_file`) whether the detached signature matches the checksum
  manifest and was made by that key. The task's message is GnuPG's summary,
  and its `gpg_details` the details GnuPG reported.

For the checksum manifest:

* It fails with `Expected file not found: <path>` when
  `.ansible-sign/sha256sum.txt` is missing, and with
  `Invalid line in checksum manifest: ...` when a line cannot be parsed.
* `ChecksumFile#diff` reads `MANIFEST.in` again, with an implicit
  `global-include *` added first so that new files are caught, and compares
  the files of the project against those listed in the manifest. Any file
  added or removed fails the task (`ChecksumMismatch`).
* Otherwise every file is hashed again and compared with the manifest; any
  mismatch fails the task with the list of mismatched files.
* A valid project reports `Checksum manifest is valid.`

### When verification fails

The task fails, so the project update fails and the project's status becomes
`failed`. Until an update succeeds, launching a job template that uses the
project is refused with
`{"playbook": ["Last project update failed due to signature validation failure."]}`,
and starting an update of an inventory source that reads the project is
refused with `["Last project update failed due to signature validation failure."]`,
unless the project has `scm_update_on_launch` set (`ProjectFailureReason` in
`src/internal/models/project.go`). A project whose last update failed for
any other reason gives `Missing a revision to run due to failed project update.`
