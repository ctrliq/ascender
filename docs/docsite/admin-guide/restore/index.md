---
title: Restore
description: Restore the Ascender database and secrets from a backup taken with the Ascender installer.
weight: 91
---

`./setup.sh -r` restores Ascender from a [backup](../backup) taken with `./setup.sh -b`. It replaces the PostgreSQL database of a running Ascender installation with the contents of the backup and restores the secrets and deployment configuration that go with it.

<Hint type="warning" title="Versions must match">

The Ascender version running in the cluster must be the version the backup was taken from. Restoring across versions is not supported.

</Hint>

You can restore onto the installation the backup came from, or onto a fresh installation of the same version, for example after losing a cluster.

Restore supports only the built-in PostgreSQL database. If `ASCENDER_PGSQL_HOST` is set, `./setup.sh -r` prints a message and stops without changing anything; restore an external database with your own tools, such as `pg_restore`. Restore covers Ascender only. The data of the other components the installer deploys, such as Ledger and Galaxy Proxy, is restored from your own volume or database backups.

## Prerequisites

- A running Ascender installation, with the operator, web, task, and PostgreSQL pods present, in the namespace set by `ASCENDER_NAMESPACE`. It can be the original installation or a fresh one of the same version, installed with the same `custom.config.yml`.
- The installer directory with your `custom.config.yml`, on a control machine with `kubectl` access to the cluster through `~/.kube/config`. Run the restore as the same user that ran the installation.
- The backup in `backups/current/` under the artifacts directory (`ascender_install_artifacts/backups/current/` by default).
- The cluster must be able to pull the `busybox:stable` image.

<Hint type="danger">

The restore deletes the existing PostgreSQL volume and replaces the database completely. Everything stored in the running installation since the backup is lost. Make sure `backups/current` points to the backup you want before you start.

</Hint>

## Run a restore

From the installer directory:

```bash
./setup.sh -r
```

Ascender is unavailable while the restore runs, which takes several minutes or longer for large databases.

### What happens during a restore

1. **Clean up.** Removes any `ascender-app-restore` (`AWXRestore`) and `ascender-app-backup` (`AWXBackup`) resources and any `temp-copy-pod` left from an earlier run.
2. **Create a staging volume.** Creates an `AWXBackup` named `ascender-app-backup` of the running installation. The restore uses its volume claim as a staging area; its contents are not used.
3. **Copy the backup into the cluster.** Starts `temp-copy-pod` with the staging volume mounted, copies `tower.db`, `secrets.yml`, and `awx_object` from `backups/current/` into `/backups/ascender_restore/`, sets their ownership and permissions, and removes the pod.
4. **Restore the database secret.** Applies the PostgreSQL configuration secret from `secrets.yml`.
5. **Recreate the database.** Scales the operator, web, and task deployments and the PostgreSQL StatefulSet to zero, deletes the PostgreSQL volume claim (`postgres-15-ascender-app-postgres-15-0`), and scales PostgreSQL back up with an empty database.
6. **Restore.** Creates an `AWXRestore` resource that points the operator at the backup files. The operator restores the database dump, the secrets, and the deployment configuration.
7. **Start Ascender.** Scales the operator back up, waits for the PostgreSQL and web pods, and removes the `AWXRestore` resource.

## Verify the restore

Check that the pods are running:

```bash
kubectl get pods -n ascender
```

Log in to Ascender and check that organizations, credentials, inventories, and job templates match the time of the backup. Log in with the administrator password from the backup.

## Common scenarios

### Roll back the running installation

1. Check that `backups/current` points to the backup you want.
2. Run `./setup.sh -r`.

### Restore onto a new cluster

1. Install Ascender with the Ascender installer, using the same Ascender version and your saved `custom.config.yml`.
2. Copy the backup directory to `ascender_install_artifacts/backups/` on the control machine and point `current` at it, as described below.
3. Run `./setup.sh -r`.

### Restore an older backup

`backups/current` is a symbolic link to the newest backup. To restore another backup, or after copying backups to a new machine, point the link at the backup directory:

```bash
cd ascender_install_artifacts/backups
rm -f current
ln -s "$PWD/backup-20260309T214902" current
```

Then run `./setup.sh -r`.

## Limitations

- **Built-in database only.** External PostgreSQL databases are not restored.
- **Same version.** The running Ascender version must match the backup.
- **Same namespace.** The restore uses the namespace in `ASCENDER_NAMESPACE`.
- **Downtime.** Ascender is unavailable during the restore. Plan a maintenance window.
