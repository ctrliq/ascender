#!/bin/sh
# Generates the secrets of a new installation in .secrets/ (the directory
# given): the database password, the SECRET_KEY and the admin password.
# `make init` runs it, and so does the Makefile for the targets that need
# the secrets, when neither the database password nor the SECRET_KEY is
# configured.
#
# Only for a new installation: with either of the first two present this is
# an installation that has lost the other, and a new SECRET_KEY cannot read
# what the old one encrypted, nor a new password open a database made with
# the old. For the same reason it refuses when the compose database volume
# exists. The admin password comes only with them: a new one for an
# existing installation would replace its admin's password at the next
# start.
#
# Usage: init-secrets.sh SECRETS_DIR [CONTAINER_RUNTIME]
set -eu

dir=$1
runtime=${2:-}

[ ! -e "$dir/ASCENDER_DB_PASSWORD" ] && [ ! -e "$dir/SECRET_KEY" ] || exit 0

if [ -n "$runtime" ] && "$runtime" volume inspect deploy_postgres_data >/dev/null 2>&1; then
	echo "init-secrets: not generating secrets: the database volume deploy_postgres_data exists, made with the" >&2
	echo "init-secrets: password and SECRET_KEY it was created with. Put those in $dir/ (see deploy/README.md)." >&2
	exit 0
fi

# Letters and digits: nothing to quote in a URL, a shell or a YAML file.
random_text() {
	head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"
}

umask 077
mkdir -p "$dir"
random_text 32 >"$dir/ASCENDER_DB_PASSWORD"
# As the old installer made it: 33 random bytes, base64.
head -c 33 /dev/urandom | base64 | tr -d '\n' >"$dir/SECRET_KEY"
generated="ASCENDER_DB_PASSWORD and SECRET_KEY"
if [ ! -e "$dir/ADMIN_PASSWORD" ]; then
	random_text 20 >"$dir/ADMIN_PASSWORD"
	generated="ASCENDER_DB_PASSWORD, SECRET_KEY and ADMIN_PASSWORD"
fi
echo "init-secrets: generated $generated in $dir/ for a new installation." >&2
echo "init-secrets: keep them (with the database): without SECRET_KEY nothing encrypted in it can be read." >&2
echo "init-secrets: log in as admin with the password in $dir/ADMIN_PASSWORD." >&2
