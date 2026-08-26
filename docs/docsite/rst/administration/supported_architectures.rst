.. _ag_supported_architectures:

*************************
Supported Architectures
*************************

.. index::
   single: architecture
   pair: architecture; ARM64
   pair: architecture; x86_64

Ascender publishes its container image for 64-bit x86 (``linux/amd64``) and 64-bit ARM (``linux/arm64``). ARM64 images have been published since 25.4.0. No other architectures are published.

Released images are multi-architecture: a release tag carries both builds, so pulling it on either platform selects the matching image. There is no separate ARM tag or registry path, and a deployment needs no architecture-specific configuration.

The ``ascender_devel`` image is the exception. It is built for ``linux/amd64`` only, so an ARM host needs a released image or a local one. A local build targets the architecture of the machine that runs it; see `Building the Ascender Image <https://github.com/ctrliq/ascender/blob/main/docs/build_awx_image.md>`_.

Execution environments are separate images with their own architecture support. Jobs, project updates, and inventory updates all run in execution environment pods, so each needs an execution environment published for the architecture of the nodes it runs on.
