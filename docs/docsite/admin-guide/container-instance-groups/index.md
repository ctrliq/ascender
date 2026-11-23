---
title: Container and Instance Groups
description: Group Ascender instances into instance groups with policies and capacity limits, and run jobs in Kubernetes or OpenShift pods with container groups.
weight: 32
---

Ascender allows you to execute jobs via Ansible playbook runs directly on a member of the cluster or in a namespace of an OpenShift cluster with the necessary service account provisioned, called a Container Group. You can execute jobs in a container group only as-needed per playbook. For more information, see [Container Groups](#container-groups) towards the end of this section.

For execution environments, see [Execution Environments](/user-guide/execution-environments) in the [Ascender user guides](/user-guide).

## Instance Groups

Instances can be grouped into one or more Instance Groups. Instance groups can be assigned to one or more of the resources listed below.

- Organizations
- Inventories
- Job Templates

When a job associated with one of the resources executes, it will be assigned to the instance group associated with the resource. During the execution process, instance groups associated with Job Templates are checked before those associated with Inventories. Similarly, instance groups associated with Inventories are checked before those associated with Organizations. Thus, Instance Group assignments for the three resources form a hierarchy: Job Template **>** Inventory **>** Organization.

Here are some of the things to consider when working with instance groups:

- A `default` API instance group is automatically created with all nodes capable of running jobs. Technically, it is like any other instance group but if a specific instance group is not associated with a specific resource, then job execution will always fall back to the `default` instance group. The `default` instance group always exists (it cannot be deleted nor renamed).
- Do not create a group named `instance_group_default`.
- Do not name any instance the same as a group name.

### Configuring Instance Groups from the API

Instance groups can be created by POSTing to `/api/v2/instance_groups` as a system administrator.

Once created, instances can be associated with an instance group with:

```text
HTTP POST /api/v2/instance_groups/x/instances/ {'id': y}
```

A change of membership takes effect the next time a job is placed. Membership is also changed by the group's policies; see the following section, [Instance group policies](#instance-group-policies), for more details.

### Instance group policies

You can configure Ascender instances to automatically join Instance Groups when they come online by defining a policy. These policies are evaluated for every new instance that comes online.

Instance Group Policies are controlled by three optional fields on an `Instance Group`:

- `policy_instance_percentage`: This is a number between 0 - 100. It guarantees that this percentage of active Ascender instances will be added to this Instance Group. As new instances come online, if the number of Instances in this group relative to the total number of instances is less than the given percentage, then new ones will be added until the percentage condition is satisfied.
- `policy_instance_minimum`: This policy attempts to keep at least this many instances in the Instance Group. If the number of available instances is lower than this minimum, then all instances will be placed in this Instance Group.
- `policy_instance_list`: This is a fixed list of instance names to always include in this Instance Group.

The Instance Groups list view from the Ascender user interface provides a summary of the capacity levels for each instance group according to instance group policies:

![Instance Groups list view with example instance groups and container groups and their capacity levels](/assets/images/instance-groups-list-view.webp)

See [Create an instance group](/user-guide/instance-groups#create-an-instance-group) for further detail.

### Notable policy considerations

- `policy_instance_percentage` and `policy_instance_minimum` both set minimum allocations. The rule that results in more instances assigned to the group will take effect. For example, if you have a `policy_instance_percentage` of 50% and a `policy_instance_minimum` of 2 and you start 6 instances, 3 of them would be assigned to the Instance Group. If you reduce the number of total instances in the cluster to 2, then both of them would be assigned to the Instance Group to satisfy `policy_instance_minimum`. This way, you can set a lower bound on the amount of available resources.
- Policies do not actively prevent instances from being associated with multiple Instance Groups, but this can effectively be achieved by making the percentages add up to 100. If you have 4 instance groups, assign each a percentage value of 25 and the instances will be distributed among them with no overlap.

### Manually pinning instances to specific groups

If you have a special instance which needs to be exclusively assigned to a specific Instance Group but don't want it to automatically join other groups via "percentage" or "minimum" policies:

1. Add the instance to one or more Instance Groups' `policy_instance_list`.
2. Update the instance's `managed_by_policy` property to be `false`.

This will prevent the Instance from being automatically added to other groups based on percentage and minimum policy; it will only belong to the groups you've manually assigned it to:

```text
HTTP PATCH /api/v2/instance_groups/N/
{
    "policy_instance_list": ["special-instance"]
}

HTTP PATCH /api/v2/instances/X/
{
    "managed_by_policy": false
}
```

### Job Runtime Behavior

When you run a job associated with an instance group, some behaviors worth noting are:

- If a cluster is divided into separate instance groups, then the behavior is similar to the cluster as a whole. Within a group, a job goes to the instance with the most remaining capacity.
- As Ascender instances are brought online, it effectively expands the work capacity of the system. If those instances are also placed into instance groups, then they also expand that group's capacity. If an instance is performing work and it is a member of multiple groups, then capacity will be reduced from all groups for which it is a member. De-provisioning an instance will remove capacity from the cluster wherever that instance was assigned.

<Hint type="note">

Not all instances are required to be provisioned with an equal capacity.

</Hint>

### Control Where a Job Runs

If any of the job template, inventory, or organization has instance groups associated with them, a job run from that job template will not be eligible for the default behavior. That means that if all of the instances inside of the instance groups associated with these 3 resources are out of capacity, the job will remain in the pending state until capacity becomes available.

The order of preference in determining which instance group to submit the job to is as follows:

1. job template
2. inventory
3. organization (the job template's organization)

If instance groups are associated with the job template, and all of these are at capacity, then the job will be submitted to instance groups specified on inventory, and then organization. Jobs should execute in those groups in preferential order as resources are available. When the job template or the inventory has **Prevent Instance Group Fallback** (`prevent_instance_group_fallback`) set, the list stops at that resource, and the instance groups of the resources after it are not used. If the job template prompts for instance groups on launch, the groups given at launch are used instead.

The global `default` group can still be associated with a resource, just like any of the custom instance groups defined in the playbook. This can be used to specify a preferred instance group on the job template or inventory, but still allow the job to be submitted to any instance if those are out of capacity.

As an example, by associating `group_a` with a Job Template and also associating the `default` group with its inventory, you allow the `default` group to be used as a fallback in case `group_a` gets out of capacity.

In addition, it is possible to not associate an instance group with one resource but designate another resource as the fallback. For example, not associating an instance group with a job template and have it fall back to the inventory and/or the organization's instance group.

This presents two other great use cases:

1. Associating instance groups with an inventory (omitting assigning the job template to an instance group) will allow the user to ensure that any playbook run against a specific inventory will run only on the group associated with it. This can be super useful in the situation where only those instances have a direct link to the managed nodes.
2. An administrator can assign instance groups to organizations. This effectively allows the administrator to segment out the entire infrastructure and guarantee that each organization has capacity to run jobs without interfering with any other organization's ability to run jobs.

Likewise, an administrator could assign multiple groups to each organization as desired, as in the following scenario:

- There are three instance groups: A, B, and C. There are two organizations: Org1 and Org2.
- The administrator assigns group A to Org1, group B to Org2 and then assigns group C to both Org1 and Org2 as an overflow for any extra capacity that may be needed.
- The organization administrators are then free to assign inventory or job templates to whichever group they want (or just let them inherit the default order from the organization).

![Illustration of instance groups A, B, and C assigned to organizations Org1 and Org2, with group C shared as overflow](/assets/images/instance-groups-scenarios.webp)

Arranging resources in this way offers a lot of flexibility. Also, you can create instance groups with only one instance, thus allowing you to direct work towards a very specific Host in the Ascender cluster.

### Instance group capacity limits

Sometimes there is external business logic which may drive the desire to limit the concurrency of jobs sent to an instance group, or the maximum number of forks to be consumed.

For traditional instances and instance groups, there could be a desire to allow two organizations to run jobs on the same underlying instances, but limit each organization's total number of concurrent jobs. This can be achieved by creating an instance group for each organization and assigning the value for `max_concurrent_jobs`.

For container groups, Ascender is generally not aware of the resource limits of the OpenShift cluster. There may be limits set on the number of pods on a namespace, or only resources available to schedule a certain number of pods at a time if no auto-scaling is in place. Again, in this case, we can adjust the value for `max_concurrent_jobs`.

Another parameter available is `max_forks`. This provides additional flexibility for capping the capacity consumed on an instance group or container group. This may be used if jobs with a wide variety of inventory sizes and "forks" values are being run. This way, you can limit an organization to run up to 10 jobs concurrently, but consume no more than 50 forks at a time.

```yaml
max_concurrent_jobs: 10
max_forks: 50
```

If 10 jobs that use 5 forks each are run, an 11th job will wait until one of these finishes to run on that group (or be scheduled on a different group with capacity).

If 2 jobs are running with 20 forks each, then a 3rd job with a `task_impact` of 11 or more will wait until one of these finishes to run on that group (or be scheduled on a different group with capacity).

For container groups, using the `max_forks` value is useful given that all jobs are submitted using the same `pod_spec` with the same resource requests, irrespective of the "forks" value of the job. The default `pod_spec` sets requests and not limits, so the pods can "burst" above their requested value without being throttled or reaped. By setting the `max_forks` value, you can help prevent a scenario where too many jobs with large forks values get scheduled concurrently and cause the OpenShift nodes to be oversubscribed with multiple pods using more resources than their requested value.

To set the maximum values for the concurrent jobs and forks in an instance group, see [Create an instance group](/user-guide/instance-groups#create-an-instance-group) in the [Ascender user guides](/user-guide).

### Deprovision Instance Groups

Instances are not removed automatically when they go away, since Ascender cannot tell an instance taken offline intentionally from one that failed. To remove an instance from the cluster:

1. Shut down the instance.
2. Run the deprovision command `ascender-web deprovision_instance --hostname=<name of the instance>`, with the same configuration as the running `ascender-web`, to remove it from the Ascender cluster registry at once.

   Example: `ascender-web deprovision_instance --hostname=hostB`

A system administrator can also remove an instance from the **Instances** list: on Kubernetes, an execution or hop node added there, and on any deployment, an instance that has been marked unavailable and has not checked in since. See [Manage instances](../instances#manage-instances).

Similarly, deprovisioning instances does not remove instance groups, even when this leaves them unused. They may still show up in API endpoints and stats monitoring. A system administrator can delete an unused group from the **Instance Groups** list (select it and click **Delete**) or with `DELETE /api/v2/instance_groups/<id>/`. The `default` and `controlplane` groups cannot be deleted.

Removing an instance from a group through the API or the user interface also removes it from the group's `policy_instance_list`, but the percentage and minimum policies may add it back. To keep it out of a group, also set its `managed_by_policy` to `false`; see [Manually pinning instances to specific groups](#manually-pinning-instances-to-specific-groups). You can also manage instance group topology through the Ascender user interface. For more information on managing instance groups in the UI, refer to [Instance Groups](/user-guide/instance-groups) in the [Ascender user guides](/user-guide).

## Container Groups

Ascender supports Container Groups, which allow you to execute jobs in pods on Kubernetes (k8s) or OpenShift clusters. Container groups act as a pool of resources within a virtual environment. These pods are created on-demand and only exist for the duration of the playbook run. This is known as the ephemeral execution model and ensures a clean environment for every job run.

In some cases, it is desirable to have container groups be "always-on", which is configured through the creation of an instance.

Container groups are different from execution environments in that execution environments are container images and do not use a virtual environment. See [Execution Environments](/user-guide/execution-environments) in the [Ascender user guides](/user-guide) for further detail.

### Create a container group

A `ContainerGroup` is a type of `InstanceGroup` that has an associated Credential that allows for connecting to an OpenShift cluster. To set up a container group, you must first have the following:

- A namespace you can launch into (every cluster has a "default" namespace, but you may want to use a specific namespace)
- A service account that has the roles that allow it to launch and manage Pods in this namespace
- If you will be using execution environments in a private registry, and have a Container Registry credential associated to them in Ascender, the service account also needs the roles to get, create, and delete secrets in the namespace. If you do not want to give these roles to the service account, you can pre-create the `ImagePullSecrets` and specify them on the pod spec for the ContainerGroup. In this case, the execution environment should NOT have a Container Registry credential associated, or Ascender will attempt to create the secret for you in the namespace.
- A token associated with that service account (OpenShift or Kubernetes Bearer Token)
- A CA certificate associated with the cluster

This section describes creating a Service Account in an OpenShift cluster (or K8s) in order to be used to run jobs in a container group via Ascender. After the Service Account is created, its credentials are provided to Ascender in the form of an OpenShift or Kubernetes API bearer token credential. Below describes how to create a service account and collect the needed information for configuring Ascender.

To configure Ascender:

1. To create a service account, download this sample, [service-account.yml](https://github.com/ctrliq/ascender/blob/main/docs/container_groups/service-account.yml), save it as `containergroup-sa.yml` and modify it as needed. Replace `containergroup-namespace` with the namespace the job pods run in. Besides the service account, its role and the role binding, it creates a token Secret for the service account (Kubernetes 1.24 and later no longer create one automatically). The `secrets` rule is needed only when an execution environment has a Container Registry credential.

   ```yaml
   ---
   apiVersion: v1
   kind: ServiceAccount
   metadata:
     name: containergroup-service-account
     namespace: containergroup-namespace
   ---
   apiVersion: v1
   kind: Secret
   type: kubernetes.io/service-account-token
   metadata:
     name: containergroup-service-account-token
     namespace: containergroup-namespace
     annotations:
       kubernetes.io/service-account.name: containergroup-service-account
   ---
   kind: Role
   apiVersion: rbac.authorization.k8s.io/v1
   metadata:
     name: role-containergroup-service-account
     namespace: containergroup-namespace
   rules:
     - apiGroups: [""]
       resources: ["pods"]
       verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
     - apiGroups: [""]
       resources: ["pods/log"]
       verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
     - apiGroups: [""]
       resources: ["pods/attach"]
       verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
     - apiGroups: [""]
       resources: ["secrets"]
       verbs: ["get", "create", "delete"]
   ---
   kind: RoleBinding
   apiVersion: rbac.authorization.k8s.io/v1
   metadata:
     name: role-containergroup-service-account-binding
     namespace: containergroup-namespace
   subjects:
     - kind: ServiceAccount
       name: containergroup-service-account
       namespace: containergroup-namespace
   roleRef:
     kind: Role
     name: role-containergroup-service-account
     apiGroup: rbac.authorization.k8s.io
   ```

2. Apply the configuration from `containergroup-sa.yml`:

   ```bash
   oc -n containergroup-namespace apply -f containergroup-sa.yml
   ```

3. Get the token from the service account's token Secret:

   ```bash
   oc -n containergroup-namespace get secret containergroup-service-account-token -o jsonpath='{.data.token}' | base64 --decode > containergroup-sa.token
   ```

4. Get the CA cert:

   ```bash
   oc -n containergroup-namespace get secret containergroup-service-account-token -o jsonpath='{.data.ca\.crt}' | base64 --decode > containergroup-ca.crt
   ```

5. Use the contents of `containergroup-sa.token` and `containergroup-ca.crt` to provide the information for the [OpenShift or Kubernetes API Bearer Token](/user-guide/credentials#openshift-or-kubernetes-api-bearer-token) credential required for the container group.

To create a container group:

1. Use the Ascender user interface to create an [OpenShift or Kubernetes API Bearer Token](/user-guide/credentials#openshift-or-kubernetes-api-bearer-token) credential that will be used with your container group. See [Add a new credential](/user-guide/credentials#add-a-new-credential) in the [Ascender user guides](/user-guide) for detail.
2. Create a new container group by navigating to the Instance Groups configuration window by clicking **Instance Groups** from the left navigation bar.
3. Click the **Add** button and select **Add container group**.

   ![Create new container group form](/assets/images/instance-group-create-new-cg.webp)

4. Enter a name for your new container group and select the credential previously created to associate it to the container group.

### Customize the pod spec

Ascender provides a simple default pod specification; however, you can provide a custom YAML (or JSON) document that overrides the default pod spec. This field uses any custom fields (for example, `ImagePullSecrets`) that can be "serialized" as valid pod JSON or YAML. A full list of options can be found in the [OpenShift documentation](https://docs.openshift.com/online/pro/architecture/core_concepts/pods_and_services.html).

To customize the pod spec, check the **Customize pod specification** option to enable and expand the **Custom pod spec** field where you specify the namespace and provide additional customizations as needed.

![Create new container group form with the option to customize the pod spec enabled](/assets/images/instance-group-customize-cg-pod.webp)

Click **Expand** to view the entire customization window.

![Expanded view of the custom pod spec editor](/assets/images/instance-group-customize-cg-pod-expanded.webp)

<Hint type="note">

The image used at job launch time is determined by which execution environment is associated with the job. If a Container Registry credential is associated with the execution environment, then Ascender will attempt to make an `ImagePullSecret` to pull the image. If you prefer not to give the service account permission to manage secrets, you must pre-create the `ImagePullSecret` and specify it on the pod spec, and omit any credential from the execution environment used.

</Hint>

<Hint type="tip">

In order to override DNS/host entries, use the `hostAliases` attribute on the pod spec. When the pod is created, these entries will be added to `/etc/hosts` in the container running the job.

```yaml
spec:
  hostAliases:
  - ip: "127.0.0.1"
    hostnames:
    - "foo.local"
```

For more information, refer to Kubernetes' documentation on [Adding additional entries with hostAliases](https://kubernetes.io/docs/tasks/network/customize-hosts-file-for-pods/#adding-additional-entries-with-hostaliases).

</Hint>

Once the container group is successfully created, the **Details** tab of the newly created container group remains, which allows you to review and edit your container group information. This is the same menu that is opened if the **Edit** (pencil) icon is clicked from the **Instance Group** link. You can also review the **Jobs** run in this container group on its **Jobs** tab. A container group has no instances, so it has no **Instances** tab.

![Details tab of a successfully created container group](/assets/images/instance-group-example-cg-successfully-created.webp)

Container groups and instance groups are labeled accordingly.

<Hint type="note">

Using a custom pod spec may cause issues on upgrades if the default `pod_spec` changes. Since any manifest can be applied to any namespace, with the namespace specified separately, most likely you will only need to override the namespace. Similarly, pinning a default image for different releases of the platform to different versions of the default job runner container is tricky. If the default image is specified in the pod spec, then upgrades do not pick up the new default changes that are made to the default pod spec.

</Hint>

### Verify container group functions

To verify the deployment and termination of your container:

1. Create a mock inventory and associate the container group to it by selecting the container group in the **Instance Groups** field. See [Add a new inventory](/user-guide/inventories#add-a-new-inventory) in the [Ascender user guides](/user-guide) for detail.

   ![Creating a new container group test inventory with the container group in the Instance Groups field](/assets/images/inventories-create-new-cg-test-inventory.webp)

2. Create a "localhost" host in the inventory with variables:

   ```text
   {'ansible_host': '127.0.0.1', 'ansible_connection': 'local'}
   ```

   ![The localhost host in the container group test inventory showing the populated variables](/assets/images/inventories-create-new-cg-test-localhost.webp)

3. Launch an ad hoc job against the localhost using the *ping* or *setup* module. Even though the **Machine Credential** field is required, it does not matter which one is selected for this simple test.

   ![Selecting the localhost host in the test inventory to run an ad hoc command](/assets/images/inventories-launch-adhoc-cg-test-localhost.webp)

   ![Launching a ping ad hoc command on the newly created inventory with localhost](/assets/images/inventories-launch-adhoc-cg-test-localhost2.webp)

You can see in the jobs detail view that the container was reached successfully using one of the ad hoc jobs.

![Job output view showing a successfully run ad hoc job](/assets/images/inventories-launch-adhoc-cg-test-localhost-success.webp)

If you have an OpenShift UI, you can see pods appear and disappear as they deploy and terminate. Alternatively, you can use the CLI to perform a `get pod` operation on your namespace to watch these same events occurring in real-time.

### View container group jobs

When you run a job associated with a container group, you can see the details of that job in the **Details** view and its associated container group and the execution environment that spun up.

![Job details window showing the associated execution environment and container group](/assets/images/instance-group-job-details-with-cgs.webp)

### Kubernetes API failure conditions

When running a container group and the Kubernetes API responds that the resource quota has been exceeded, Ascender keeps the job in pending state. Other failures result in the traceback of the **Error Details** field showing the failure reason, similar to the example here:

```text
Error creating pod: pods is forbidden: User "system:serviceaccount:ascender:example" cannot create resource "pods" in API group "" in the namespace "ascender"
```

### Container capacity limits

Capacity limits and quotas for containers are defined via objects in the Kubernetes API:

- To set limits on all pods within a given namespace, use the `LimitRange` object. Refer to the OpenShift documentation for [Quotas and Limit Ranges](https://docs.openshift.com/online/pro/dev_guide/compute_resources.html#overview).
- To set limits directly on the pod definition launched by Ascender, see [Customize the pod spec](#customize-the-pod-spec) and refer to the OpenShift documentation to set the options to [compute resources](https://docs.openshift.com/online/pro/dev_guide/compute_resources.html#dev-compute-resources).

<Hint type="note">

Container groups do not use the capacity algorithm that normal nodes use. You would need to explicitly set the number of forks at the job template level, for instance. If forks are configured in Ascender, that setting will be passed along to the container.

</Hint>
