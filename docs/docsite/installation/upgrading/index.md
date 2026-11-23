---
title: Upgrading
description: Upgrade Ascender and its components by updating the installer configuration and running the installer again.
weight: 30
---

You upgrade Ascender the same way you install it: update the versions in `custom.config.yml` and run `./setup.sh` again. The installer applies only what changed, and the Ascender Operator performs the Ascender upgrade, including database migrations. Downtime is usually a few minutes while new pods replace old ones.

## Before you upgrade

- Back up Ascender with `./setup.sh -b`. See [Backup](/admin-guide/backup).
- Keep the `custom.config.yml` from your installation. It contains the passwords and settings the components need.
- Read the release notes for the target versions, including the [Ascender releases](https://github.com/ctrliq/ascender/releases) on GitHub and the Ascender [release notes](/release-notes), and check the [upgrade considerations](/admin-guide/upgrade-considerations).
- Try the upgrade in a test environment first.

## Update the installer

Pull the latest installer to pick up fixes and support for new versions. `custom.config.yml` is not tracked by Git, so it is not overwritten:

```bash
cd ascender-install
git pull
```

Compare `default.config.yml` with your `custom.config.yml` after pulling, and copy over any new settings you need.

## Set the versions

Set the versions you want in `custom.config.yml`:

```yaml
ASCENDER_VERSION: 25.6.3
ASCENDER_OPERATOR_VERSION: 25.6.3
LEDGER_VERSION: latest
PROXY_VERSION: latest
```

- `ASCENDER_VERSION` is a tag from [Ascender releases](https://github.com/ctrliq/ascender/releases). Pin it to a specific version rather than `latest`.
- `ASCENDER_OPERATOR_VERSION` is a tag from [Ascender Operator releases](https://github.com/ctrliq/ascender-operator/releases). Operator releases use the same version numbers as Ascender. If you do not set it, the installer uses its own default, which changes when you update the installer.
- The component versions default to `latest`. When a component's version is `latest` and its manifests have not changed, running the installer restarts the component's pods so they pull the newest images. To move a component to a specific release, set its version to that tag.

Leave `ascender_image_pull_policy` at `Always` (the default) so the newest images for a tag are pulled. Set `download_kubeconfig: false` if your kubeconfig is already in place. On K3s, `kube_install` can be `false`, since the cluster already exists.

## Run the installer

```bash
./setup.sh
```

## Verify the upgrade

Check that the new pods are running:

```bash
kubectl get pods -n ascender
```

Then confirm the version in Ascender's **About** dialog, or check the image of the web pod:

```bash
kubectl get deployment ascender-app-web -n ascender -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'
```

Check the other components' namespaces in the same way, and log in to each component.

## Restart without the installer

If a component runs the `latest` tag with the `Always` pull policy, you can also pick up new images with a rollout restart. Running the installer is the recommended method, because it also applies configuration changes.

```bash
kubectl rollout restart deployment/ascender-app-web deployment/ascender-app-task -n ascender
kubectl rollout restart deployment/web deployment/parser deployment/db -n ledger
kubectl rollout restart deployment/ascender-galaxy-proxy -n ascender
```

## Upgrade PostgreSQL from an older installation

Current versions run the Ascender database on the `quay.io/sclorg/postgresql-15-c9s` image. If the installer finds an older installation that still uses the `docker.io/postgres:13` or `docker.io/postgres:15` image, it stops with this message:

```text
Old version of postgres detected. Please run upgrade postgres playbook.  ansible-playbook playbooks/upgrade_postgres.yml
```

The upgrade playbook asks for confirmation, then:

1. Scales down the Ascender Operator, web, and task deployments.
2. Dumps the database with `pg_dumpall` and copies the dump to `tmp_dir` on the control machine.
3. Deletes the PostgreSQL StatefulSet, the web and task deployments, and the PostgreSQL volume.
4. Applies the Ascender deployment and operator again, waits for the web deployment, and restores the dump into the new database.

Back up Ascender and keep a copy of the dump before you continue, because the playbook deletes the original database volume. The playbook re-applies the K3s version of the Ascender manifest, so use it on K3s installations; on other platforms, contact CIQ support. Run it from the repository root, then run the installer again:

```bash
ansible-playbook playbooks/upgrade_postgres.yml
./setup.sh
```

## Offline installations

Build a new offline bundle with the new versions on the staging host, transfer it, and run the installer. See [Upgrade an offline installation](../offline#upgrade-an-offline-installation).
