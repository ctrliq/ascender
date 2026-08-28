.. _in_install:

*************************
Installation Guide
*************************

.. index::
   single: installation
   pair: installation; ascender-install
   pair: installation; configuration

`ascender-install <https://github.com/ctrliq/ascender-install>`_ is the supported way to deploy Ascender. It runs Ansible under the hood, driven by a single configuration file, and handles cluster provisioning where supported, the Ascender Operator, and the Ascender resource itself.

To evaluate Ascender on a single machine, start with :ref:`in_quick_start_k3s`.

What the installer does
========================

Running ``./setup.sh`` performs these steps on your behalf:

- Installs its own dependencies, including ansible-core, the required collections, and the Python Kubernetes client
- Provisions the cluster, on K3s and RKE2 only, when ``kube_install`` is set
- Deploys the Ascender Operator with Kustomize, pinned to ``ASCENDER_OPERATOR_VERSION``
- Creates the namespace, the administrator password secret, and any TLS, custom CA, or external database secrets your configuration calls for
- Creates the Ascender resource that the operator reconciles into a running deployment

Understanding these steps is useful even if you never run the installer, because :ref:`in_manual_install` covers doing them yourself.

Requirements
=============

The machine you run the installer from needs Rocky Linux 8 or 9 on x86_64, ``git``, and root or sudo access. The installer refuses to run on other distributions and on non-x86_64 hosts. Cloud platforms require Rocky Linux 9 and the relevant CLI tool, authenticated.

For on-premise deployments on K3s or RKE2, this can be the same machine that runs the cluster. For EKS, GKE, and AKS, use a small administrative host.

Getting started
================

Clone the installer::

	git clone https://github.com/ctrliq/ascender-install.git
	cd ascender-install

Create ``custom.config.yml`` with the settings for your deployment. Use ``default.config.yml`` as a reference for the available options rather than a starting point, as it contains settings for every platform and needs heavy editing. The repository also ships ``config_vars.sh``, which generates a configuration file through a series of prompts.

Install with::

	sudo ./setup.sh

Platforms
==========

**K3s** is covered in :ref:`in_quick_start_k3s`. Set ``kube_install: true`` and the installer creates the cluster.

**RKE2** suits production and supports single-node and highly available clusters. The installer does not create an RKE2 cluster, so build it first and then run the installer against it.

**EKS, GKE, and AKS** each require their own CLI tool, IAM or role configuration, and a DNS zone. Cloud installs require Rocky Linux 9 on the administrative host.

**DKP** needs one extra setting, ``DKP_CLUSTER_NAME``, naming the cluster to deploy to or create.

**OCP** follows the common configuration. Check ``default.config.yml`` for OpenShift-specific defaults.

Upgrading
==========

Pull the latest installer first so you pick up any fixes, then raise ``ASCENDER_VERSION``, and ``ASCENDER_OPERATOR_VERSION`` if it also changed, and re-run::

	git pull
	sudo ./setup.sh

The upgrade is carried out by the Ascender Operator.

.. note::

	The operator and Ascender are released independently. Ascender releases are at `ctrliq/ascender <https://github.com/ctrliq/ascender/releases>`_ and operator releases at `ctrliq/ascender-operator <https://github.com/ctrliq/ascender-operator/releases>`_.

Configuration reference
========================

Kubernetes platform
--------------------

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Variable
     - Default
     - Description
   * - ``k8s_platform``
     - ``k3s``
     - Target platform. One of ``k3s``, ``eks``, ``aks``, ``gke``, ``rke2``, ``dkp``, ``ocp``
   * - ``k8s_lb_protocol``
     - ``http``
     - Load balancer protocol. Set to ``https`` to enable TLS, which requires the certificate settings below
   * - ``download_kubeconfig``
     - ``false``
     - Copy the kubeconfig from the target host to ``~/.kube/config`` on the installing machine

