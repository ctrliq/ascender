.. _in_manual_install:

**********************************
Installing without the installer
**********************************

.. index::
   single: installation
   pair: installation; Kustomize
   pair: installation; operator

`ascender-install <https://github.com/ctrliq/ascender-install>`_ is the best way to install Ascender. It does considerably more for you than the steps below, including provisioning the cluster on K3s, so start there if you can. See :ref:`in_install`.

This page covers deploying the operator and creating the Ascender resource by hand, for readers who manage their own cluster or deploy through GitOps tooling.

The deployment is two steps: install the operator, then create an ``AWX`` resource for the operator to reconcile.

Requirements
=============

- A running Kubernetes cluster and a ``kubectl`` context pointing at it
- A default storage class, used for the database volume
- An ingress controller, if you want to reach Ascender by hostname
- ``kubectl`` 1.14 or later, which includes Kustomize

Install the operator
=====================

In an empty directory, create ``kustomization.yaml``, replacing ``25.5.1`` with the version you want from the `operator releases <https://github.com/ctrliq/ascender-operator/releases>`_::

	apiVersion: kustomize.config.k8s.io/v1beta1
	kind: Kustomization
	resources:
	  - github.com/ctrliq/ascender-operator/config/default?ref=25.5.1

	images:
	  - name: ghcr.io/ctrliq/ascender-operator
	    newTag: 25.5.1

	namespace: ascender

Apply it::

	kubectl apply -k .

.. note::

	The ``ref`` pins the manifests and the ``newTag`` pins the image, and they are separate. Setting only the ``ref`` leaves the operator running whatever image tag the manifests carry, so keep both at the same version.

This creates the namespace, the ``awxs``, ``awxbackups``, ``awxrestores``, and ``awxmeshingresses`` custom resource definitions, the service account and roles, and the controller deployment. Confirm the operator is running::

	kubectl get pods -n ascender

Create the administrator secret
================================

Supply the administrator password yourself so you know what it is. The operator generates one otherwise::

	kubectl create secret generic ascender-app-admin-password -n ascender \
	  --from-literal=password=<password>

The key must be ``password``. The operator looks for a secret named after the Ascender resource, so ``ascender-app-admin-password`` is found automatically for a resource named ``ascender-app``.

Create the TLS secret
======================

Terminate TLS at the ingress with a certificate for the hostname you will use::

	kubectl create secret tls ascender-tls-secret -n ascender \
	  --cert=ascender.crt --key=ascender.key

Create the Ascender resource
=============================

The following is a working starting point for a cluster with an ingress controller. Save it as ``ascender.yml``::

	apiVersion: awx.ansible.com/v1beta1
	kind: AWX
	metadata:
	  name: ascender-app
	  namespace: ascender
	spec:
	  image: ghcr.io/ctrliq/ascender
	  image_version: 25.5.1
	  init_container_image: ghcr.io/ctrliq/ascender-ee
	  init_container_image_version: 25.5.1
	  control_plane_ee_image: ghcr.io/ctrliq/ascender-ee:25.5.1
	  postgres_image: quay.io/sclorg/postgresql-15-c9s
	  postgres_image_version: "latest"
	  redis_image: ghcr.io/valkey-io/valkey
	  redis_image_version: "9-alpine"
	  replicas: 1
	  admin_user: admin
	  admin_password_secret: ascender-app-admin-password
	  service_type: ClusterIP
	  ingress_type: ingress
	  ingress_path: "/"
	  ingress_path_type: Prefix
	  ingress_class_name: nginx
	  ingress_tls_secret: ascender-tls-secret
	  hostname: ascender.example.com
	  postgres_data_volume_init: true
	  postgres_storage_class: <storage-class>
	  postgres_storage_requirements:
	    requests:
	      storage: 20Gi
	  extra_settings:
	  - setting: CSRF_TRUSTED_ORIGINS
	    value:
	      - https://ascender.example.com

Apply it and watch the operator build the deployment::

	kubectl apply -f ascender.yml
	kubectl get pods -n ascender -w

.. note::

	``postgres_data_volume_init`` sets ownership on the database volume with an init container. Many storage classes provision volumes owned by root, which the PostgreSQL container cannot write to. The operator's default commands already do the right thing, so you rarely need ``postgres_init_container_commands``. OpenShift manages volume ownership itself.

``ingress_class_name`` and ``postgres_storage_class`` both fall back to the cluster default when unset. Name them explicitly if the cluster has more than one, or no default. List what is available with ``kubectl get ingressclass`` and ``kubectl get storageclass``.

The resource accepts far more than this example uses. Every field is described in the custom resource definition, which you can read from the cluster::

	kubectl explain awx.spec
	kubectl explain awx.spec.postgres_storage_class

The Ascender Operator repository documents individual topics in more depth under `advanced configuration <https://github.com/ctrliq/ascender-operator/tree/devel/docs/user-guide/advanced-configuration>`_, covering things like persisting the projects directory, security contexts, node assignment, and horizontal pod autoscaling.

Set ``CSRF_TRUSTED_ORIGINS`` to the URL you actually reach Ascender on, scheme included. Without it, signing in can fail with a CSRF error even though the pods are healthy, because the scheme Django computes behind an ingress does not always match the one the browser sent.

Pin ``image_version``. Left unset, the operator falls back to ``latest``, so the version you get depends on when the image was last pushed.

Using an external database
===========================

By default the operator deploys and manages PostgreSQL. To point at an existing server, create a secret describing it and reference it from the spec with ``postgres_configuration_secret``::

	apiVersion: v1
	kind: Secret
	metadata:
	  name: ascender-app-postgres-configuration
	  namespace: ascender
	stringData:
	  host: postgres.example.com
	  port: '5432'
	  database: ascenderdb
	  username: ascender
	  password: <password>
	  sslmode: prefer
	  type: unmanaged
	type: Opaque

Apply it with ``kubectl apply -f postgres-secret.yml``. The database must already exist. When you supply this secret, omit ``postgres_data_volume_init`` and the initialization commands, which apply only to the managed database.

Secrets the operator generates
===============================

Unless you supply them, the operator creates these secrets on first reconcile:

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Secret
     - Contents
   * - ``ascender-app-secret-key``
     - The key that encrypts credentials stored in the database
   * - ``ascender-app-admin-password``
     - Administrator password, if you did not create it yourself
   * - ``ascender-app-postgres-configuration``
     - Connection details for the managed database
   * - ``ascender-app-broadcast-websocket``
     - Shared secret used between web pods
   * - ``ascender-app-receptor-ca``
     - Certificate authority for the automation mesh
   * - ``ascender-app-receptor-work-signing``
     - Key used to sign mesh work units

.. warning::

	The secret key encrypts every credential Ascender stores. A database restored alongside a different secret key leaves those credentials unreadable, and there is no way to recover them. Capture these secrets somewhere safe before you need them, and keep them with any database backup you take.

Verifying
==========

The deployment is up when the task and web pods are running::

	kubectl get pods -n ascender

If pods do not start, the operator log usually says why::

	kubectl logs -n ascender deployment/awx-operator-controller-manager

Reconcile errors also surface on the resource itself::

	kubectl describe awx ascender-app -n ascender
