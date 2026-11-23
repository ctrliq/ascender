---
title: Instance Groups
description: Create instance groups, associate instances with them, and view the jobs that ran on each group.
weight: 65
---

An instance group provides the ability to group instances in a clustered environment. Additionally, policies dictate how instance groups behave and how jobs are executed. The following view displays the capacity levels based on policy algorithms:

![Instance groups list view showing example instance groups and their capacity levels](/assets/images/instance-groups-list-view.webp)

For more information about the policy or rules associated with instance groups, see the [Instance Groups](/admin-guide/container-instance-groups#instance-groups) section of the [Ascender admin guides](/admin-guide).

If you want to connect your instance group to a container, refer to [Container Groups](/admin-guide/container-instance-groups#container-groups) for further detail.

## Create an instance group

<Hint type="note">

Policy instance fields are not required to create a new instance group. If you do not specify values, then the **Policy instance minimum** and **Policy instance percentage** default to 0.

The default value of 0 for **Max concurrent jobs** and **Max forks** denotes no limit. See [Instance group capacity limits](/admin-guide/container-instance-groups#instance-group-capacity-limits) in the [Ascender admin guides](/admin-guide) for more detail.

</Hint>

To create a new instance group:

1. Click **Instance Groups** from the left navigation menu to open the Instance Groups configuration window.
2. Click **Add** and select **Add instance group**.

   ![Create instance group form](/assets/images/instance-group-create-new-ig.webp)

3. Enter the appropriate details into the following fields:
   - **Name**: Names must be unique. The default execution instance group and the control plane instance group (named `default` and `controlplane` unless configured otherwise) cannot be renamed.
   - **Policy instance minimum**: Enter the minimum number of instances to automatically assign to this group when new instances come online.
   - **Policy instance percentage**: Enter the minimum percentage (0-100) of instances to automatically assign to this group when new instances come online.
   - **Max concurrent jobs**: Specify the maximum number of jobs that can run concurrently on this instance group.
   - **Max forks**: Specify the maximum number of forks that can be consumed across all jobs running on this instance group.
4. Click **Save**.

Once the instance group is successfully created, the **Details** tab of the newly created instance group remains, allowing you to review and edit your instance group information. This is the same screen that opens when the **Edit** (pencil) icon is clicked from the **Instance Groups** list view. You can also edit **Instances** and review **Jobs** associated with this instance group.

![Instance group details showing the Instances and Jobs tabs](/assets/images/instance-group-example-ig-successfully-created.webp)

### Associate instances to an instance group

To associate instances to an instance group:

1. Click the **Instances** tab of the Instance Group window and click the **Associate** button.
2. Click the checkbox next to one or more available instances from the list to select the instance(s) you want to associate with the instance group.

   ![Selecting instances to associate with an instance group](/assets/images/instance-group-assoc-instances.webp)

3. In the following example, the instances added to the instance group displays along with information about their capacity.

This view also allows you to edit some key attributes associated with the instances in your instance group:

![Instances tab of an instance group with callouts for the editable instance attributes](/assets/images/instance-group-instances-example-callouts.webp)

### View jobs associated with an instance group

To view the jobs associated with the instance group, click the **Jobs** tab of the Instance Group window and then click **Expanded** to expand the view to show details about each job.

![Jobs tab of an instance group listing the jobs that ran on it](/assets/images/instance-group-jobs-list.webp)

Each job displays the job status, ID, and name; type of job, time started and completed, who started the job; and applicable resources associated with it, such as template, inventory, project, execution environment, etc.

The instances are run in accordance with instance group policies. Refer to [Instance Group Policies](/admin-guide/container-instance-groups#instance-group-policies) in the [Ascender admin guides](/admin-guide).
