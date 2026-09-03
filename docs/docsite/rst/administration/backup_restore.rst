.. _ag_backup_restore:

************************
Backup and Restore
************************

.. index::
   single: backup
   single: restore
   pair: backup; database
   pair: restore; secret key

Ascender is backed up through the Ascender Operator, which captures the database, the secrets that encrypt it, and the deployment configuration. `ascender-install <https://github.com/ctrliq/ascender-install>`_ drives that process and copies the result off the cluster for you, so use it if you installed with it.

What a backup contains
=======================

A backup is three files:

.. list-table::
   :widths: 25 75
   :header-rows: 1

   * - File
     - Contents
   * - ``tower.db``
     - The PostgreSQL database, as a ``pg_dump`` custom-format archive
   * - ``secrets.yml``
     - The secret key, admin password, database credentials, and any TLS, custom CA, and receptor secrets
   * - ``awx_object``
     - The Ascender resource specification

Project files are not included. Projects that sync from source control are fetched again after a restore, so they need nothing. Manual projects, whose files exist only on the volume, need backing up separately.

The secret key in ``secrets.yml`` is what makes the database readable. Restore it alongside the database and stored credentials work; restore the database on its own against a new deployment and every credential in it is unreadable, with no way to recover them.

Backing up with the installer
==============================

Run the backup from the ``ascender-install`` directory, with the ``custom.config.yml`` you installed with::

	./setup.sh -b

The files land in ``ascender_install_artifacts/backups/``, in a timestamped directory, with a ``current`` symlink pointing at the newest. Copy that directory somewhere off the machine, because nothing does it for you, and treat it as credentials when you do.

See `Backup and restore <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/backup_restore.md>`_ in the installer repository for the full procedure.

.. note::

	A backup needs a running deployment, because it executes commands inside a live task pod. Take them routinely rather than reaching for one after something has already broken.

Restoring with the installer
=============================

Restore reads from ``ascender_install_artifacts/backups/current``, so put the backup you want there first::

	./setup.sh -r

.. warning::

	Restoring is destructive. It scales the deployment down, deletes the PostgreSQL volume, and rebuilds the database from the backup. It also replaces the current administrator password with the one from the backup. There is no confirmation prompt.

After a restore, confirm the pods come back and sign in with the administrator credentials from the backup, not the ones you were using before. If you are restoring into a disaster recovery deployment that should not run jobs, disable schedules before it starts reconciling.

To restore onto a rebuilt or replacement machine, see `Restoring onto a rebuilt k3s node <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/backup_restore.md>`_ in the installer repository, or `Restoring onto a new cluster`_ below.

Backing up and restoring manually
===================================

To back up and restore by hand, create the operator's ``AWXBackup`` and ``AWXRestore`` resources yourself. This is what ``ascender-install`` does on your behalf, with the addition of copying the files off the cluster.

Taking a backup
----------------

Create an ``AWXBackup`` naming the deployment to back up::

	apiVersion: awx.ansible.com/v1beta1
	kind: AWXBackup
	metadata:
	  name: ascender-backup-2026-08-28
	  namespace: ascender
	spec:
	  deployment_name: ascender-app
	  backup_storage_requirements:
	    requests:
	      storage: 20Gi

Give each backup a distinct name, with the date in it. Re-applying an existing ``AWXBackup`` updates that resource rather than producing a new backup, and the resources stay in the namespace as the record of what you have.

``deployment_name`` is the only required field. The operator creates a persistent volume claim named ``<deployment_name>-backup-claim`` unless you point ``backup_pvc`` at one you made yourself. Set ``backup_storage_requirements``, because the default is empty and leaves the size to whatever your storage class does with an unset value.

Apply it and wait for the operator to finish::

	kubectl apply -f backup.yml
	kubectl get awxbackup ascender-backup-2026-08-28 -n ascender -o yaml

The backup is complete when ``status.backupDirectory`` and ``status.backupClaim`` are populated. The directory is timestamped, so the claim accumulates one per run.

Copying a backup off the cluster
---------------------------------

