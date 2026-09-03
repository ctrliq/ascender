.. _in_install:

*************************
Installation Guide
*************************

.. index::
   single: installation
   pair: installation; ascender-install
   pair: installation; configuration

`ascender-install <https://github.com/ctrliq/ascender-install>`_ is the best way to deploy Ascender. It runs Ansible under the hood, driven by a single configuration file, and handles cluster provisioning where supported, the Ascender Operator, and the Ascender resource itself.

To evaluate Ascender on a single machine, start with :ref:`in_quick_start_k3s`.

What the installer does
========================

When you run ``./setup.sh``, it:

- Installs its own dependencies, including ansible-core, the required collections, and the Python Kubernetes client
- Provisions the cluster, on K3s only, when you set ``kube_install``
- Stops and disables ``firewalld``, unless you set ``firewalld_disable: false``
- Deploys the Ascender Operator with Kustomize, pinned to ``ASCENDER_OPERATOR_VERSION``
- Creates the namespace, the administrator password secret, and any TLS, custom CA, or external database secrets your configuration calls for
- Creates the Ascender resource that the operator reconciles into a running deployment

Requirements
=============

You run the installer from a machine with ``git``, ``openssl``, and root or sudo access, on x86_64. Supported hosts are Enterprise Linux 8 or 9 such as Rocky Linux, or Ubuntu or Debian 24 or 26.

Unless the machine is also a cluster node, as it is when the installer builds a K3s cluster on it, this is only an administrative host. It runs the install and takes no part in the cluster afterwards, so a small VM is enough. Keep it around, along with the configuration file you used, because upgrades run from the same place.

For EKS, GKE, and AKS you need Enterprise Linux 9 specifically, plus the relevant CLI tool authenticated. Ubuntu and Debian are not supported for those three.

Getting started
================

Clone the installer::

	git clone https://github.com/ctrliq/ascender-install.git
	cd ascender-install

Create ``custom.config.yml`` with the settings for your deployment. Do not copy ``default.config.yml`` as a starting point, as it carries settings for every platform.

Install with::

	sudo ./setup.sh

Platforms
==========

Eight platforms are supported. Each has its own guide in the installer repository, with a working sample configuration file alongside it.

K3s is the only platform where the installer builds the cluster, with ``kube_install: true``. On the cloud platforms it can create the cluster through the provider's API when you set the matching ``*_CLUSTER_STATUS`` to ``provision``. Everywhere else, RKE2 included, the cluster must already exist before you run the installer.

.. list-table::
   :widths: 20 55 25
   :header-rows: 1

   * - Platform
     - Notes
     - Guide
   * - K3s
     - Single node, and the installer builds the cluster. The shortest path from a bare machine to a running Ascender
     - `K3s <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/k3s/README.md>`_
   * - RKE2
     - Single node or highly available. You build the cluster, then run the installer against it
     - `RKE2 <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/rke2/README.md>`_
   * - Amazon EKS
     - Needs the AWS CLI configured as root and an ACM certificate covering your hostnames
     - `EKS <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/eks/README.md>`_
   * - Google GKE
     - Needs the ``gcloud`` CLI authenticated and a project to deploy into
     - `GKE <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/gke/README.md>`_
   * - Azure AKS
     - Needs the ``az`` CLI authenticated
     - `AKS <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/aks/README.md>`_
   * - DKP
     - Takes one extra setting, ``DKP_CLUSTER_NAME``
     - `DKP <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/dkp/README.md>`_
   * - TKGI
     - Follows the common configuration
     - `TKGI <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/tkgi/README.md>`_
   * - OpenShift
     - Follows the common configuration
     - `OCP <https://github.com/ctrliq/ascender-install/blob/main/docs/installation/ocp/README.md>`_

To install onto a Kubernetes cluster you manage yourself, such as kubeadm, Rancher, or Tanzu, use ``k8s_platform: rke2``. It is the most general of the platform types and assumes the cluster is already running, with an ingress controller, a default storage class, and a kubeconfig at ``~/.kube/config`` readable by root.

For a worked K3s example with a self-signed certificate, see :ref:`in_quick_start_k3s`.

Upgrading
==========

Pull the latest installer first so you pick up any fixes, then raise ``ASCENDER_VERSION``, and ``ASCENDER_OPERATOR_VERSION`` if it also changed, and re-run::

	git pull
	sudo ./setup.sh

The upgrade is carried out by the Ascender Operator. See `Upgrading <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/upgrading.md>`_ for the detail, and `Uninstalling <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/uninstall.md>`_ to remove a deployment.

.. note::

	The operator and Ascender are released independently. Ascender releases are at `ctrliq/ascender <https://github.com/ctrliq/ascender/releases>`_ and operator releases at `ctrliq/ascender-operator <https://github.com/ctrliq/ascender-operator/releases>`_.

Configuration
==============

``default.config.yml`` in the installer documents every available setting, and each platform guide above ships a working sample configuration alongside it. ``config_vars.sh`` will generate a configuration file through a series of prompts.

At minimum you set ``k8s_platform``, ``ASCENDER_HOSTNAME``, and ``ASCENDER_ADMIN_PASSWORD``. Note that ``k8s_platform`` defaults to ``eks``, so set it explicitly even for K3s.

.. warning::

	``ascender_garbage_collect_secrets`` defaults to ``true``, which deletes the Kubernetes secrets when the Ascender resource is removed. Those include the secret key that encrypts stored credentials, and without it an existing database is unreadable. Set it to ``false`` where preserving a deployment matters more than tidy cleanup.

.. warning::

	An external PostgreSQL password cannot contain special characters. This is a limitation of how the installer passes it through its configuration.

The installer repository also documents `automation mesh <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/automation_mesh.md>`_, `changing hostnames <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/changing_hostnames.md>`_, and `backup and restore <https://github.com/ctrliq/ascender-install/blob/main/docs/configuration/backup_restore.md>`_.
