---
title: Migrating from AWX
description: Import an AWX database backup into an Ascender installation with the AWX migration playbook in the Ascender installer.
weight: 31
---

The Ascender installer includes a playbook that moves an AWX installation's data into Ascender. It takes the newest AWX backup from S3-compatible object storage, restores it into the PostgreSQL database of a running Ascender installation with a parallel `pg_restore`, brings the database schema up to Ascender's, copies the AWX secrets Ascender needs, and starts Ascender on the imported data.

The playbook is `playbooks/awx_migrate_ascender.yml`, and it runs the `awx_migrate_ascender` role. Its [README](https://github.com/ctrliq/ascender-install/blob/main/playbooks/roles/awx_migrate_ascender/README.md) describes every step in detail.

## Supported versions

The migration's database steps were built for AWX 24.6.1 as the source. The last step applies every remaining Ascender migration, so the target can be a current Ascender release. If your AWX version is different, the list of migration steps (`migration_steps` in the role's `vars/main.yml`) must be adjusted for it; contact CIQ support before migrating.

## How the migration works

The role runs in phases. Each phase is an Ansible tag, so you can rerun from any point:

| Tag | What it does |
| --- | --- |
| `prep` | Scales down the Ascender Operator, web, task, and PostgreSQL, deletes the old migration job, and creates a restore volume claim (`awx-migrate-ascender`, 100 GiB by default) |
| `download` | Starts a pod with the MinIO client (`minio/mc`) and downloads the newest `tower-*` backup folder from the bucket to the restore volume |
| `secrets` | Copies secrets from the AWX backup into the Ascender secrets: the secret key that encrypts credentials, the administrator password, the receptor CA and work-signing keys, and the LDAP CA certificate if there is one |
| `pg_restore` | Mounts the restore volume on PostgreSQL, recreates the database, tunes PostgreSQL for a bulk load, restores the dump with parallel workers, and removes AWX-only migration records |
| `migrate` | Runs `ascender-manage migrate` in a temporary web pod, recording the schema changes AWX already made and applying the Ascender-only ones, and syncs the administrator password |
| `cleanup` | Resets the PostgreSQL tuning and removes the restore volume from PostgreSQL |
| `patch_cr` | Copies `ee_images`, `image_pull_secrets`, and `postgres_storage_requirements` from the AWX deployment, and sets `ldap_cacert_secret` and `postgres_extra_args`, on the Ascender deployment |
| `startup` | Starts the operator and waits for its migration job and the web and task pods |
| `configure` | **Disaster recovery only.** Disables execution nodes, job template notifications, and schedules, cancels running and pending jobs, and sets the LDAP server URIs. Skip it for a production migration |
| `verify` | Checks that the Ascender API answers through its OpenShift Route |

After the migration, Ascender's administrator password is the one from the AWX backup.

## Prerequisites