The operator writes to the claim and stops there. To get the files out, run a pod that mounts the claim and copy from it::

	kubectl run backup-access -n ascender --image=busybox:stable --restart=Never \
	  --overrides='{"spec":{"containers":[{"name":"backup-access","image":"busybox:stable","command":["sleep","3600"],"volumeMounts":[{"name":"backup","mountPath":"/backups"}]}],"volumes":[{"name":"backup","persistentVolumeClaim":{"claimName":"ascender-app-backup-claim"}}]}}'

	BACKUP_DIR=$(kubectl get awxbackup ascender-backup-2026-08-28 -n ascender \
	  -o jsonpath='{.status.backupDirectory}')

	kubectl cp ascender/backup-access:$BACKUP_DIR ./ascender-backup
	kubectl delete pod backup-access -n ascender

.. note::

	A backup is a set of credentials. ``secrets.yml`` holds the secret key, the administrator password, the database credentials, and any TLS private keys, all recoverable in plain text. Once it is off the cluster it has none of the protection a Kubernetes secret gave it, so store it where you would store those credentials, restrict who can read it, and keep it out of source control and shared drives.

Restoring from a backup resource
---------------------------------

Restore rebuilds the deployment from the backup, so remove the old one first. Confirm you have a copy of the backup off the cluster before you start.

Find the database volume claim. Its name is derived from the PostgreSQL version and the deployment name, so read it rather than assuming it::

	kubectl get pvc -n ascender

Then delete the Ascender resource and that claim::

	kubectl delete awx ascender-app -n ascender
	kubectl delete pvc postgres-15-ascender-app-postgres-15-0 -n ascender

.. warning::

	Do not delete the namespace. The backup claim lives in it, so removing the namespace destroys the backup you are about to restore from.

Then create an ``AWXRestore`` pointing at the backup::

	apiVersion: awx.ansible.com/v1beta1
	kind: AWXRestore
	metadata:
	  name: ascender-restore
	  namespace: ascender
	spec:
	  deployment_name: ascender-app
	  backup_name: ascender-backup-2026-08-28

Naming ``backup_name`` works when the original ``AWXBackup`` resource is still in the cluster, because the operator reads the claim and directory from its status.

Apply it and watch::

	kubectl apply -f restore.yml
	kubectl get pods -n ascender -w

The operator applies the secrets first, then recreates the Ascender resource from the backed-up specification, then loads the database. Applying the secrets before the resource is what preserves the secret key, so the restored deployment can still read its own credentials.

Restoring onto a new cluster
-----------------------------

After losing a cluster, there is no ``AWXBackup`` resource to name, so point the restore at the files directly.

Install the operator and create the namespace first, as described in :ref:`in_manual_install`.

Create a claim to hold the backup. On a new cluster nothing has made one yet, so this is the same shape the operator would have created::

	kubectl apply -n ascender -f - <<'EOF'
	apiVersion: v1
	kind: PersistentVolumeClaim
	metadata:
	  name: ascender-app-backup-claim
	spec:
	  accessModes:
	    - ReadWriteOnce
	  resources:
	    requests:
	      storage: 20Gi
	EOF

Add ``storageClassName`` if the cluster has no default. Size it for the database dump, not the deployment.

Copy the files onto the claim, which is the reverse of getting them off::

	kubectl run backup-access -n ascender --image=busybox:stable --restart=Never \
	  --overrides='{"spec":{"containers":[{"name":"backup-access","image":"busybox:stable","command":["sleep","3600"],"volumeMounts":[{"name":"backup","mountPath":"/backups"}]}],"volumes":[{"name":"backup","persistentVolumeClaim":{"claimName":"ascender-app-backup-claim"}}]}}'

	kubectl cp ./ascender-backup ascender/backup-access:/backups/ascender-restore
	kubectl delete pod backup-access -n ascender

Then name the claim and the directory instead of a backup::

	apiVersion: awx.ansible.com/v1beta1
	kind: AWXRestore
	metadata:
	  name: ascender-restore
	  namespace: ascender
	spec:
	  deployment_name: ascender-app
	  backup_pvc: ascender-app-backup-claim
	  backup_dir: /backups/ascender-restore

``backup_dir`` is an absolute path, because the operator mounts the claim at ``/backups`` and checks that the directory exists before it starts. The three files must sit directly inside it.

Apply it the same way. The restored deployment takes its name from ``deployment_name`` and its configuration from the ``awx_object`` file in the backup, so it comes back as it was rather than as a fresh install.

External databases
===================

.. warning::

	Backup and restore cover the database the operator manages. If you set ``ASCENDER_PGSQL_HOST`` to use your own PostgreSQL server, restore stops without doing anything, and backup runs without capturing your database. Back up an external database with your own tooling, and keep ``secrets.yml`` from an Ascender backup alongside it so the secret key survives.
