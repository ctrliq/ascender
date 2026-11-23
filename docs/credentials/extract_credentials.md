# Extracting Credential Values

Ascender stores a number of secrets in its database, encrypted:

- the secret fields of every credential (passwords, private keys and their
  passphrases, tokens, cloud secret keys);
- the secret settings, such as the client secrets of the login providers;
- the passwords and tokens of notification templates;
- survey answers and defaults of the `password` type, and the passwords given
  when a job is launched (kept with the job so it can start);
- OAuth2 application client secrets and the workload identity signing keys.

There is no way to read a stored secret back in plain text, and no command
for it. The API and the UI show every secret as `$encrypted$`, and a secret
only ever leaves Ascender to the jobs and lookups that use it. To recover a
secret, get it from where it came from (its owner, or the system that issued
it) or set a new one. A secret that should be kept elsewhere can live in a
secret store and be looked up when it is needed (see
[Credential Plugins](credential_plugins.md)).

## How secrets are encrypted

An encrypted value is stored as `$encrypted$UTF8$AESCBC$` followed by a base64
encoded token of the Fernet format with a 256-bit key: AES-256 in CBC mode
with PKCS7 padding, authenticated with an HMAC-SHA256. The key is the SHA-512
digest of the `SECRET_KEY`, the primary key of the row the value belongs to
when one is given, and the name of the field, of which the first 32 bytes sign
and the last 32 encrypt (`EncryptionKey` in `src/internal/crypto/fernet.go`).
Credential inputs, notification configurations, settings and saved launch
arguments give the row's primary key, so each row's values have
keys of their own. Survey passwords, OAuth2 application client secrets and the
workload identity signing key give none: all three are the field `value`
without a primary key, so they share one key in an installation. It is the
same format the old application wrote, so a database upgraded from it keeps
its secrets.

## The SECRET_KEY

Every encrypted value depends on the `SECRET_KEY`, given to `ascender-web` and
`ascender-task` in `ASCENDER_SECRET_KEY` or, as a path to a file holding it,
`ASCENDER_SECRET_KEY_FILE`. Both processes must have the same one, and a
database upgraded from the old application needs the old installation's key.

Keep the key with the database backups. With another key, Ascender still
starts, but none of the stored secrets can be read: each secret setting reads
as unset (with a warning in the log naming it), anything that uses a
credential fails, and every secret has to be entered again. Ascender has no
command to change the key and re-encrypt the stored secrets.
