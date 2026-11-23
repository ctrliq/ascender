---
title: Supported Architectures
description: The CPU architectures that Ascender container images and execution environments are published for.
weight: 2
---

Ascender publishes its two container images, `ascender-web` and `ascender-task`, for 64-bit x86 (`linux/amd64`) and 64-bit ARM (`linux/arm64`). No other architectures are published.

Released images are multi-architecture: a release tag carries both builds, so pulling it on either platform selects the matching image. There is no separate ARM tag or registry path, and a deployment needs no architecture-specific configuration.

The development images, `ghcr.io/ctrliq/ascender-devel/ascender-web` and `ghcr.io/ctrliq/ascender-devel/ascender-task`, built from every change to the main branch, are the exception. They are built for `linux/amd64` only, so an ARM host needs a released image or a local one. A local build targets the architecture of the machine that runs it; see [Building the Ascender Images](https://github.com/ctrliq/ascender/blob/main/docs/build_images.md#building-locally).

Execution environments are separate images with their own architecture support. Jobs, project updates, and inventory updates all run in an execution environment: a container that the task node starts with Podman or Docker, a container that an execution node starts with Podman through Receptor, or a pod in a container group on Kubernetes. Each needs an execution environment published for the architecture of the node, or the Kubernetes worker, it runs on.
