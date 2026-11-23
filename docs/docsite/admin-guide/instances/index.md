---
title: Managing Capacity With Instances
description: Scale an Ascender automation mesh by adding, peering, health-checking, and removing execution and hop node instances.
weight: 31
---

On OpenShift and Kubernetes (K8S) deployments of Ascender, you scale your mesh by adding or removing nodes from your cluster dynamically, through the **Instances** resource of the Ascender user interface, without running the installation script. On other deployments, such as docker compose, the **Add** button is not offered: execution and hop nodes are registered with the `ascender-web provision_instance` and `ascender-web add_receptor_address` commands (see [Cluster management](../awx-manage#cluster-management)), a node's install bundle is downloaded with `GET /api/v2/instances/<id>/install_bundle/`, and the deployment provides the receptor configuration and peers of the control nodes.

Instances serve as nodes in your mesh topology. Automation mesh allows you to extend the footprint of your automation. Where you launch a job and where the `ansible-playbook` runs can be in different locations.

![Site A pointing to Site B, with dotted arrows from Site B to two hosts](/assets/images/instances-mesh-concept-drawio.webp)

Automation mesh is useful for:

- traversing difficult network topologies
- bringing execution capabilities (the machine running `ansible-playbook`) closer to your target hosts

The nodes (control, hop, and execution instances) are interconnected via receptor, forming a virtual mesh.

![Control node pointing to a hop node, which is pointing to two execution nodes](/assets/images/instances-mesh-concept-with-nodes-drawio.webp)

## Prerequisites

- Red Hat Enterprise Linux (RHEL) or Debian operating system. Bring a machine online with a compatible Red Hat family OS (for example, RHEL 8 and 9) or Debian 11. This machine requires a static IP, or a resolvable DNS hostname that the Ascender cluster can access. If the `listener_port` is defined, the machine will also need an available open port on which to establish inbound TCP connections (for example, 27199).

  In general, the more CPU cores and memory the machine has, the more jobs that can be scheduled to run on that machine at once. See [Ascender capacity determination and job impact](/user-guide/jobs#ascender-capacity-determination-and-job-impact) for more information on capacity.

- The system that is going to run the install bundle to set up the remote node requires the collection `ansible.receptor` to be installed:

  - If the machine has access to the internet:

    ```bash
    ansible-galaxy install -r requirements.yml
    ```

    Installing the receptor collection dependency from the `requirements.yml` file will consistently retrieve the receptor version specified there, as well as any other collection dependencies that may be needed in the future.

  - If the machine does not have access to the internet, refer to [Downloading a collection for offline use](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html#downloading-a-collection-for-offline-use).

- To manage instances from the Ascender user interface, you must have System Administrator or System Auditor permissions.

## Common topologies

Instances make up the network of devices that communicate with one another. They are the building blocks of an automation mesh. These building blocks serve as nodes in a mesh topology. There are several kinds of instances:

| Node Type | Description |
| --- | --- |
| Control | Nodes that run persistent Ascender services, and delegate jobs to hybrid and execution nodes |
| Hybrid | Nodes that run persistent Ascender services and execute jobs (not applicable to operator-based installations) |
| Hop | Used for relaying across the mesh only |
| Execution | Nodes that run jobs delivered from control nodes (jobs submitted from the user's Ansible automation) |

### Simple topology

One of the ways to expand job capacity is to create a standalone execution node that can be added to run alongside the Kubernetes deployment of Ascender. These machines will not be a part of the Ascender Kubernetes cluster. The control nodes running in the cluster will connect and submit work to these machines via Receptor. The machines are registered in Ascender as type "execution" instances, meaning they will only be used to run Ascender jobs, not dispatch work or handle web requests as control nodes do.

Hop nodes can be added to sit between the control plane of Ascender and standalone execution nodes. These machines will not be a part of the Ascender Kubernetes cluster and they will be registered in Ascender as node type "hop", meaning they will only handle inbound and outbound traffic for otherwise unreachable nodes in a different or more strict network.

Below is an example of an Ascender task pod with two execution nodes. Traffic to execution node 2 flows through a hop node that is set up between it and the control plane.

![Ascender task pod with a hop node between the control plane of Ascender and standalone execution nodes](/assets/images/instances-ascender-task-pods-hopnode-drawio.webp)

Below are sample values used to configure each node in a simple topology:

| Instance type | Hostname | Listener port | Peers from control nodes | Peers |
| --- | --- | --- | --- | --- |
| Control plane | awx-task-65d6d96987-mgn9j | n/a | n/a | \[hop node\] |
| Hop node | awx-hop-node | 27199 | True | \[\] |
| Execution node | awx-example.com | n/a | False | \[hop node\] |

### Mesh topology

Mesh ingress is a feature that allows remote nodes to connect inbound to the control plane. This is especially useful when creating remote nodes in restricted networking environments that disallow inbound traffic.

![Mesh ingress architecture showing the peering relationship between nodes](/assets/images/instances-mesh-ingress-topology-drawio.webp)

Below are sample values used to configure each node in a mesh ingress topology:

| Instance type | Hostname | Listener port | Peers from control nodes | Peers |
| --- | --- | --- | --- | --- |
| Control plane | awx-task-65d6d96987-mgn9j | n/a | n/a | \[hop node\] |
| Hop node | awx-mesh-ingress-1 | 27199 | True | \[\] |
| Execution node | awx-example.com | n/a | False | \[hop node\] |

In order to create a mesh ingress for Ascender, see the [Mesh Ingress](https://github.com/ctrliq/ascender-operator/blob/devel/docs/user-guide/advanced-configuration/mesh-ingress.md) chapter of the Ascender Operator documentation for information on setting up this type of topology. The last step is to create a remote execution node and add the execution node to an instance group in order for it to be used in your job execution. Whatever execution environment image is used to run a playbook needs to be accessible for your remote execution node. Everything you are using in your playbook also needs to be accessible from this remote execution node.

![Job template using the instance group with the execution node to run jobs](/assets/images/instances-job-template-using-remote-execution-ig.webp)

## Add an instance

To create an instance in Ascender:

<Hint type="note">

Steps 4-8 of the following procedure are intended to be run from any computer that has SSH access to the newly created instance.

</Hint>

1. Click **Instances** from the left side navigation menu of the Ascender UI.
2. In the Instances list view, click the **Add** button and the Create new Instance window opens.

   ![Create new Instance form](/assets/images/instances-create-new.webp)

   An instance has several attributes that may be configured:

   - Enter a fully qualified domain name (ping-able DNS) or IP address for your instance in the **Host Name** field (required). This field is equivalent to `hostname` in the API.
   - Optionally enter a **Description** for the instance.
   - The **Instance State** field is auto-populated, indicating that it is being installed, and cannot be modified.
   - Optionally specify the **Listener Port** for the receptor to listen on for incoming connections. This is an open port on the remote machine used to establish inbound TCP connections. This field is equivalent to `listener_port` in the API.
   - Select from the options in the **Instance Type** field to specify the type you want to create. Only execution and hop nodes can be created as operator-based installations do not support hybrid nodes. This field is equivalent to `node_type` in the API.
   - In the **Options** fields:
     - Check the **Enable Instance** box to make it available for jobs to run on an execution node.
     - Check the **Managed by Policy** box to allow policy to dictate how the instance is assigned.
     - Check the **Peers from control nodes** box to allow control nodes to peer to this instance automatically. Listener port needs to be set if this is enabled or the instance is a peer.

3. Once the attributes are configured, click **Save** to proceed.

   Upon successful creation, the Details page of the created instance opens.

   ![Details tab of the newly created instance](/assets/images/instances-create-details.webp)

4. Click the download button next to the **Install Bundle** field to download the tarball that contains files to allow Ascender to make proper TCP connections to the remote machine.

   ![Instance details showing the Download button in the Install Bundle field of the Details tab](/assets/images/instances-install-bundle.webp)

5. Extract the downloaded `tar.gz` file from the location you downloaded it. The install bundle contains TLS certificates and keys, a certificate authority, and a proper Receptor configuration file. To facilitate that these files will be in the right location on the remote machine, the install bundle includes an `install_receptor.yml` playbook. The playbook requires the Receptor collection which can be obtained via:

   ```bash
   ansible-galaxy collection install -r requirements.yml
   ```

6. Before running the `ansible-playbook` command, edit the following fields in the `inventory.yml` file:

   - `ansible_user` with the username running the installation
   - `ansible_ssh_private_key_file` to contain the filename of the private key used to connect to the instance

   ```yaml
   ---
   all:
     hosts:
       remote-execution:
         ansible_host: <hostname>
         ansible_user: <username> # user provided
         ansible_ssh_private_key_file: ~/.ssh/id_rsa
   ```

   The content of the `inventory.yml` file serves as a template and contains variables for roles that are applied during the installation and configuration of a receptor node in a mesh topology. You may modify some of the other fields, or replace the file in its entirety for advanced scenarios. Refer to [Role Variables](https://github.com/ansible/receptor-collection/blob/main/README.md) for more information on each variable.

7. Save the file to continue.
8. Run the following command on the machine you want to update your mesh:

   ```bash
   ansible-playbook -i inventory.yml install_receptor.yml
   ```

   Wait a few minutes for the periodic Ascender task to do a health check against the new instance. You may run a health check by selecting the node and clicking the **Run health check** button from its Details page at any time. Once the instances endpoint or page reports a "Ready" status for the instance, jobs are now ready to run on this machine!

9. To view other instances within the same topology or associate peers, click the **Peers** tab.

   ![Peers tab showing two peers](/assets/images/instances-peers-tab.webp)

   To associate peers with your node, click the **Associate** button to open a dialog box of instances eligible for peering.

   ![Instances available to peer with the example hop node](/assets/images/instances-associate-peer.webp)

   The dialog lists the receptor addresses, other than internal ones, of the other instances that are not already peered with this one in either direction, whatever their node type. An instance cannot peer to its own address, to the same instance more than once, or to an instance that is already peered to it, and the peers of a managed node cannot be changed.

   If you associate or disassociate a peer, a notification will inform you to re-run the install bundle from the Peer Detail view (the [Topology Viewer](../topology-viewer) has the download link).

   ![Notification to re-run the installation bundle due to a change in the peering](/assets/images/instances-associate-peer-reinstallmsg.webp)

   You can remove an instance by clicking **Remove** in the Instances page, or by setting the instance `node_state = deprovisioning` via the API. Upon deleting, a pop-up message will appear to notify that you may need to re-run the install bundle to make sure things that were removed are no longer connected.

10. To view a graphical representation of your updated topology, refer to the [Topology Viewer](../topology-viewer) section of this guide.

## Manage instances

Click **Instances** from the left side navigation menu to access the Instances list.

![List view of instances in Ascender](/assets/images/instances-list-view.webp)

The Instances list displays all the current nodes in your topology, along with relevant details:

- **Name**
- **Status** indicates the state of the node:
  - **Installed**: a node that has successfully installed and configured, but has not yet passed the periodic health check
  - **Ready**: a node that is available to run jobs or route traffic between nodes on the mesh. This replaces the previously "Healthy" node state used in the mesh topology
  - **Provisioning**: a node that is in the process of being added to a current mesh, but is awaiting the job to install all of the packages (currently not yet supported and is subject to change in a future release)
  - **Deprovisioning**: a node that is in the process of being removed from a current mesh and is finishing up jobs currently running on it
  - **Unavailable**: a node that did not pass the most recent health check, indicating connectivity or receptor problems
  - **Provisioning Failure**: a node that failed during provisioning (currently not yet supported and is subject to change in a future release)
  - **De-provisioning Failure**: a node that failed during deprovisioning (currently not yet supported and is subject to change in a future release)
- **Node Type** specifies whether the node is a control, hop, execution node, or hybrid (not applicable to operator-based installations). See [Common topologies](#common-topologies) for further detail.
- **Capacity Adjustment** allows you to adjust the number of forks in your nodes
- **Used Capacity** indicates how much capacity has been used
- **Actions** allow you to enable or disable the instance to control whether jobs can be assigned to it

From this page, you can add, remove or run health checks on your nodes. Use the check boxes next to an instance to select it to remove or run a health check against. When a button is grayed-out, you do not have permission for that particular action. Contact your Administrator to grant you the required level of access. If you are able to remove an instance, you will receive a prompt for confirmation, like the one below:

![Prompt for confirming the removal of instances in Ascender](/assets/images/instances-delete-prompt.webp)

<Hint type="note">

You can still remove an instance even if it is active and jobs are running on it. Ascender will attempt to wait for any jobs running on this node to complete before actually removing it.

</Hint>

Click **Remove** to confirm.

### Run a health check

If running a health check on an instance, at the top of the Details page, a message displays that the health check is in progress.

![Instance Details page with a message that the health check is in progress](/assets/images/instances-health-check.webp)

Click **Reload** to refresh the instance status.

<Hint type="note">

Health checks are run asynchronously, and may take up to a minute for the instance status to update, even with a refresh. The status may or may not change after the health check. At the bottom of the Details page, a timer/clock icon displays next to the last known health check date and time stamp if the health check task is currently running.

![Health check for an instance still in the pending state](/assets/images/instances-health-check-pending.webp)

</Hint>

The example health check shows the status updates with an error on node 'one':

![Health check showing an error in one of the instances](/assets/images/topology-viewer-instance-with-errors.webp)

## Using a custom Receptor CA

Refer to the Ascender Operator documentation, [Custom Receptor CA](https://github.com/ctrliq/ascender-operator/blob/devel/docs/user-guide/advanced-configuration/custom-receptor-certs.md), for detail.

## Using a private image for the default EE

Refer to the Ascender Operator documentation on [Default execution environments from private registries](https://github.com/ctrliq/ascender-operator/blob/devel/docs/user-guide/advanced-configuration/default-execution-environments-from-private-registries.md) for detail.

## Troubleshooting

If you encounter issues while setting up instances, refer to these troubleshooting tips.

### Fact cache not working

Fact caching decides which hosts' facts a job changed by comparing the modification times of the fact files with the time the job's fact cache was written. The time zone does not matter, but the clocks do: make sure the clock of the execution node is kept in sync with the control nodes, for example with NTP.

### Permission denied errors

Jobs may fail with the following error, or similar:

```text
"msg":"exec container process `/usr/local/bin/entrypoint`: Permission denied"
```

For RHEL-based machines, this could be due to SELinux that is enabled on the system. You can pass these `extra_settings` container options to override SELinux protections:

```python
DEFAULT_CONTAINER_RUN_OPTIONS = ['--network', 'slirp4netns:enable_ipv6=true', '--security-opt', 'label=disable']
```
