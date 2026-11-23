---
title: Workflow Job Templates
description: Create, launch, schedule, and copy workflow job templates, add surveys, and build workflows with the Workflow Visualizer.
weight: 64
---

A workflow job template links together a sequence of disparate resources that accomplishes the task of tracking the full set of jobs that were part of the release process as a single unit. These resources may include:

- job templates
- workflow templates
- project syncs
- inventory source syncs

The **Templates** menu opens a list of the workflow and job templates that are currently available. The default view is collapsed (Compact), showing the template name, template type, and the statuses of the jobs that ran using that template, but you can click **Expanded** to view more information. This list is sorted alphabetically by name, but you can sort by other criteria, or search by various fields and attributes of a template. From this screen, you can launch (rocket icon), edit (pencil icon), and copy (copy icon) a workflow job template.

Only workflow templates have the **Workflow Visualizer** icon as a shortcut for accessing the workflow editor.

![Templates list view with an example workflow template and an arrow pointing to the Workflow Visualizer icon](/assets/images/wf-templates-home-with-example-wf-template.webp)

<Hint type="note">

Workflow templates can be used as building blocks for another workflow template. Many parameters in a workflow template allow you to enable **Prompt on Launch** that can be modified at the workflow job template level, and do not affect the values assigned at the individual workflow template level. For instructions, see the [Workflow Visualizer](#workflow-visualizer) section.

</Hint>

## Create a Workflow Template

<Hint type="note">

If a field has the **Prompt on launch** checkbox selected, launching the workflow template, or when the workflow template is used within another workflow template, it will prompt for the value for that field upon launch. Most prompted values will override any values set in the workflow job template; exceptions are noted below.

</Hint>

To create a new workflow job template:

1. Click the **Add** button then select **Workflow Template** from the menu list.

   ![Create New Workflow Template form](/assets/images/wf-templates-create-new-wf-template.webp)

2. Enter the appropriate details into the following fields:

   - **Name**: Enter a name for the job.
     - Prompt on launch: N/A
   - **Description**: Enter an arbitrary description as appropriate (optional).
     - Prompt on launch: N/A
   - **Organization**: Choose the organization to be used with this template from the organizations available to the currently logged in user.
     - Prompt on launch: N/A
   - **Inventory**: Optionally choose the inventory to be used with this template from the inventories available to the currently logged in user.
     - Prompt on launch: Yes
   - **Limit**: A host pattern to further constrain the list of hosts managed or affected by the playbook. Multiple patterns can be separated by colons (`:`). As with core Ansible, `a:b` means "in group a or b", `a:b:&c` means "in a or b but must be in c", and `a:!b` means "in a, and definitely not in b". For more information and examples refer to [Patterns](https://docs.ansible.com/ansible/latest/inventory_guide/intro_patterns.html) in the Ansible documentation.
     - Prompt on launch: Yes
   - **Source control branch**: Select a branch for the workflow. This branch is applied to all workflow job template nodes that prompt for a branch.
     - Prompt on launch: Yes
   - **Labels**:
     - Optionally supply labels that describe this workflow job template, such as "dev" or "test". Labels can be used to group and filter workflow job templates and completed jobs in the display.
     - Labels are created when they are added to the workflow template. New labels are created in the workflow template's organization or, if it has none, in the organization of its inventory, or failing that in the first organization you can see. Members of the Organization can create labels on a workflow template if they have edit permissions (such as an admin role).
     - Once the workflow template is saved, the labels appear in the WFJT's Details view.
     - Click the **X** beside a label to remove it. When a label is removed, it is no longer associated with that particular workflow template, but it will remain associated with any other jobs or job templates that reference it.
     - Labels are only applied to the workflow templates not the job template nodes that are used in the workflow.
     - Prompt on launch: Yes. If selected, even if a default value is supplied, you will be prompted upon launch to supply additional labels if needed. You will not be able to delete existing labels; clicking the **X** (delete) icon only removes the newly added labels, not existing default labels.
   - **Variables**:
     - Pass extra command line variables to the playbook. This is the `-e` or `--extra-vars` command line parameter for ansible-playbook that is documented in the Ansible documentation at [Passing Variables on the Command Line](https://docs.ansible.com/ansible/latest/reference_appendices/general_precedence.html).
     - Provide key/value pairs using either YAML or JSON. These variables have a maximum value of precedence and overrides other variables specified elsewhere. An example value might be:

       ```yaml
       git_branch: production
       release_version: 1.5
       ```

     - Prompt on launch: Yes. If you want to be able to specify `extra_vars` on a schedule, you must select **Prompt on Launch** for **Variables** on the workflow job template, or enable a survey on the workflow job template, then those answered survey questions become `extra_vars`.
     - For more information about extra variables, refer to [Extra Variables](#extra-variables).
   - **Job Tags**: Begin typing and selecting the **Create x** drop-down to specify which parts of the playbook should be executed.
     - Prompt on launch: Yes
   - **Skip Tags**: Begin typing and selecting the **Create x** drop-down to specify certain tasks or parts of the playbook to skip.
     - Prompt on launch: Yes

   For more information about **Job Tags** and **Skip Tags**, refer to [Tags](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_tags.html) in the Ansible documentation.

3. **Options**: Specify options for launching this workflow job template, if necessary.
   - Check **Enable Webhooks** to turn on the ability to interface with a predefined SCM system web service that is used to launch a workflow job template. Currently supported SCM systems are GitHub, GitLab, and Bitbucket Data Center.

     If you enable webhooks, other fields display, prompting for additional information:

     - **Webhook Service**: Select which service to listen for webhooks from.
     - **Webhook Credential**: Optionally, provide a GitHub or GitLab personal access token (PAT) or a Bitbucket Data Center HTTP access token as a credential to use to send status updates back to the webhook service. Before you can select it, the credential must exist. See [Credential Types](../credentials#credential-types) to create one.

     Upon **Save**, additional fields populate and the Workflow Visualizer automatically opens.

     - **Webhook URL**: Automatically populated with the URL for the webhook service to POST requests to.
     - **Webhook Key**: Generated shared secret to be used by the webhook service to sign payloads sent to Ascender. This must be configured in the settings on the webhook service in order for Ascender to accept webhooks from this service.

     For additional information on setting up webhooks, see [Webhooks](../webhooks).

   - Check **Enable Concurrent Jobs** to allow simultaneous runs of this workflow. Refer to [Ascender Capacity Determination and Job Impact](../jobs#ascender-capacity-determination-and-job-impact) for additional information.
4. When you have completed configuring the workflow template, click **Save**.

Saving the template exits the workflow template page and the Workflow Visualizer opens to allow you to build a workflow. See the [Workflow Visualizer](#workflow-visualizer) section for further instructions. Otherwise, you may close the Workflow Visualizer to return to the Details tab of the newly saved template in order to review, edit, add permissions, notifications, schedules, and surveys, or view completed jobs and build a workflow template at a later time. Alternatively, you can click **Launch** to launch the workflow, but you must first save the template prior to launching, otherwise, the **Launch** button remains grayed-out. Also, note the **Notifications** tab is present only after the template has been saved.

![Details tab of the newly created workflow template](/assets/images/wf-templates-wf-template-saved.webp)

## Work with Permissions

Clicking on **Access** allows you to review, grant, edit, and remove associated permissions for users as well as team members.

![Access tab of a workflow template showing two user roles and their permissions](/assets/images/wf-template-completed-permissions-view.webp)

Click the **Add** button to create new permissions for this workflow template by following the prompts to assign them accordingly.

## Work with Notifications

Clicking on **Notifications** allows you to review any notification integrations you have setup. The **Notifications** tab is present only after the template has been saved.

![Notifications tab of a workflow template showing four notification configurations, one of them set for Approval](/assets/images/wf-template-completed-notifications-view.webp)

Use the toggles to enable or disable the notifications to use with your particular template. For more detail, see [Enable and Disable Notifications](../notifications#enable-and-disable-notifications).

If no notifications have been set up, see [Create a Notification Template](../notifications#create-a-notification-template) for detail.

![Notifications tab of a workflow template with no notifications set up](/assets/images/wf-template-no-notifications-blank.webp)

Refer to [Notification Types](../notifications#notification-types) for additional details on configuring various notification types.

## View Completed Jobs

The **Jobs** tab provides the list of jobs that have run from this workflow template. Click **Expanded** to view the various details of each job.

![Jobs tab of an example workflow template showing completed jobs](/assets/images/wf-template-completed-jobs-list.webp)

From this view, you can click the job ID - name of the workflow job and see its graphical representation. The example below shows the job details of a workflow job.

![Graphical job output for a workflow job selected by job ID](/assets/images/wf-template-jobid-detail-example.webp)

The nodes are marked with labels that help you identify them at a glance. See the legend in the [Workflow Visualizer](#build-a-workflow) section for more information.

## Work with Schedules

Clicking on **Schedules** allows you to review any schedules set up for this template.

### Schedule a Workflow Template

To schedule a workflow job template run, click the **Schedules** tab.

- If schedules are already set up; review, edit, or enable/disable your schedule preferences.
- If schedules have not been set up, refer to [Schedules](../schedules) for more information.

If a workflow template used in a nested workflow has a survey, or the **Prompt on Launch** selected for the inventory option, the **PROMPT** button displays next to the **SAVE** and **CANCEL** buttons on the schedule form. Clicking the **PROMPT** button shows an optional INVENTORY step where you can provide or remove an inventory or skip this step without any changes.

## Surveys

Workflows containing job types of Run or Check provide a way to set up surveys in the Workflow Job Template creation or editing screens. Surveys set extra variables for the playbook similar to 'Prompt for Extra Variables' does, but in a user-friendly question and answer way. Surveys also allow for validation of user input. Click the **Survey** tab to create a survey.

Use cases for surveys are numerous. An example might be if operations wanted to give developers a "push to stage" button they could run without advanced Ansible knowledge. When launched, this task could prompt for answers to questions such as, "What tag should we release?"

Many types of questions can be asked, including multiple-choice questions.

### Create a Survey

To create a survey:

1. Click the **Survey** tab, which lists the survey's questions.
2. Click **Add** to open the question form. A survey can consist of any number of questions. For each question, enter the following information:
   - **Question**: The question to ask the user.
   - **Description**: (optional) A description of what's being asked of the user.
   - **Answer variable name**: The Ansible variable name to store the user's response in. This is the variable to be used by the playbook. Variable names cannot contain spaces.
   - **Answer type**: Choose from the following question types.
     - *Text*: A single line of text. You can set the **Minimum length** and **Maximum length** (in characters) for this answer.
     - *Textarea*: A multi-line text field. You can set the **Minimum length** and **Maximum length** (in characters) for this answer.
     - *Password*: Responses are treated as sensitive information, much like an actual password is treated. You can set the **Minimum length** and **Maximum length** (in characters) for this answer.
     - *Multiple Choice (single select)*: A list of options, of which only one can be selected at a time. Enter each option in its own row under **Multiple Choice Options**, clicking **Add choice** for another row. Click the check mark beside an option to make it the default answer.
     - *Multiple Choice (multiple select)*: A list of options, any number of which can be selected at a time. Enter the options the same way; you can mark several of them as default answers.
     - *Integer*: An integer number. You can set the **Minimum** and **Maximum** values for this answer.
     - *Float*: A decimal number. You can set the **Minimum** and **Maximum** values for this answer.
   - **Required**: Whether or not an answer to this question is required from the user.
   - **Default answer**: Depending on which type chosen, you can supply the default answer to the question. This value is pre-filled in the interface and is used if the answer is not provided by the user.

   ![Workflow job template showing the Create survey form](/assets/images/wf-template-create-survey.webp)

3. Click **Save** to add the question. The question form closes and the question displays in the survey list.

   For any question, you can click the **Edit** (pencil) icon to edit the question, or check the box next to it and click **Delete** to delete it. If the survey has more than one question, click **Edit Order** and drag the questions to rearrange their order.

4. To add more questions, click **Add** again.
5. Use the **Survey Enabled** toggle at the top of the list, shown once the survey has a question, to enable or disable the survey.

![Workflow job template showing a completed survey with arrows pointing to the re-ordering icons](/assets/images/wf-template-completed-survey.webp)

### Optional Survey Questions

The **Required** setting on a survey question determines whether the answer is optional or not for the user interacting with it.

Behind the scenes, optional survey variables can be passed to the playbook in `extra_vars`, even when they aren't filled in.

- If a non-text variable (input type) is marked as optional, and is not filled in, no survey `extra_var` is passed to the playbook.
- If a text input or text area input is marked as optional, is not filled in, and has a minimum `length > 0`, no survey `extra_var` is passed to the playbook.
- If a text input or text area input is marked as optional, is not filled in, and has a minimum `length === 0`, that survey `extra_var` is passed to the playbook, with the value set to an empty string ( `""` ).

## Workflow Visualizer

The Workflow Visualizer provides a graphical way of linking together job templates, workflow templates, project syncs, and inventory syncs to build a workflow template. Before building a workflow template, refer to the [Workflows](../workflows) section for considerations associated with various scenarios on parent, child, and sibling nodes.

### Build a Workflow

You can set up any combination of two or more of the following node types to build a workflow: Template (Job Template or Workflow Job Template), Project Sync, Inventory Sync, or Approval. Each node is represented by a rectangle while the relationships and their associated edge types are represented by a line (or link) that connects them.

<Hint type="note">

If you select a job template that does not have a default inventory when populating a workflow graph, the inventory of the parent workflow will be used. Though a credential is not required in a job template, you will not be able to choose a job template for your workflow if it has a credential that requires a password, unless the credential is replaced by a prompted credential.

</Hint>

1. In the details/edit view of a workflow template, click the **Visualizer** tab or from the Templates list view, click the **Workflow Visualizer** icon to launch the Workflow Visualizer.

   ![Workflow Visualizer start page](/assets/images/wf-editor-create-new.webp)

2. Click the **Start** button to display a list of nodes to add to your workflow.

   ![Workflow Visualizer wizard, step 1 specifying the node type](/assets/images/wf-editor-create-new-add-template-list.webp)

3. On the right pane, select the type of node you want to add from the drop-down menu:

   ![Node type drop-down menu showing the node type options](/assets/images/wf-add-node-selections.webp)

   If selecting an **Approval** node, see [Approval nodes](#approval-nodes) for further detail.

   Selecting a node provides the available valid options associated with it.

4. Once a node is selected, the workflow begins to build, and you must specify the type of action to be taken for the selected node. This action is also referred to as *edge type*.
5. If the node is a root node, the edge type defaults to **Always** and is non-editable.

   For subsequent nodes, you can select one of the following scenarios (edge type) to apply to each:

   - **Always**: Continue to execute regardless of success or failure.
   - **On Success**: Upon successful completion, execute the next template.
   - **On Failure**: Upon failure, execute a different template.

6. Select the behavior of the node if it is a convergent node from the **Convergence** field:
   - **Any** is the default behavior, allowing *any* of the nodes to complete as specified, before triggering the next converging node. As long as the status of one parent meets one of those run conditions, an ANY child node will run. In other words, an ANY node requires **all** nodes to complete, but only one node must complete with the expected outcome.
   - Choose **All** to ensure that *all* nodes complete as specified, before converging and triggering the next node. The purpose of ALL nodes is to make sure that every parent met its expected outcome in order to run the child node. The workflow checks to make sure every parent behaved as expected in order to run the child node. Otherwise, it will not run the child node.

   If selected, the graphical view will indicate the node type with a representative color. Refer to the legend (compass icon) to see the corresponding run scenario and their job types.

   If a node is a root node, or a node that does not have any nodes converging into it, setting the **Convergence** rule does not apply, as its behavior is dictated by the action that triggers it.

7. If a job template used in the workflow has **Prompt on Launch** selected for any of its parameters, a **Prompt** button appears, allowing you to change those values at the node level. Use the wizard to change the value(s) in each of the tabs and click **Confirm** in the Preview tab.

   ![Workflow Visualizer wizard with Prompt on Launch options](/assets/images/wf-editor-prompt-button-wizard.webp)

   Likewise, if a workflow template used in the workflow has **Prompt on Launch** selected for the inventory option, use the wizard to supply the inventory at the prompt. If the parent workflow has its own inventory, it will override any inventory that is supplied here.

   ![Workflow Visualizer wizard with Prompt on Launch for inventory](/assets/images/wf-editor-prompt-button-inventory-wizard.webp)

   For workflow job templates with promptable fields that are required, but do not have a default, you must provide those values when creating a node before the **Select** button becomes enabled. The two cases that disable the **Select** button until a value is provided via the **Prompt** button: 1) when you select the **Prompt on Launch** checkbox in a workflow job template, but do not provide a default, or 2) when you create a survey question that is required but do not provide a default answer. However, this is **NOT** the case with credentials. Credentials that require a password on launch are **not permitted** when creating a workflow node, since everything needed to launch the node must be provided when the node is created. So, if a workflow job template prompts for credentials, Ascender prevents you from being able to select a credential that requires a password.

   Once the node is created, it is labeled with its job type. A template that is associated with each workflow node will run based on the selected run scenario as it proceeds. Click the compass icon to display the legend for each run scenario and their job types.

   ![Workflow Visualizer legend expanded](/assets/images/wf-editor-key-dropdown-list.webp)

8. Hovering over a node allows you to add another node (plus icon), view info about the node (info icon), edit the node details (pencil icon), edit an existing link (link icon), or delete the selected node (trash can icon).

   ![Building a new example workflow job template in the Workflow Visualizer](/assets/images/wf-editor-create-new-add-template.webp)

9. When done adding/editing a node, click **Save** to save any modifications and render it on the graphical view. For possible ways to build your workflow, see [Node building scenarios](#node-building-scenarios).
10. When done with building your workflow template, click **Save** to save your entire workflow template and return to the new workflow template details page.

<Hint type="warning">

Closing the wizard without saving will not save your work, but instead, closes the entire Workflow Visualizer and you will have to start where you last saved.

</Hint>

#### Approval nodes

Choosing an **Approval** node requires user intervention in order to advance the workflow. This functions as a means to pause the workflow in between playbooks so that a user can give approval to continue on to the next playbook in the workflow, giving the user a specified amount of time to intervene, but also allows the user to continue as quickly as possible without having to wait on some other trigger.

![Workflow Visualizer Approval node form](/assets/images/wf-node-approval-form.webp)

The default for the timeout is none, but you can specify the length of time before the request expires. The **On timeout** field chooses what happens then: **Deny** (the default) denies the request, and **Approve** approves it. **Required approvals** sets how many different users must approve the request before the workflow continues (1 by default); a single denial denies it. After selecting and supplying the information for the approval node, it displays on the graphical view with a pause icon next to it.

![Workflow Visualizer showing an approval node with the pause icon](/assets/images/wf-node-approval-node.webp)

The approvers are system administrators, admins of the workflow job template containing the approval nodes (which includes the admins and Workflow Admins of its organization), and users who have the *Approve* permission on the workflow job template or on its organization. Permission to execute the workflow job template alone does not allow approving.

![Workflow approval requests shown in the notifications drawer](/assets/images/wf-node-approval-notifications.webp)

If pending approval nodes are denied, or are not approved within the specified time limit (if an expiration was assigned) and **On timeout** is **Deny**, then they are marked as "failed" or "timed out", respectively, and move on to the next "on fail node" or "always node". If approved, including automatically when the time limit passes and **On timeout** is **Approve**, the "on success" path is taken. If you try to POST in the API to a node that has already been approved, denied or timed out, an error message notifies you that this action is redundant, and no further steps will be taken.

Below shows the various levels of permissions allowed on approval workflows:

![Table of permissions allowed on workflow approval nodes by role](/assets/images/wf-node-approval-rbac.webp)

#### Node building scenarios

You can add a sibling node by clicking the **Add** (plus) icon on the parent node:

![Workflow Visualizer showing how to create a sibling node](/assets/images/wf-editor-create-sibling-node.webp)

You can insert another node in between nodes by hovering over the line that connects the two until the **Add** (plus) icon appears. Clicking on the **Add** (plus) icon automatically inserts the node between the two nodes.

![Workflow Visualizer showing how to insert a node between two nodes](/assets/images/wf-editor-insert-node-template.webp)

To add a root node to depict a split scenario, click the **Start** button again:

![Workflow Visualizer showing how to depict a split scenario](/assets/images/wf-editor-create-new-add-template-split.webp)

At any node where you want to create a split scenario, hover over the node from which the split scenario begins and click the **Add** (plus) icon. This essentially adds multiple nodes from the same parent node, creating sibling nodes:

![Workflow Visualizer showing how to create sibling nodes](/assets/images/wf-editor-create-siblings.webp)

<Hint type="note">

When adding a new node, the **PROMPT** button applies to workflow templates as well. Workflow templates will prompt for inventory and surveys.

</Hint>

If you want to undo the last inserted node, click on another node without making a selection from the right pane. Or, click **Cancel** from the right pane.

Below is an example of a workflow that contains all three types of jobs that is initiated by a job template that if it fails to run, proceed to the project sync job, and regardless of whether that fails or succeeds, proceed to the inventory sync job.

![Workflow containing a job template, a project sync, and an inventory source sync](/assets/images/wf-editor-create-new-add-template-example.webp)

Remember to refer to the Legend at the top of the window to identify the meaning of the symbols and colors associated with the graphical depiction.

<Hint type="note">

In a workflow with a set of sibling nodes having varying edge types, and you remove a node that has a follow-on node attached to it, the attached node automatically joins the set of sibling nodes and retains its edge type:

![Workflow Visualizer showing a workflow after a node is deleted](/assets/images/wf-node-delete-scenario.webp)

</Hint>

The following ways you can modify your nodes:

- If you want to edit a node, click on the node you want to edit. The right pane displays the current selections. Make your changes and click **Select** to apply them to the graphical view.
- To edit the edge type for an existing link (success/failure/always), click on the link. The right pane displays the current selection. Make your changes and click **Save** to apply them to the graphical view.

  ![Workflow Visualizer wizard for editing a link](/assets/images/wf-editor-wizard-edit-link.webp)

- To add a new link from one node to another, click the link icon that appears on each node. Doing this highlights the nodes that are possible to link to. These feasible options are indicated by the dotted lines. Invalid options are indicated by grayed out boxes (nodes) that would otherwise produce an invalid link. The example below shows the **Demo Project** as a possible option for the **e2e-ec20de52-project** to link to, as indicated by the arrows:

  ![Workflow showing the linking options between two nodes](/assets/images/wf-node-link-scenario.webp)

  When linked, specify the type of run scenario you would like the link to have in the Add Link prompt.

  ![Add Link prompt specifying the run type for a new link](/assets/images/wf-editor-wizard-add-link-prompt.webp)

- To remove a link, click the link and click the **Unlink** (trash can) icon and click **Remove** at the prompt to confirm.

  ![Workflow Visualizer wizard for removing a link](/assets/images/wf-editor-wizard-unlink.webp)

  This button only appears in the right hand panel if the target or child node has more than one parent. All nodes must be linked to at least one other node at all times so you must create a new link before removing an old one.

Click the **Tools** icon to zoom, pan, or reposition the view. Alternatively, you can drag the workflow diagram to reposition it on the screen or use the scroll on your mouse to zoom.

## Launch a Workflow Template

Launch a workflow template by any of the following ways:

- Access the workflow templates list from the **Templates** menu on the left navigation bar or while in the workflow template Details view, scroll to the bottom to access the **Launch** (rocket) icon from the list of templates.

  ![Templates list view with an arrow pointing to the Launch icon of a workflow job template](/assets/images/wf-templates-wf-template-launch.webp)

- While in the Workflow Job Template Details view of the job you want to launch, click **Launch**.

Along with any extra variables set in the workflow job template and survey, Ascender automatically adds the same variables as those added for a workflow job template upon launch. Additionally, Ascender automatically redirects the web browser to the Jobs Details page for this job, displaying the progress and the results.

Events related to approvals on workflows display at the top in the **Activity Stream** with detailed information about the approval requests, if any.

## Copy a Workflow Template

Ascender allows you the ability to copy a workflow template. If you choose to copy a workflow template, it **does not** copy any associated schedule, notifications, or permissions. Schedules and notifications must be recreated by the user or admin creating the copy of the workflow template. The user copying the workflow template will be granted the admin permission, but no permissions are assigned (copied) to the workflow template.

1. Access the workflow template that you want to copy from the **Templates** menu on the left navigation bar or while in the Workflow Job Template Details view, scroll to the bottom to access it from a list of templates.
2. Click the **Copy** icon.

   A new template opens with the name of the template from which you copied and a timestamp.

   ![Templates list view with an example copied workflow template](/assets/images/wf-list-view-copy-example.webp)

   Select the copied template and replace the contents of the **Name** field with a new name, and provide or modify the entries in the other fields to complete this template.

3. Click **Save** when done.

<Hint type="note">

If a resource has a related resource that you don't have the right level of permission to, you cannot copy the resource, such as in the case where a project uses a credential that a current user only has *Read* access. However, for a workflow template, if any of its nodes uses an unauthorized job template, inventory, or credential, the workflow template can still be copied. But in the copied workflow template, the corresponding fields in the workflow template node will be absent.

</Hint>

## Extra Variables

<Hint type="note">

`extra_vars` passed to the job launch API are only honored if one of the following is true:

- They correspond to variables in an enabled survey
- `ask_variables_on_launch` is set to True

</Hint>

When you pass survey variables, they are passed as extra variables (`extra_vars`). This can be tricky, as passing extra variables to a workflow template (as you would do with a survey) can override other variables being passed from the inventory and project.

For example, say that you have a defined variable for an inventory for `debug = true`. It is entirely possible that this variable, `debug = true`, can be overridden in a workflow template survey.

To ensure that the variables you need to pass are not overridden, ensure they are included by redefining them in the survey. Keep in mind that extra variables can be defined at the inventory, group, and host levels.

The following table notes the behavior (hierarchy) of variable precedence in Ascender as it compares to variable precedence in Ansible.

**Variable Precedence Hierarchy (last listed wins)**:

![Ascender variable precedence hierarchy for workflows](/assets/images/architecture-awx-variable-precedence-hierarchy-workflows.webp)
