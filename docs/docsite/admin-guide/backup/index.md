---
title: Backup
description: Back up the Ascender database, secrets, and deployment configuration with the Ascender installer.
weight: 90
---

The Ascender installer backs up Ascender with the Ascender Operator's `AWXBackup` resource. A backup captures the PostgreSQL database, the secrets Ascender needs to decrypt it, and the Ascender deployment configuration. `./setup.sh -b` creates the backup in the cluster, waits for it to finish, and copies the files to the control machine.

To restore a backup, see [Restore](../restore).

## What the backup covers

The backup covers Ascender only. It dumps the Ascender database to `tower.db` whether Ascender uses the built-in PostgreSQL database or an external one (`ASCENDER_PGSQL_HOST`). `./setup.sh -r` restores only the built-in database; an external one is restored with your own database tools (see [Restore](../restore)).

It does not include:

- The data of the other components the installer deploys beside Ascender, such as Ledger (the `mysql-data` volume in the Ledger namespace) or Galaxy Proxy (the `ascender-galaxy-proxy-cache` volume in the Ascender namespace). Their data lives in persistent volumes in their namespaces. Back these up with your storage or Kubernetes backup tools, or with the component's database tools if you use an external database.
- The installer's `custom.config.yml` and `inventory`. Keep copies of them: `custom.config.yml` holds the passwords and every other setting you need to reinstall.

## Prerequisites

- An Ascender installation created with the Ascender installer.
- The installer directory, with the `custom.config.yml` from the installation, on a control machine with `kubectl` access to the cluster through `~/.kube/config`.
- Run the backup as the same user that ran the installation (for example root, with `sudo -i`), so it uses the same kubeconfig and writes to the same artifacts directory.
- The cluster must be able to pull the `busybox:stable` image, which the backup uses to copy the files. For offline installations, include it in the offline bundle.

If you no longer have the installer directory, clone it and copy in your `custom.config.yml`:

```bash
git clone https://github.com/ctrliq/ascender-install.git
cd ascender-install
```

## Run a backup

From the installer directory:

```bash
./setup.sh -b
```

The backup:

1. Creates an `AWXBackup` resource named `ascender-backup-<date>-<epoch>` in `ASCENDER_NAMESPACE`. The Ascender Operator dumps the database and secrets to a backup volume claim in the cluster.
2. Waits until the backup reports its directory and volume claim.
3. Starts a temporary pod, `ascender-backup-access`, that mounts the backup volume, copies `tower.db`, `secrets.yml`, and `awx_object` to the control machine, and removes the pod.
4. Points the `current` link at the new backup.

The backup takes a few minutes, depending on the size of the database.

## Backup files

Each backup contains three files:

- **`tower.db`**: a PostgreSQL dump of all Ascender data: organizations, users, credentials, projects, inventories, job templates, job history, schedules, and settings.
- **`secrets.yml`**: Ascender's secrets, including the secret key that encrypts credentials, the administrator password, and the PostgreSQL configuration.
- **`awx_object`**: the specification of the Ascender deployment.

They are saved under `backups/` in the installer's artifacts directory, `tmp_dir`. By default that is `ascender_install_artifacts/backups/` in the installer directory. Each run creates a timestamped directory, and `current` points to the newest one:

```text
ascender_install_artifacts/backups/
├── current -> backup-20260309T214902
├── backup-20260309T214902/
│   ├── tower.db
│   ├── secrets.yml
│   └── awx_object
└── backup-20260302T214611/
```

The installer creates `current` as a link to the absolute path of the backup directory, so if you move or copy the `backups/` directory, re-create the link as described in [Restore](../restore#restore-an-older-backup).

To find the artifacts directory if you changed it:

```bash
grep tmp_dir custom.config.yml
```

<Hint type="warning">

The backup files contain Ascender's encryption keys and credentials. Protect them like any other secret, and copy them off the control machine to storage that survives the loss of the cluster.

</Hint>

## Verify a backup

List the backups in the cluster:

```bash
kubectl get awxbackup -n ascender
```

Check whether a backup completed:

```bash
kubectl get awxbackup <backup-name> -n ascender \
  -o jsonpath='{.status.conditions[?(@.type=="Successful")].status}{"\n"}'
```

`True` means the backup succeeded. If it is still running:

```bash
kubectl get awxbackup <backup-name> -n ascender \
  -o jsonpath='{.status.conditions[?(@.type=="Running")].reason}{"\n"}'
```

If a backup fails, check the operator logs:

```bash
kubectl logs deployment/awx-operator-controller-manager -n ascender --tail=100
```

Use your `ASCENDER_NAMESPACE` instead of `ascender` if you changed it.

## Manage old backups

Every run creates a new `AWXBackup` resource and a directory on the backup volume in the cluster. The backups are created with `clean_backup_on_delete: true`, so deleting an `AWXBackup` resource also deletes its files from the volume. Copies already saved on the control machine are not affected.

Delete one backup:

```bash
kubectl delete awxbackup <backup-name> -n ascender
```

Keep only the newest backup in the cluster:

```bash
kubectl get awxbackup -n ascender --sort-by=.metadata.creationTimestamp -o name \
  | head -n -1 | xargs -r kubectl delete -n ascender
```

Manage the local copies in the `backups/` directory with your usual retention tools. Keep the directory `current` points to, because [restore](../restore) uses it.

## Schedule backups

To back up regularly, run `./setup.sh -b` from cron or a systemd timer on the control machine, as the user that ran the installation, and copy the new backup directory to off-host storage afterwards.

## Related settings

| Variable | Default | Description |
| --- | --- | --- |
| `ASCENDER_NAMESPACE` | `ascender` | Namespace of the Ascender deployment to back up |
| `tmp_dir` | `ascender_install_artifacts/` | Artifacts directory; backups are written to its `backups/` subdirectory |
| `ascender_garbage_collect_secrets` | `true` | When `true`, deleting the Ascender deployment also deletes its secrets. Does not affect backups, but makes a backup the only copy of the secret key if the deployment is deleted |
