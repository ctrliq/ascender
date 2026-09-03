.. _in_quick_start_k3s:

********************
Local Quick Start
********************

.. index::
   single: installation
   pair: installation; K3s
   pair: installation; quick start

Get Ascender running on a single machine. The installer builds a K3s cluster and deploys Ascender onto it, so you need nothing but the machine itself.

Before you start
=================

You need a machine with 2 CPUs, 8 GB memory, and 20 GB free disk, running Enterprise Linux 8 or 9 such as Rocky Linux, or Ubuntu or Debian 24 or 26, with root or sudo access. Install ``git`` and ``openssl`` if they are missing.

Get the installer
==================

::

	git clone https://github.com/ctrliq/ascender-install.git
	cd ascender-install

Create a certificate
=====================

Run this from the ``ascender-install`` directory so the installer finds the files. Replace ``<SERVER_IP>`` with your machine's address::

	openssl req -x509 -newkey rsa:4096 -keyout ascender.key -out ascender.crt -days 365 -nodes \
	  -subj "/CN=ascender.<SERVER_IP>.nip.io" \
	  -addext "subjectAltName=DNS:ascender.<SERVER_IP>.nip.io"

``nip.io`` is a wildcard DNS service, so ``ascender.<SERVER_IP>.nip.io`` resolves to your machine with no DNS setup. Use a real hostname for anything beyond evaluation.

Configure
==========

Create ``custom.config.yml`` alongside the certificate, replacing ``<SERVER_IP>`` with your machine's address and ``<password>`` with the password you want::

	k8s_platform: k3s
	k8s_lb_protocol: https
	kube_install: true
	download_kubeconfig: true
	k3s_master_node_ip: "<SERVER_IP>"

	tls_crt_path: "{{ playbook_dir }}/../ascender.crt"
	tls_key_path: "{{ playbook_dir }}/../ascender.key"

	ASCENDER_HOSTNAME: ascender.<SERVER_IP>.nip.io
	ASCENDER_NAMESPACE: ascender
	ASCENDER_ADMIN_USER: admin
	ASCENDER_ADMIN_PASSWORD: <password>
	ASCENDER_VERSION: 25.5.1
	ASCENDER_OPERATOR_VERSION: 25.5.1

	ascender_setup_playbooks: true

Set ``ASCENDER_ADMIN_PASSWORD`` before you install.

Run the installer
==================

The default ``inventory`` targets ``localhost``, so it needs no changes::

	sudo ./setup.sh

A successful run ends with ``ASCENDER SUCCESSFULLY SETUP``.

Verify
=======

The installer writes the kubeconfig for the user it ran as, so under ``sudo`` it belongs to root. Copy it to your own user first::

	sudo cp /root/.kube/config ~/.kube/config
	sudo chown $(id -u):$(id -g) ~/.kube/config
	kubectl get pods -n ascender

Open ``https://ascender.<SERVER_IP>.nip.io`` and sign in. Your browser warns about the self-signed certificate, which is expected.

If pods do not reach ``Running``, the operator log usually says why::

	kubectl logs -n ascender deployment/awx-operator-controller-manager

Next
=====

Work through the :ref:`Ascender Quickstart <qs_start>` to run your first playbook.
