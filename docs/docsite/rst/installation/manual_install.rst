.. _in_manual_install:

**********************************
Installing without the installer
**********************************

.. index::
   single: installation
   pair: installation; Kustomize
   pair: installation; operator

You can deploy the Ascender Operator and create the Ascender resource yourself, without `ascender-install <https://github.com/ctrliq/ascender-install>`_. Use this path when you manage your own cluster, deploy through GitOps tooling such as Argo CD or Flux, or run on a host the installer does not support.

The installer is the supported path and does more for you, including provisioning the cluster on K3s and RKE2. See :ref:`in_install`.

The deployment is two steps: install the operator, then create an ``AWX`` resource for the operator to reconcile.

Requirements
=============

- A running Kubernetes cluster and a ``kubectl`` context pointing at it
- A default storage class, used for the database volume
- An ingress controller, if you want to reach Ascender by hostname
- ``kubectl`` 1.14 or later, which includes Kustomize

Install the operator
=====================

Create a ``kustomization.yaml``, replacing ``25.5.1`` with the version you want from the `operator releases <https://github.com/ctrliq/ascender-operator/releases>`_::

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

This creates the namespace, the ``awxs``, ``awxbackups``, and ``awxrestores`` custom resource definitions, the service account and roles, and the controller deployment. Confirm the operator is running::

	kubectl get pods -n ascender

Create the administrator secret
================================

The operator generates most of its own secrets, but the administrator password is worth supplying so you know it::

	apiVersion: v1
	kind: Secret
	metadata:
	  name: ascender-app-admin-password
	  namespace: ascender
	stringData:
	  password: <change-me>

Create the Ascender resource
=============================

The resource is ``kind: AWX``, not an Ascender-named kind. The operator keeps the upstream API group, so all three custom resources are under ``awx.ansible.com/v1beta1``.

The following is a working starting point for a cluster with an ingress controller::

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
	  hostname: ascender.example.com
	  postgres_data_volume_init: true
	  init_postgres_extra_commands: |
	    chown 26:0 /var/lib/pgsql/data
	    chmod 700 /var/lib/pgsql/data
	  extra_settings:
	  - setting: CSRF_TRUSTED_ORIGINS
	    value:
	      - https://ascender.example.com

Apply it and watch the operator build the deployment::

	kubectl apply -f ascender.yml
	kubectl get pods -n ascender -w

.. note::

	``postgres_data_volume_init`` and the accompanying commands set ownership on the database volume. Many storage classes provision volumes owned by root, which the PostgreSQL container cannot write to. Omit both on OpenShift, where they are not needed and not supported.

Set ``CSRF_TRUSTED_ORIGINS`` to the URL you actually reach Ascender on. Without it, signing in fails with a CSRF error even though the pods are healthy.

TLS
====

To terminate TLS at the ingress, create a secret holding the certificate and reference it from the resource::

	kubectl create secret tls ascender-tls-secret -n ascender \
	  --cert=ascender.crt --key=ascender.key

Then add ``ingress_tls_secret: ascender-tls-secret`` to the spec, and use the ``https`` URL in ``CSRF_TRUSTED_ORIGINS``.

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

The database must already exist. When you supply this secret, omit ``postgres_data_volume_init`` and the initialization commands, which apply only to the managed database.

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

.. warning::

	The secret key encrypts every credential Ascender stores. A database restored alongside a different secret key leaves those credentials unreadable, and there is no way to recover them. Capture these secrets somewhere safe before you need them, and keep them with any database backup you take.

Verifying
==========

The deployment is up when the task and web pods are running::

	kubectl get pods -n ascender

If pods do not start, the operator log usually says why::

	kubectl logs -n ascender deployment/ascender-operator-controller-manager

Reconcile errors also surface on the resource itself::

	kubectl describe awx ascender-app -n ascender