Ascender application
---------------------

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Variable
     - Default
     - Description
   * - ``ASCENDER_HOSTNAME``
     - ``ascender.example.com``
     - DNS-resolvable hostname for the web interface. Required
   * - ``ASCENDER_DOMAIN``
     - ``example.com``
     - Base domain for all components. Required on EKS, GKE, and AKS, and unused on K3s and RKE2
   * - ``ASCENDER_NAMESPACE``
     - ``ascender``
     - Namespace for Ascender objects
   * - ``ASCENDER_ADMIN_USER``
     - ``admin``
     - Administrator username
   * - ``ASCENDER_ADMIN_PASSWORD``
     - ``myadminpassword``
     - Administrator password. Change this before installing
   * - ``ASCENDER_IMAGE``
     - ``ghcr.io/ctrliq/ascender``
     - Container image. Change only when using an internal registry
   * - ``ASCENDER_VERSION``
     - ``25.5.1``
     - Tag applied to ``ASCENDER_IMAGE``
   * - ``ASCENDER_OPERATOR_VERSION``
     - ``25.5.1``
     - Version of the Ascender Operator
   * - ``ascender_replicas``
     - ``1``
     - Number of Ascender web pods
   * - ``ascender_garbage_collect_secrets``
     - ``true``
     - When true, the administrator password, secret key, and database credential secrets are deleted if the Ascender resource is removed. Set to ``false`` to keep them
   * - ``ascender_setup_playbooks``
     - ``true``
     - Deploy demonstration playbooks after installation
   * - ``ascender_image_pull_policy``
     - ``Always``
     - Image pull policy. Set to ``Never`` for offline installs
   * - ``ASCENDER_MESH_HOSTNAME``
     - unset
     - Hostname for Automation Mesh. Mesh is not configured unless this is set

.. warning::

	``ascender_garbage_collect_secrets`` controls whether Kubernetes deletes the secrets when the Ascender resource is removed. Those secrets include the secret key that encrypts stored credentials. Losing them makes an existing database unreadable, so set this to ``false`` where preserving a deployment matters more than tidy cleanup.

TLS
----

Required when ``k8s_lb_protocol`` is ``https``. Certificate handling differs on cloud platforms.

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Variable
     - Default
     - Description
   * - ``tls_crt_path``
     - ``~/ascender.crt``
     - Certificate file in PEM format
   * - ``tls_key_path``
     - ``~/ascender.key``
     - Private key file in PEM format
   * - ``custom_cacert_bundle``
     - unset
     - CA bundle containing your CA certificate and any external CA certificates
   * - ``custom_ldap_cacert``
     - unset
     - LDAP CA certificate

Set the certificate paths to ``"{{ playbook_dir }}/../ascender.crt"`` and the matching key when you keep the files in the ``ascender-install`` directory.

External database
------------------

Ascender deploys its own PostgreSQL instance by default. To use an existing server, set the following.

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Variable
     - Default
     - Description
   * - ``ASCENDER_PGSQL_HOST``
     - unset
     - PostgreSQL hostname or address
   * - ``ASCENDER_PGSQL_PORT``
     - ``5432``
     - Port
   * - ``ASCENDER_PGSQL_USER``
     - ``ascender``
     - Username
   * - ``ASCENDER_PGSQL_PWD``
     - unset
     - Password
   * - ``ASCENDER_PGSQL_DB``
     - ``ascenderdb``
     - Database name, which must already exist

.. warning::

	The PostgreSQL password cannot contain special characters. This is a limitation of how the installer passes the password through its configuration.

Storage for the built-in PostgreSQL instance is set with ``POSTGRES_PVC_SIZE_GB`` and ``POSTGRES_STORAGE_CLASS``. Both apply to new installations only. Changing either on an existing deployment does not resize or move the volume.

Execution environments
-----------------------

To pull additional images for use as execution environments, add an ``ee_images`` list. Each entry takes a ``name`` used as a label and an ``image`` giving the full registry path::

	ee_images:
	  - name: my-custom-ee
	    image: registry.example.com/namespace/my-custom-ee:latest

Offline installation
---------------------

These apply to air-gapped deployments on K3s and RKE2.

.. list-table::
   :widths: 35 20 45
   :header-rows: 1

   * - Variable
     - Default
     - Description
   * - ``k8s_offline``
     - ``false``
     - Use local assets rather than pulling from the internet
   * - ``k8s_container_registry``
     - empty
     - Internal registry and namespace holding the Ascender and operator images. Also sets the operator image path
   * - ``k8s_image_pull_secret``
     - ``None``
     - Secret holding credentials for that registry. Leave as ``None`` when no authentication is needed
   * - ``k8s_ee_pull_credentials_secret``
     - ``None``
     - Secret holding credentials for the registry serving execution environment images

Artifacts
----------

``tmp_dir`` sets where the installer writes generated manifests, backups, and temporary files, and defaults to ``ascender_install_artifacts/`` inside the cloned repository.
