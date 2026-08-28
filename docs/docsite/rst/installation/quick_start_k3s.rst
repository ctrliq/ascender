.. _in_quick_start_k3s:

*************************
Quick Start on K3s
*************************

.. index::
   single: installation
   pair: installation; K3s
   pair: installation; quick start

K3s is the fastest way to get a working Ascender instance. The installer provisions a single-node K3s cluster and deploys Ascender onto it, so no existing Kubernetes cluster is required.

This procedure produces an evaluation deployment on one machine. For production, see :ref:`in_install`.

Requirements
=============

The machine you install on needs:

- 2 CPUs
- 8 GB memory
- 20 GB free in ``/var``
- Rocky Linux 8 or 9 on x86_64
- ``git``, installed with ``sudo dnf install -y git``
- Root or sudo access

Get the installer
==================

Clone the installer and change into it::

	git clone https://github.com/ctrliq/ascender-install.git
	cd ascender-install

Create a certificate
=====================

Generate a self-signed certificate. Run this from inside the ``ascender-install`` directory so the installer finds the files without further configuration. Replace ``<SERVER-IP>`` with the address of your machine::

	openssl req -x509 -newkey rsa:4096 -keyout ascender.key -out ascender.crt -days 365 -nodes \
	  -subj "/CN=ascender.<SERVER-IP>.nip.io" \
	  -addext "subjectAltName=DNS:ascender.<SERVER-IP>.nip.io"

.. note::

	This quick start uses `nip.io <https://nip.io>`_, a public wildcard DNS service, so that ``ascender.<SERVER-IP>.nip.io`` resolves to your machine with no DNS setup. Use your own hostname for anything beyond an evaluation.

Configure the deployment
=========================

Create ``custom.config.yml`` in the ``ascender-install`` directory, again replacing ``<SERVER-IP>``::

	k8s_platform: k3s
	k8s_lb_protocol: https
	kube_install: true
	download_kubeconfig: true
	k3s_master_node_ip: "<SERVER-IP>"

	tls_crt_path: "{{ playbook_dir }}/../ascender.crt"
	tls_key_path: "{{ playbook_dir }}/../ascender.key"

	ASCENDER_HOSTNAME: ascender.<SERVER-IP>.nip.io
	ASCENDER_NAMESPACE: ascender
	ASCENDER_ADMIN_USER: admin
	ASCENDER_ADMIN_PASSWORD: "<change-me>"
	ASCENDER_VERSION: 25.5.1
	ASCENDER_OPERATOR_VERSION: 25.5.1

	ascender_setup_playbooks: true

Set ``ASCENDER_ADMIN_PASSWORD`` before you install. ``default.config.yml`` lists every available setting, but do not copy it wholesale, as it carries defaults for every supported platform.

.. note::

	``kube_install: true`` tells the installer to build the K3s cluster for you. This is specific to K3s and RKE2. On every other platform the cluster must already exist.

Install
========

Run the installer from the same machine. The default ``inventory`` file targets ``localhost``, so it needs no changes::

	sudo ./setup.sh

A successful run ends with::

	ASCENDER SUCCESSFULLY SETUP

Verify
=======

Confirm the pods are running::

	kubectl get pods -n ascender

Then open ``https://ascender.<SERVER-IP>.nip.io`` and sign in with the administrator credentials from your configuration file. Your browser warns about the self-signed certificate, which is expected.

If pods do not reach ``Running``, check the operator::

	kubectl logs -n ascender deployment/ascender-operator-controller-manager

Next steps
===========

Work through the :ref:`Ascender Quickstart <qs_start>` to run your first playbook.

For a production deployment, read :ref:`in_install` for the full configuration reference and the other supported platforms.
