# Dependency Management

The `requirements.txt` file is generated from `requirements.in` and `requirements_git.txt`, using `pip-tools` and `pip-compile`.

## How To Use

Commands should be run in the awx container from inside the `./requirements` directory of the awx repository.

### Upgrading or Adding Select Libraries

If you need to add or upgrade one targeted library, then modify `requirements.in`,
then run the script:

`./updater.sh run`

#### Upgrading Unpinned Dependency

If you require a new version of a dependency that does not have a pinned version
for a fix or feature, pin a minimum version in `requirements.in` and run `./updater.sh run`. For example,
replace the line `asgi-amqp` with `asgi-amqp>=1.1.4`, and consider leaving a
note.

Then next time that a general upgrade is performed, the minimum version specifiers
can be removed, because `*.txt` files are upgraded to latest.

### Upgrading Dependencies

You can upgrade (`pip-compile --upgrade`) the dependencies by running

`./updater.sh upgrade`.

## Licenses and Source Files

If any library has a change to its license with the upgrade, then the license for that library
inside of `licenses` needs to be updated.

For libraries that have source distribution requirements (LGPL as an example),
a tarball of the library is kept along with the license.
To download the PyPI tarball, you can run this command:

```
pip download <pypi library name> -d licenses/ --no-binary :all: --no-deps
```

Make sure to delete the old tarball if it is an upgrade.

## UPGRADE BLOCKERs

Anything pinned in `*.in` files involves additional manual work in
order to upgrade. Some information related to that work is outlined here.

### django-oauth-toolkit

Upgraded to 3.x. The id_token_id / OpenID Connect schema changes from
https://github.com/jazzband/django-oauth-toolkit/pull/915 (and the later
token_checksum / hash_client_secret work) are handled by migration
`awx/main/migrations/0198_oauth2accesstoken_token_checksum_and_more.py`.
Note that AWX stores client secrets encrypted (reversible) rather than
hashed, so `OAuth2Application.hash_client_secret` defaults to False.

### pip, setuptools and setuptools_scm

If modifying these libraries make sure testing with the offline build is performed to confirm they are functionally working.
Versions need to match the versions used in the pip bootstrapping step
in the top-level Makefile.

### cryptography

If modifying this library make sure testing with the offline build is performed to confirm it is functionally working.

## Library Notes

### pexpect

Pinned to 4.7.0. pexpect/pexpect#579, released in 4.8, reworked how
`searchwindowsize` is applied, and the new behaviour interacts badly with the
way ansible-runner calls `expect()`.

`ansible_runner/runner.py` matches password prompts with a hardcoded window:

```python
result_id = child.expect(password_patterns, timeout=self.config.pexpect_timeout, searchwindowsize=100)
```

On 4.7 the search covered the new data plus the preceding window, so in
practice a whole chunk was searched. From 4.8 the window is honoured strictly,
and a match that spans more than 100 characters is never found. Measured with
that same call, matching `Enter passphrase for .*:` against prompts of
different lengths:

| prompt | 4.7.0 | 4.9.0 |
| ------ | ----- | ----- |
| 30 characters | matched | matched |
| 71 characters | matched | matched |
| 115 characters | matched | missed |

AWX's prompts include `Enter passphrase for .*:\s*?$` and
`Bad passphrase, try again for .*:\s*?$`, and what they match grows with the
key path, `<artifact_dir>/ssh_key_data`. The realistic worst case is roughly 85
characters, so it fits, but only by about 15, and `AWX_ISOLATION_BASE_PATH` is
an admin setting that can make the path longer. A prompt that misses does not
error: the job waits for `pexpect_timeout` with no passphrase supplied.

AWX cannot widen the window, since ansible-runner hardcodes it. Lifting this
pin means changing that call upstream first, to pass a larger value or `None`.
