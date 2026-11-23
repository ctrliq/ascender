---
title: Upgrade Considerations
description: Planning information to review before upgrading or migrating an Ascender deployment, including the move to execution environments.
weight: 92
---

Review important information before upgrading or migrating Ascender deployments.

This guide applies to the latest version of Ascender only. The content in this guide is updated frequently and might contain functionality that is not available in previous versions. Likewise, content in this guide can be removed or replaced if it applies to functionality that is no longer available in the latest version.

You can find lots of Ascender discussion and get answers to questions at the [Ascender Discussion Forum](https://github.com/ctrliq/ascender/discussions).

## Upgrading Ascender

For the upgrade procedure itself, see [Upgrading](/installation/upgrading). Also refer to [Starting, Stopping, and Restarting Ascender](../service-management) for detail.

### Upgrade Planning

This section covers changes that you should keep in mind as you attempt to upgrade your Ascender instance.

- Clustered upgrades require special attention to instance and instance groups prior to starting the upgrade. See [Clustering](../clustering) for details.
- Back up the deployment before upgrading. See [Backup](../backup).

## Upgrading to Execution Environments

Refer to [Starting, Stopping, and Restarting Ascender](../service-management) in the Ascender admin guides and [Execution Environments](/user-guide/execution-environments) in the [Ascender user guides](/user-guide) for detail.

<Hint type="warning">

When upgrading, it is highly recommended to always rebuild on top of the base execution environment that corresponds to the Ascender version you are using. See [Building an execution environment](/user-guide/execution-environments#building-an-execution-environment) for more information.

</Hint>

### View mesh topology

In order to run jobs on an execution node, either the installer needs to pre-register the node, or the user needs to make a PATCH request to `/api/v2/instances/N/` to change the `enabled` field to true.

If you have already deployed a mesh topology and want to view node type, node health, and specific details about each node, see [Topology Viewer](../topology-viewer).
