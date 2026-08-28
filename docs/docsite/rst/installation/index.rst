.. _in_start:

=====================
Installing Ascender
=====================

Deploy Ascender on Kubernetes, from a single-node evaluation to a production cluster.

This guide applies to the latest version of Ascender only.
The content in this guide is updated frequently and might contain functionality that is not available in previous versions.
Likewise content in this guide can be removed or replaced if it applies to functionality that is no longer available in the latest version.

Ascender runs on Kubernetes and is managed by the `Ascender Operator <https://github.com/ctrliq/ascender-operator>`_.
Most deployments should use `ascender-install <https://github.com/ctrliq/ascender-install>`_, which provisions the cluster where supported, deploys the operator, and creates the Ascender resource from a single configuration file.
If you manage your own cluster or deploy through GitOps tooling, you can install the operator and create the Ascender resource yourself.

**Join us online**

You can find lots of Ascender discussion and get answers to questions at `Ascender Discussion Forum <https://github.com/ctrliq/ascender/discussions>`_.

.. toctree::
   :maxdepth: 2
   :numbered:

   self
   quick_start_k3s
   install
   manual_install