- Ascender installed with the Ascender installer, using the built-in PostgreSQL database.
- A PostgreSQL volume large enough for the restored database. A restored AWX database is much larger than its compressed dump (in CIQ's testing, a 5 GB dump expanded to about 56 GB with its indexes), and the default volume is 8 GiB. Set `POSTGRES_PVC_SIZE_GB` before you install Ascender, for example to `100`; it cannot be changed on an existing installation.
- An AWX backup in the native AWX Operator format (`tower.db`, `secrets.yml`, and `awx_object`) in a folder whose name starts with `tower-`, in a bucket on S3-compatible storage. The newest such folder is used.
- A StorageClass for the restore volume. The default is `thin-csi`; set `restore_pvc_storage_class` to use another.
- The Kubernetes API URL and a service account token with permission to manage deployments, StatefulSets, jobs, pods, secrets, volume claims, and the Ascender custom resource in the Ascender namespace.
- An execution environment with the `kubernetes.core` collection, and with `ctrliq.ascender` if you run the `configure` phase. The cluster must be able to pull the `minio/mc` image.

To shorten the restore, trim old job history in AWX before taking the backup, for example with `awx-manage cleanup_jobs --days=30`.

## Variables

| Variable | Default | Description |
| --- | --- | --- |
| `ascender_namespace` | `ascender` | Namespace where Ascender is installed |
| `ascender_instance` | `ascender` | Name of the Ascender deployment (the `AWX` resource). The Ascender installer names it `ascender-app`, so set this to `ascender-app` |
| `k8s_url` | None | Kubernetes API URL of the Ascender cluster |
| `k8s_token` | None | Service account token for the Kubernetes API |
| `s3_endpoint` | None | URL of the S3-compatible storage |
| `s3_accesskey` | None | S3 access key |
| `s3_secretkey` | None | S3 secret key |
| `s3_bucket` | None | Bucket that holds the AWX backups |
| `source_awx_instance` | `awx` | Name of the AWX deployment the backup came from. Used to find the receptor secrets in the backup |
| `pg_restore_jobs` | `16` | Number of parallel `pg_restore` workers, 1 to 64. Limited in practice by the PostgreSQL pod's CPUs |
| `restore_poll_interval` | `30` | Seconds between restore progress messages |
| `restore_pvc_size` | `100Gi` | Size of the restore volume, which holds the downloaded backup |
| `restore_pvc_storage_class` | `thin-csi` | StorageClass of the restore volume |
| `s3_mc_image`, `s3_mc_image_tag` | `minio/mc`, `latest` | MinIO client image used for the download |
| `ascender_environment` | `dr` | Selects the LDAP server list that the `configure` phase applies, from `ascender_ldap_server_map` in the role's `vars/main.yml` |

## Run the migration from Ascender

The installer includes a job template definition, `playbooks/awx_migrate_ascender.template.yml`, with a survey for the variables above. To run the migration as an Ascender job:

1. Create a project named **Ascender Install** that uses the Git repository `https://github.com/ctrliq/ascender-install.git`. See [Projects](/user-guide/projects).
2. Create an inventory named **localhost** with the host `localhost` and the host variable `ansible_connection: local`.
3. Create a job template named **AWX - Migrate to Ascender** with that project and inventory, the playbook `playbooks/awx_migrate_ascender.yml`, an execution environment that meets the prerequisites, and the survey questions from the template definition. Enable **Prompt on launch** for job tags and skip tags. See [Job templates](/user-guide/job-templates).
4. Launch the job template, answer the survey, and for a production migration enter `configure` as a skip tag.

Because the job scales Ascender down, it cannot run on the Ascender instance it migrates into. Run it from another Ascender or AWX instance, or from the command line.

## Run the migration from the command line

From the repository root on a machine with access to the cluster and the bucket, put the variables in a file and run the playbook. Skip `configure` for a production migration:

```bash
ansible-playbook playbooks/awx_migrate_ascender.yml -e @migration-vars.yml --skip-tags configure
```

To rerun part of the migration:

| Situation | Options |
| --- | --- |
| The restore volume already has the backup | `--skip-tags prep,download` |
| `pg_restore` failed | `--skip-tags prep,download,secrets` |
| The migrate phase failed | `--tags migrate,cleanup,patch_cr,startup,verify` |
| Only reapply secrets and restart | `--tags secrets,cleanup,patch_cr,startup,verify` |
| Only patch the deployment and restart | `--tags patch_cr,startup,verify` |
| Only check the API | `--tags verify` |

## Disaster recovery restores

The `configure` phase prepares a standby copy that must not act like production. It disables every enabled execution node, every enabled job template notification, and every enabled schedule, cancels running and pending jobs, and sets the Ascender `AUTH_LDAP_SERVER_URI` setting to the servers listed for `ascender_environment` in `ascender_ldap_server_map`. The map in `vars/main.yml` contains example values; edit it for your domain controllers before you run `configure`.

## After the migration

- Log in with the AWX administrator password and check organizations, credentials, inventories, and job templates. Credentials decrypt with the AWX secret key that the migration copied.
- The `verify` phase looks for an OpenShift Route. On other platforms it finds none and does nothing, so check `https://<ASCENDER_HOSTNAME>/api/v2/ping/` yourself.
- Check that execution nodes reconnect; the receptor CA and work-signing keys come from AWX.

## Troubleshooting

### No space left on device during pg_restore

The PostgreSQL volume is too small for the restored database. Reinstall Ascender with a larger `POSTGRES_PVC_SIZE_GB` and run the migration again.

### InconsistentMigrationHistory errors

The cleanup of migration records did not complete. Rerun from the `pg_restore` phase with `--skip-tags prep,download,secrets`. If `ascender-manage migrate` fails for another reason, the Ascender image may contain migrations that `migration_steps` does not cover; contact CIQ support.

### Credentials do not decrypt

The secret key was not copied. Compare `data.secret_key` in the `<instance>-secret-key` secret with the value in the backup's `secrets.yml`, then rerun with `--tags secrets,cleanup,patch_cr,startup,verify`.

### Monitor the restore

The job prints the database size, the number of active queries, and the last restore operation every `restore_poll_interval` seconds. To watch from another terminal:

```bash
kubectl exec ascender-app-postgres-15-0 -n ascender -- \
  psql -U awx -d awx -c "SELECT pg_size_pretty(pg_database_size('awx'));"
```
