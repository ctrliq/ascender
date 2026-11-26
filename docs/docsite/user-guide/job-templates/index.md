---
title: Job Templates
description: Create, launch, schedule, and copy job templates, and configure surveys, fact caching, cloud credentials, provisioning callbacks, and extra variables.
weight: 60
---

A job template is a definition and set of parameters for running an Ansible job. Job templates are useful to execute the same job many times. Job templates also encourage the reuse of Ansible playbook content and collaboration between teams.

The **Templates** menu opens a list of the job templates that are currently available. The default view is collapsed (Compact), showing the template name, template type, and the timestamp of last job that ran using that template. You can click **Expanded** (arrow next to each entry) to expand to view more information. This list is sorted alphabetically by name, but you can sort by other criteria, or search by various fields and attributes of a template.

![Templates list view showing an example job template](/assets/images/job-templates-home-with-example-job-template.webp)

From this screen, you can launch (rocket icon), edit (pencil icon), and copy (copy icon) a job template. To delete a job template, you must select one or more templates and click the **Delete** button. Before deleting a job template, be sure it is not used in a workflow job template.

<Hint type="note">

If deleting items that are used by other work items, a message opens listing the items are affected by the deletion and prompts you to confirm the deletion. Some screens will contain items that are invalid or previously deleted, so they will fail to run. Below is an example of such a message:

![Deletion confirmation dialog listing the work items that depend on the item being deleted](/assets/images/warning-deletion-dependencies.webp)

</Hint>

<Hint type="note">

Job templates can be used to build a workflow template. Templates that show the **Workflow Visualizer** icon next to them are workflow templates. Clicking it allows you to graphically build a workflow. Many parameters in a job template allow you to enable **Prompt on Launch** that can be modified at the workflow level, and do not affect the values assigned at the job template level. For instructions, see the [Workflow Visualizer](../workflow-templates#workflow-visualizer) section.

</Hint>

## Create a Job Template

<Hint type="note">

If a field has the **Prompt on launch** checkbox selected, launching the job will prompt you for the value for that field upon launch. Most prompted values will override any values set in the job template; exceptions are noted below.

</Hint>

To create a new job template:

1. Click the **Add** button then select **Job Template** from the menu list.
2. Enter the appropriate details into the following fields:

   - **Name**: Enter a name for the job.
     - Prompt on launch: N/A
   - **Description**: Enter an arbitrary description as appropriate (optional).
     - Prompt on launch: N/A
   - **Job Type**: Choose a job type:
     - **Run**: Execute the playbook when launched, running Ansible tasks on the selected hosts.
     - **Check**: Perform a "dry run" of the playbook and report changes that would be made without actually making them. Tasks that do not support check mode will be skipped and will not report potential changes.

     More information on job types can be found in the [Playbook execution](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_intro.html#playbook-execution) section of the Ansible documentation.

     - Prompt on launch: Yes
   - **Inventory**: Choose the inventory to be used with this job template from the inventories available to the currently logged in user. A System Administrator must grant you or your team permissions to be able to use certain inventories in a job template.
     - Prompt on launch: Yes. Inventory prompts will show up as its own step in a subsequent prompt window.
   - **Project**: Choose the project to be used with this job template from the projects available to the currently logged in user.
     - Prompt on launch: N/A
   - **SCM Branch**: This field is only present if you chose a project that allows branch override. Specify the overriding branch to use in your job run. If left blank, the specified SCM branch (or commit hash or tag) from the project is used. For more detail, see [job branch overriding](../jobs#job-branch-overriding).
     - Prompt on launch: Yes
   - **Execution Environment**: Select the container image to be used to run this job. A project must be selected before you can select an execution environment.
     - Prompt on launch: Yes. Execution Environment prompts will show up as its own step in a subsequent prompt window.
   - **Playbook**: Choose the playbook to be launched with this job template from the available playbooks. This field automatically populates with the names of the playbooks found in the project base path for the selected project. Alternatively, you can enter the name of the playbook if it is not listed, such as the name of a file (like `foo.yml`) you want to use to run with that playbook. If you enter a filename that is not valid, the template will display an error, or cause the job to fail.
     - Prompt on launch: N/A
   - **Credentials**: Click the **Search** (magnifying glass) icon to open a separate window. Choose the credential from the available options to be used with this job template. Use the **Selected Category** drop-down menu to choose the credential type whose credentials are listed; it opens on **Machine**. You can select one credential of each type, and one vault credential for each vault ID: choosing another replaces the one already selected. Some credential types are not listed because they do not apply to certain job templates.
     - Prompt on launch: If selected, upon launching a job template that has a default credential and supplying another credential will replace the default credential if it is the same type. Example of such a message:

       ```text
       Job Template default credentials must be replaced
       with one of the same type. Please select a credential
       for the following types in order to proceed: Machine.
       ```

     - Alternatively, you can add more credentials as you see fit.
     - Credential prompts will show up as its own step in a subsequent prompt window.
   - **Labels**:
     - Optionally supply labels that describe this job template, such as "dev" or "test". Labels can be used to group and filter job templates and completed jobs in the display.
     - Labels are created when they are added to the Job Template. Labels are associated to a single Organization using the Project that is provided in the Job Template. Members of the Organization can create labels on a Job Template if they have edit permissions (such as admin role).
     - Once the Job Template is saved, the labels appear in the Job Templates overview in the *Expanded* view.
     - Click the **X** beside a label to remove it. When a label is removed, it is no longer associated with that particular Job or Job Template, but it will remain associated with any other jobs that reference it.
     - Jobs inherit labels from the Job Template at the time of launch. Removing a label from a Job Template does not remove it from jobs already launched.
     - Labels that are in use are listed in the **Labels** view, which you can use to browse the templates carrying each label. See [Labels](../labels).
     - Prompt on launch: If selected, even if a default value is supplied, you will be prompted upon launch to supply additional labels if needed. You will not be able to delete existing labels; clicking the **X** (delete) icon only removes the newly added labels, not existing default labels.
   - **Variables**:
     - Pass extra command line variables to the playbook. This is the `-e` or `--extra-vars` command line parameter for ansible-playbook that is documented in the Ansible documentation at [Defining variables at runtime](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html#defining-variables-at-runtime).
     - Provide key/value pairs using either YAML or JSON. These variables have a maximum value of precedence and overrides other variables specified elsewhere. An example value might be:

       ```yaml
       git_branch: production
       release_version: 1.5
       ```

     - Prompt on launch: Yes. If you want to be able to specify `extra_vars` on a schedule, you must select **Prompt on Launch** for **Variables** on the job template, or enable a survey on the job template, then those answered survey questions become `extra_vars`.
   - **Forks**: The number of parallel or simultaneous processes to use while executing the playbook. A value of zero uses the Ansible default setting, which is 5 parallel processes unless overridden in `/etc/ansible/ansible.cfg`.
     - Prompt on launch: Yes
   - **Limit**: A host pattern to further constrain the list of hosts managed or affected by the playbook. Multiple patterns can be separated by colons (`:`). As with core Ansible, `a:b` means "in group a or b", `a:b:&c` means "in a or b but must be in c", and `a:!b` means "in a, and definitely not in b". For more information and examples refer to [Patterns](https://docs.ansible.com/ansible/latest/inventory_guide/intro_patterns.html) in the Ansible documentation.
     - Prompt on launch: Yes
   - **Verbosity**: Control the level of output Ansible produces as the playbook executes. Choose the verbosity from Normal to various Verbose or Debug settings. This only appears in the "details" report view. Verbose logging includes the output of all commands. Debug logging is exceedingly verbose and includes information on SSH operations that can be useful in certain support instances. Most users do not need to see debug mode output. **Warning**: Verbosity 5 causes Ascender to block heavily when jobs are running, which could delay reporting that the job has finished (even though it has) and can cause the browser tab to lock up.
     - Prompt on launch: Yes
   - **Job Slicing**: Specify the number of slices you want this job template to run. Each slice will run the same tasks against a portion of the inventory. For more information about job slices, see [Job Slicing](../job-slicing).
     - Prompt on launch: Yes
   - **Timeout**: Allows you to specify the length of time (in seconds) that the job may run before it is canceled. Some caveats for setting the timeout value:
     - There is a global timeout defined in the settings which defaults to 0, indicating no timeout.
     - A negative timeout (less than 0) on a job template is a true "no timeout" on the job.
     - A timeout of 0 on a job template defaults the job to the global timeout (which is no timeout by default).
     - A positive timeout sets the timeout for that job template.
     - Prompt on launch: Yes
   - **Show Changes**: Allows you to see the changes made by Ansible tasks.
     - Prompt on launch: Yes
   - **Instance Groups**: Choose [Instance Groups](/admin-guide/container-instance-groups#instance-groups) to associate with this job template. If the list is extensive, use the **Search** (magnifying glass) icon to narrow the options. Note, job template instance groups contribute to the job scheduling criteria, see [Job Runtime Behavior](/admin-guide/container-instance-groups#job-runtime-behavior) and [Control Where a Job Runs](/admin-guide/container-instance-groups#control-where-a-job-runs) for rules. A System Administrator must grant you or your team permissions to be able to use an instance group in a job template. Use of a container group requires admin rights.
     - Prompt on launch: Yes. If selected, you are providing the jobs preferred instance groups in order of preference. If the first group is out of capacity, subsequent groups in the list will be considered until one with capacity is available, at which point that will be selected to run the job.
     - If you prompt for an instance group, what you enter replaces the normal instance group hierarchy and overrides all of the organizations' and inventories' instance groups.
     - Instance Groups prompts will show up as its own step in a subsequent prompt window.
   - **Job Tags**: Begin typing and selecting the **Create x** drop-down to specify which parts of the playbook should be executed. For more information and examples refer to [Tags](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_tags.html) in the Ansible documentation.
     - Prompt on launch: Yes
   - **Skip Tags**: Begin typing and selecting the **Create x** drop-down to specify certain tasks or parts of the playbook to skip. For more information and examples refer to [Tags](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_tags.html) in the Ansible documentation.
     - Prompt on launch: Yes

3. **Options**: Specify options for launching this template, if necessary.
   - **Privilege Escalation**: If checked, you enable this playbook to run as an administrator. This is the equivalent of passing the `--become` option to the `ansible-playbook` command.
   - **Provisioning Callbacks**: If checked, you enable a host to call back to Ascender via the REST API and invoke the launch of a job from this job template. Refer to [Provisioning Callbacks](#provisioning-callbacks) for additional information.
   - **Enable Webhook**: Turns on the ability to interface with a predefined SCM system web service that is used to launch a job template. Currently supported SCM systems are GitHub, GitLab, and Bitbucket Data Center.

     If you enable webhooks, other fields display, prompting for additional information:

     ![Job template Options section with webhook fields displayed](/assets/images/job-templates-options-webhooks.webp)

     - **Webhook Service**: Select which service to listen for webhooks from.
     - **Webhook URL**: Automatically populated with the URL for the webhook service to POST requests to.
     - **Webhook Key**: Generated shared secret to be used by the webhook service to sign payloads sent to Ascender. This must be configured in the settings on the webhook service in order for Ascender to accept webhooks from this service.
     - **Webhook Credential**: Optionally, provide a GitHub or GitLab personal access token (PAT) or a Bitbucket Data Center HTTP access token as a credential to use to send status updates back to the webhook service. Before you can select it, the credential must exist. See [Credential Types](../credentials#credential-types) to create one.

     For additional information on setting up webhooks, see [Webhooks](../webhooks).

   - **Concurrent Jobs**: If checked, you are allowing jobs in the queue to run simultaneously if not dependent on one another. Check this box if you want to run job slices simultaneously. Refer to [Ascender Capacity Determination and Job Impact](../jobs#ascender-capacity-determination-and-job-impact) for additional information.
   - **Enable Fact Storage**: When checked, Ascender will store gathered facts for all hosts in an inventory related to the job running.
   - **Prevent Instance Group Fallback**: Check this option to allow only the instance groups listed in the **Instance Groups** field above to execute the job. If unchecked, all available instances in the execution pool will be used based on the hierarchy described in [Control Where a Job Runs](/admin-guide/container-instance-groups#control-where-a-job-runs). Click the **Help** (tooltip) icon for more information.

   ![Create New Job Template form with example values filled in](/assets/images/job-templates-create-new-job-template.webp)

4. When you have completed configuring the details of the job template, click **Save**.

Saving the template does not exit the job template page but advances to the Job Template Details tab for viewing. After saving the template, you can click **Launch** to launch the job, or click **Edit** to add or change the attributes of the template, such as permissions, notifications, view completed jobs, and add a survey. You must first save the template prior to launching, otherwise, the **Launch** button remains grayed-out.

![Job Template Details tab for a saved job template](/assets/images/job-templates-job-template-details.webp)

You can verify the template is saved when the newly created template appears on the Templates list view.

## Add Permissions

1. In the **Access** tab, click the **Add** button.
2. Select a user or team to add and click **Next**.
3. Select one or more users or teams from the list by clicking the check box(es) next to the name(s) to add them as members and click **Next**.

   ![Add Users dialog with two users selected](/assets/images/organizations-add-users-for-example-organization.webp)

   In this example, two users have been selected to be added.

4. Select the role(s) you want the selected user(s) or team(s) to have. Be sure to scroll down for a complete list of roles. Different resources have different options available.

   ![Add Users dialog listing the roles that can be applied](/assets/images/organizations-add-users-roles.webp)

5. Click the **Save** button to apply the roles to the selected user(s) or team(s) and to add them as members.

The Add Users/Teams window closes to display the updated roles assigned for each user and team.

![Access tab with role assignments for each user and team](/assets/images/permissions-tab-roles-assigned.webp)

To remove roles for a particular user, click the disassociate (x) button next to its resource.

![Access tab with the disassociate button next to a role](/assets/images/permissions-disassociate.webp)

This launches a confirmation dialog, asking you to confirm the disassociation.

![Confirmation dialog for removing a role](/assets/images/permissions-disassociate-confirm.webp)

## Work with Notifications

Clicking the **Notifications** tab allows you to review any notification integrations you have setup and their statuses, if they have ran.

![Job template Notifications tab listing notification templates and their toggles](/assets/images/job-template-completed-notifications-view.webp)

Use the toggles to enable or disable the notifications to use with your particular template. For more detail, see [Enable and Disable Notifications](../notifications#enable-and-disable-notifications).

This tab has no **Add** button. To use a notification that has not been set up yet, create a notification template under **Administration** > **Notifications**, then enable it on this tab. Refer to [Notification Types](../notifications#notification-types) for additional details on configuring various notification types and extended messaging.

## View Jobs

The **Jobs** tab lists the jobs run from this job template. Click **Expanded** to view details of each job, including its status, ID, and name; type of job, time started and completed, who started the job; and which template, inventory, project, and credential were used. You can filter the list of jobs using any of these criteria.

![Job template Jobs tab listing jobs run from the template](/assets/images/job-template-completed-jobs-view.webp)

Sliced jobs that display on this list are labeled accordingly, with the number of sliced jobs that have run:

![Jobs list showing a sliced job labeled with its number of slices](/assets/images/sliced-job-shown-jobs-list-view.webp)

## Scheduling

Access the schedules for a particular job template from the **Schedules** tab.

![Job template Schedules tab](/assets/images/job-templates-schedules.webp)

### Schedule a Job Template

To schedule a job template run, click the **Schedules** tab.

- If schedules are already set up; review, edit, or enable/disable your schedule preferences.
- If schedules have not been set up, refer to [Schedules](../schedules) for more information.

If **Prompt on Launch** was selected for the **Credentials** field, and you create or edit scheduling information for your job template, a **Prompt** button displays at the bottom of the Schedules form. You will not be able to remove the default machine credential in the Prompt dialog without replacing it with another machine credential before you can save it.

<Hint type="note">

To be able to set `extra_vars` on schedules, you must select **Prompt on Launch** for **Variables** on the job template, or configure and enable a survey on the job template, then those answered survey questions become `extra_vars`.

</Hint>

## Surveys

Job types of Run or Check will provide a way to set up surveys in the Job Template creation or editing screens. Surveys set extra variables for the playbook similar to 'Prompt for Extra Variables' does, but in a user-friendly question and answer way. Surveys also allow for validation of user input. Click the **Survey** tab to create a survey.

Use cases for surveys are numerous. An example might be if operations wanted to give developers a "push to stage" button they could run without advanced Ansible knowledge. When launched, this task could prompt for answers to questions such as, "What tag should we release?"

Many types of questions can be asked, including multiple-choice questions.

### Create a Survey

To create a survey:

1. Click the **Survey** tab and click the **Add** button.
2. A survey can consist of any number of questions. For each question, enter the following information:
   - **Question**: The question to ask the user.
   - **Description**: (optional) A description of what's being asked of the user.
   - **Answer Variable Name**: The Ansible variable name to store the user's response in. This is the variable to be used by the playbook. Variable names cannot contain spaces.
   - **Answer Type**: Choose from the following question types.
     - *Text*: A single line of text. You can set the minimum and maximum length (in characters) for this answer.
     - *Textarea*: A multi-line text field. You can set the minimum and maximum length (in characters) for this answer.
     - *Password*: Responses are treated as sensitive information, much like an actual password is treated. You can set the minimum and maximum length (in characters) for this answer.
     - *Multiple Choice (single select)*: A list of options, of which only one can be selected at a time. Under **Multiple Choice Options**, enter each option in its own field and click **Add choice** for another field. Click the check button beside an option to make it the default answer; only one option can be the default. Click the remove button beside an option to delete it.
     - *Multiple Choice (multiple select)*: A list of options, any number of which can be selected at a time. Enter the options under **Multiple Choice Options** the same way. Click the check button beside each option that should be selected by default.
     - *Integer*: An integer number. You can set the **Minimum** and **Maximum** value for this answer.
     - *Float*: A decimal number. You can set the **Minimum** and **Maximum** value for this answer.
   - **Required**: Whether or not an answer to this question is required from the user.
   - **Minimum length** and **Maximum length**: Specify if a certain length in the answer is required.
   - **Default answer**: The default answer to the question. This value is pre-filled in the interface and is used if the answer is not provided by the user.

   ![Add Question form for a job template survey](/assets/images/job-template-create-survey.webp)

3. Once you have entered the question information, click **Save** to add the question.

   The survey question displays in the Survey list. For any question, you can click the **Edit** (pencil) icon to edit the question, or check the box next to each question and click **Delete** to delete the question, or use the toggle button at the top of the screen to enable or disable the survey prompt(s).

   ![Survey tab listing a completed survey question](/assets/images/job-template-completed-survey.webp)

   If you have more than one survey question, use the **Edit Order** button to rearrange the order of the questions by clicking and dragging on the grid icon.

   ![Survey question order being rearranged by dragging](/assets/images/job-template-rearrange-survey.webp)

4. To add more questions, click the **Add** button to add additional questions.

### Optional Survey Questions

The **Required** setting on a survey question determines whether the answer is optional or not for the user interacting with it.

Behind the scenes, optional survey variables can be passed to the playbook in `extra_vars`, even when they aren't filled in.

- If a question is marked as optional, is not filled in, and has a default answer, the default answer is passed to the playbook.
- If a question is marked as optional, is not filled in, and has no default answer, no survey `extra_var` is passed to the playbook. This includes Text and Textarea questions: an empty answer is not passed as an empty string ( `""` ).
- Password questions are the exception: an optional Password question that is not filled in and has no default answer is passed to the playbook as an empty string ( `""` ), unless its minimum length is greater than 0.

## Launch a Job Template

A major benefit of Ascender is the push-button deployment of Ansible playbooks. You can easily configure a template to store all parameters you would normally pass to the ansible-playbook on the command line: not just the playbooks, but the inventory, credentials, extra variables, and all options and settings you can specify on the command line.

Easier deployments drive consistency, by running your playbooks the same way each time, and allow you to delegate responsibilities: even users who aren't Ansible experts can run playbooks written by others.

Launch a job template by any of the following ways:

- Access the job template list from the **Templates** menu on the left navigation bar or while in the Job Template Details view, scroll to the bottom to access the **Launch** (rocket) icon from the list of templates.

  ![Templates list view with the Launch icon next to an example job template](/assets/images/job-templates-home-with-example-job-template-launch.webp)

- While in the Job Template Details view of the job template you want to launch, click **Launch**.

A job may require additional information to run. The following data may be requested at launch:

- Credentials that were setup
- The option **Prompt on Launch** is selected for any parameter
- Passwords or passphrases that have been set to **Ask**
- A survey, if one has been configured for the job templates
- Extra variables, if requested by the job template

<Hint type="note">

If a job has user-provided values, then those are respected upon relaunch. If the user did not specify a value, then the job uses the default value from the job template. Jobs are not relaunched as-is. They are relaunched with the user prompts re-applied to the job template.

</Hint>

Below is an example job launch that prompts for Job Tags, and runs the example survey created in [Surveys](#surveys).

![Launch prompt window asking for job tags](/assets/images/job-launch-with-prompt-at-launch-jobtags.webp)

![Launch prompt window showing the survey questions](/assets/images/job-launch-with-prompt-at-launch-survey.webp)

<Hint type="note">

Providing values on one tab, and going back to a previous tab, and then continuing on to the next tab will result in having to re-provide values on the rest of the tabs. Make sure you fill in the tabs in the order the prompts appear to avoid this.

</Hint>

Along with any extra variables set in the job template and survey, Ascender automatically adds the following variables to the job environment. Also note, `awx_*` variables are defined by the system and cannot be overridden. Variables about the job context, like `awx_job_template_name` are not affected if they are set in `extra_vars`.

- `awx_job_id`: The Job ID for this job run
- `awx_job_launch_type`: The description to indicate how the job was started:
  - **manual**: Job was started manually by a user.
  - **relaunch**: Job was started via relaunch.
  - **callback**: Job was started via host callback.
  - **scheduled**: Job was started from a schedule.
  - **dependency**: Job was started as a dependency of another job.
  - **workflow**: Job was started from a workflow job.
  - **sync**: Job was started from a project sync.
  - **scm**: Job was created as an Inventory SCM sync.
  - **webhook**: Job was started from a webhook event.
- `awx_job_template_id`: The Job Template ID that this job run uses
- `awx_job_template_name`: The Job Template name that this job uses
- `awx_execution_node`: The Execution Node name that launched this job
- `awx_project_revision`: The revision identifier for the source tree that this particular job uses (it is also the same as the job's field `scm_revision`)
- `awx_project_scm_branch`: The configured default project SCM branch for the project the job template uses
- `awx_job_scm_branch`: If the SCM Branch is overwritten by the job, the value is shown here
- `awx_user_email`: The user email of the Ascender user that started this job. This is not available for callback or scheduled jobs.
- `awx_user_first_name`: The user's first name of the Ascender user that started this job. This is not available for callback or scheduled jobs.
- `awx_user_id`: The user ID of the Ascender user that started this job. This is not available for callback or scheduled jobs.
- `awx_user_last_name`: The user's last name of the Ascender user that started this job. This is not available for callback or scheduled jobs.
- `awx_user_name`: The user name of the Ascender user that started this job. This is not available for callback or scheduled jobs.
- `awx_schedule_id`: If applicable, the ID of the schedule that launched this job
- `awx_schedule_name`: If applicable, the name of the schedule that launched this job
- `awx_workflow_job_id`: If applicable, the ID of the workflow job that launched this job
- `awx_workflow_job_name`: If applicable, the name of the workflow job that launched this job. Note this is also the same as the workflow job template.
- `awx_inventory_id`: If applicable, the ID of the inventory this job uses
- `awx_inventory_name`: If applicable, the name of the inventory this job uses

For compatibility, every variable is also available with the `ascender_` and `tower_` prefixes, for example `ascender_job_id` and `tower_job_id`.

Upon launch, Ascender automatically redirects the web browser to the Job Status page for this job under the **Jobs** tab.

<Hint type="note">

You can re-launch the most recent job from the list view to re-run on all hosts or just failed hosts in the specified inventory. Refer to [Jobs](../jobs) for more detail.

</Hint>

When slice jobs are running, job lists display the workflow and job slices, as well as a link to view their details individually.

![Jobs list showing a running sliced job and its slices](/assets/images/sliced-job-shown-jobs-list-view.webp)

<Hint type="note">

You may launch jobs in bulk using the endpoint in the API, `/api/v2/bulk/job_launch`. This endpoint accepts JSON and you can specify a list of unified job templates (such as job templates, project updates, etc) to launch. The user must have the appropriate permission to launch all the jobs. Either all jobs are launched, or an error is returned indicating why the operation was not able to complete. Use the **OPTIONS** request to return relevant schema.

</Hint>

## Copy a Job Template

If you choose to copy Job Template, it **does not** copy any associated schedule, notifications, or permissions. Schedules and notifications must be recreated by the user or admin creating the copy of the Job Template. The user copying the Job Template will be granted the admin permission, but no permissions are assigned (copied) to the Job Template.

1. Access the job template list from the **Templates** menu on the left navigation bar or while in the Job Template Details view, scroll to the bottom to access it from the list of templates.

   ![Templates list view showing an example job template](/assets/images/job-templates-home-with-example-job-template.webp)

2. Click the **Copy** icon associated with the template you want to copy.

   The new template with the name of the template from which you copied and a timestamp displays in the list of templates.

3. Click to open the new template and click **Edit**.
4. Replace the contents of the **Name** field with a new name, and provide or modify the entries in the other fields to complete this page.
5. Click **Save** when done.

### Fact Scan Playbooks

A fact scan is an ordinary playbook run from a job template with **Enable Fact Storage** checked, so that the facts the playbook gathers are stored for each host and shown on the host's **Facts** tab. Along with Ansible's standard fact gathering, the `ansible.builtin.package_facts` and `ansible.builtin.service_facts` modules add the installed packages and the services of each host to its facts:

```yaml
- hosts: all
  tasks:
    - name: Gather the installed packages
      ansible.builtin.package_facts:

    - name: Gather the services
      ansible.builtin.service_facts:
```

See [Fact Caching](#fact-caching) for how stored facts are saved and used.

### Custom Fact Scans

A playbook for a custom fact scan is similar to the example of the Fact Scan Playbook above. As an example, a playbook that only uses a custom `scan_foo` Ansible fact module would look like this:

*scan_custom.yml*:

```yaml
- hosts: all
  gather_facts: false
  tasks:
    - scan_foo:
```

*scan_foo.py*:

```python
def main():
    module = AnsibleModule(
        argument_spec = dict())

    foo = [
      {
        "hello": "world"
      },
      {
        "foo": "bar"
      }
    ]
    results = dict(ansible_facts=dict(foo=foo))
    module.exit_json(**results)

main()
```

To use a custom fact module, ensure that it lives in the `/library/` subdirectory of the Ansible project used in the job template. This fact scan module is very simple, returning a hard-coded set of facts:

```json
[
  {
    "hello": "world"
  },
  {
    "foo": "bar"
  }
]
```

Refer to the [Creating an info or a facts module](https://docs.ansible.com/ansible/latest/dev_guide/developing_modules_general.html#creating-an-info-or-a-facts-module) section of the Ansible documentation for more information.

## Fact Caching

Ascender can store and retrieve facts on a per-host basis through an Ansible Fact Cache plugin. This behavior is configurable on a per-job template basis. Fact caching is turned off by default but can be enabled to serve fact requests for all hosts in an inventory related to the job running. This allows you to use job templates with `--limit` while still having access to the entire inventory of host facts. A global timeout setting that the plugin enforces per-host, can be specified (in seconds) through the Jobs settings menu:

![Jobs Settings window showing the location of the Per-Host Ansible Fact Cache Timeout parameter from the Edit Details screen](/assets/images/configure-ascender-jobs-fact-cache-timeout.webp)

Upon launching a job that uses fact cache (`use_fact_cache=True`), Ascender will store all `ansible_facts` associated with each host in the inventory associated with the job. The Ansible Fact Cache plugin that ships with Ascender will only be enabled on jobs with fact cache enabled (`use_fact_cache=True`).

When a job that has fact cache enabled (`use_fact_cache=True`) finishes running, Ascender will restore all records for the hosts in the inventory. Any records with update times *newer* than the currently stored facts per-host will be updated in the database.

New and changed facts will be logged via Ascender's logging facility. Specifically, to the `system_tracking` namespace or logger. The logging payload will include the fields:

- `host_name`
- `inventory_id`
- `ansible_facts`

where `ansible_facts` is a dictionary of all Ansible facts for `host_name` in the Ascender inventory, `inventory_id`.

<Hint type="note">

If a hostname includes a forward slash (`/`), fact cache will not work for that host. If you have an inventory with 100 hosts and one host has a `/` in the name, 99 of those hosts will still collect facts.

</Hint>

### Benefits of Fact Caching

Fact caching saves a significant amount of time over running fact gathering. If you have a playbook in a job that runs against a thousand hosts and forks, you could easily spend 10 minutes gathering facts across all of those hosts. But if you run a job on a regular basis, the first run of it caches these facts and the next run will just pull them from the database. This cuts the runtime of jobs against large inventories, including Smart Inventories, by an enormous magnitude.

<Hint type="note">

Do not modify the `ansible.cfg` file to apply fact caching. Custom fact caching could conflict with Ascender's fact caching feature. It is recommended to use the fact caching module that comes with Ascender.

</Hint>

You can choose to use cached facts in your job by enabling it in the **Options** field of the Job Templates window.

![Job template Options field with Enable Fact Storage selected](/assets/images/job-templates-options-use-factcache.webp)

To clear facts, you need to run the Ansible `clear_facts` [meta task](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/meta_module.html#examples). Below is an example playbook that uses the Ansible `clear_facts` meta task.

```yaml
- hosts: all
  gather_facts: false
  tasks:
    - name: Clear gathered facts from all currently targeted hosts
      meta: clear_facts
```

You can find the API endpoint for fact caching at:

```text
http://<ascender server name>/api/v2/hosts/x/ansible_facts
```

## Utilizing Cloud Credentials

Cloud Credentials can be used when syncing a respective cloud inventory. Cloud Credentials may also be associated with a Job Template and included in the runtime environment for use by a playbook. Cloud Credentials currently supported:

- [OpenStack](#openstack)
- [Amazon Web Services](#amazon-web-services)
- [Google](#google)
- [Azure](#azure)
- [VMware](#vmware)

### OpenStack

The sample playbook below invokes the `nova_compute` Ansible OpenStack cloud module and requires credentials to do anything meaningful, and specifically requires the following information: `auth_url`, `username`, `password`, and `project_name`. These fields are made available to the playbook via the environmental variable `OS_CLIENT_CONFIG_FILE`, which points to a YAML file written by Ascender based on the contents of the cloud credential. This sample playbook loads the YAML file into the Ansible variable space.

`OS_CLIENT_CONFIG_FILE` example:

```yaml
clouds:
  devstack:
    auth:
      auth_url: http://devstack.yoursite.com:5000/v2.0/
      username: admin
      password: your_password_here
      project_name: demo
```

Playbook example:

```yaml
- hosts: all
  gather_facts: false
  vars:
    config_file: "{{ lookup('env', 'OS_CLIENT_CONFIG_FILE') }}"
    nova_tenant_name: demo
    nova_image_name: "cirros-0.3.2-x86_64-uec"
    nova_instance_name: autobot
    nova_instance_state: 'present'
    nova_flavor_name: m1.nano

    nova_group:
      group_name: antarctica
      instance_name: deceptacon
      instance_count: 3
  tasks:
    - debug: msg="{{ config_file }}"
    - stat: path="{{ config_file }}"
      register: st
    - include_vars: "{{ config_file }}"
      when: st.stat.exists and st.stat.isreg

    - name: "Print out clouds variable"
      debug: msg="{{ clouds|default('No clouds found') }}"

    - name: "Setting nova instance state to: {{ nova_instance_state }}"
      local_action:
        module: nova_compute
        login_username: "{{ clouds.devstack.auth.username }}"
        login_password: "{{ clouds.devstack.auth.password }}"
```

### Amazon Web Services

Amazon Web Services cloud credentials are exposed as the following environment variables during playbook execution (in the job template, choose the cloud credential needed for your setup):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

All of the AWS modules will implicitly use these credentials when run via Ascender without having to set the `aws_access_key_id` or `aws_secret_access_key` module options.

### Google

Google cloud credentials are exposed as the following environment variables during playbook execution (in the job template, choose the cloud credential needed for your setup):

- `GCE_EMAIL`
- `GCE_PROJECT`
- `GCE_CREDENTIALS_FILE_PATH`

All of the Google modules will implicitly use these credentials when run via Ascender without having to set the `service_account_email`, `project_id`, or `pem_file` module options.

### Azure

Azure cloud credentials are exposed as the following environment variables during playbook execution (in the job template, choose the cloud credential needed for your setup):

- `AZURE_SUBSCRIPTION_ID`
- `AZURE_CLIENT_ID`, `AZURE_TENANT`, and `AZURE_SECRET`, when the credential has a client ID and a tenant ID (a service principal)
- `AZURE_AD_USER` and `AZURE_PASSWORD`, otherwise
- `AZURE_CLOUD_ENVIRONMENT`, when the credential sets an Azure cloud environment

All of the Azure modules implicitly use these credentials when run via Ascender without having to set the `subscription_id`, `client_id`, `tenant`, `secret`, `ad_user`, or `password` module options.

### VMware

VMware cloud credentials are exposed as the following environment variables during playbook execution (in the job template, choose the cloud credential needed for your setup):

- `VMWARE_USER`
- `VMWARE_PASSWORD`
- `VMWARE_HOST`

The sample playbook below demonstrates usage of these credentials:

```yaml
- vsphere_guest:
    vcenter_hostname: "{{ lookup('env', 'VMWARE_HOST') }}"
    username: "{{ lookup('env', 'VMWARE_USER') }}"
    password: "{{ lookup('env', 'VMWARE_PASSWORD') }}"
    guest: newvm001
    from_template: yes
    template_src: linuxTemplate
    cluster: MainCluster
    resource_pool: "/Resources"
    vm_extra_config:
      folder: MyFolder
```

## Provisioning Callbacks

Provisioning callbacks are a feature of Ascender that allow a host to initiate a playbook run against itself, rather than waiting for a user to launch a job to manage the host from the Ascender UI. Please note that provisioning callbacks are *only* used to run playbooks on the calling host. Provisioning callbacks are meant for cloud bursting (i.e. new instances with a need for client to server communication for configuration (such as transmitting an authorization key)), not to run a job against another host. This provides for automatically configuring a system after it has been provisioned by another system (such as AWS auto-scaling, or a OS provisioning system like kickstart or preseed) or for launching a job programmatically without invoking the Ascender API directly. The Job Template launched only runs against the host requesting the provisioning.

Frequently this would be accessed via a firstboot type script, or from cron.

To enable callbacks, check the **Provisioning Callbacks** checkbox in the Job Template. This displays the **Provisioning Callback URL** for this job template.

<Hint type="note">

If you intend to use Ascender's provisioning callback feature with a dynamic inventory, Update on Launch should be set for the inventory group used in the Job Template.

</Hint>

![Job template with Provisioning Callbacks enabled, showing the callback URL and Host Config Key fields](/assets/images/provisioning-callbacks-config.webp)

Callbacks also require a Host Config Key, to ensure that foreign hosts with the URL cannot request configuration. Please provide a custom value for Host Config Key. The host key may be reused across multiple hosts to apply this job template against multiple hosts. Should you wish to control what hosts are able to request configuration, the key may be changed at any time.

To callback manually via REST, look at the callback URL in the UI, which is of the form:

```text
https://<ASCENDER_SERVER_NAME>/api/v2/job_templates/7/callback/
```

The '7' in this sample URL is the job template ID in Ascender.

The request from the host must be a POST. Here is an example using curl:

```bash
curl -k -f -i -H 'Content-Type:application/json' -XPOST -d '{"host_config_key": "redhat"}' \
                 https://<ASCENDER_SERVER_NAME>/api/v2/job_templates/7/callback/
```

The requesting host must be defined in your inventory for the callback to succeed. If Ascender fails to locate the host either by name or IP address in one of your defined inventories, the request is denied. When running a Job Template in this way, the host initiating the playbook run against itself must be in the inventory. If the host is missing from the inventory, the request fails with a `No matching host could be found!` error message.

<Hint type="note">

If your host is not in inventory and `Update on Launch` is set for the inventory group, Ascender attempts to update cloud based inventory source before running the callback.

</Hint>

Ascender identifies the calling host from the address of the request. It collects every address found in the headers listed in the **Remote Host Headers** setting, adds their reverse DNS names, and compares the results against each host's `ansible_host` value (or host name) in the job template's inventory. The job runs only if exactly one host matches. If no host matches, the request fails with `No matching host could be found!`, and if more than one host matches, it fails with `Multiple hosts matched the request!`.

When Ascender runs on Kubernetes, it sits behind an ingress controller, so the default **Remote Host Headers** setting identifies every callback as coming from the ingress rather than from the calling host. To use provisioning callbacks, configure Ascender to read the client address from `X-Forwarded-For` and make sure your ingress passes the real client address. See [Proxy Support](/admin-guide/proxy-support) for details, including the configuration needed on K3s.

<Hint type="warning">

Do not include ingress controller or Kubernetes node addresses in an inventory used for provisioning callbacks. Depending on your configuration, Ascender can see the ingress address alongside the calling host's address and run the job against the ingress host instead.

</Hint>

Successful requests result in an entry on the Jobs tab, where the results and history can be viewed.

Ascender does not ship a callback script, but a script that retries the request is a more robust way to use callbacks than a single `curl` request. The following example, saved as `request_configuration.sh`, takes the Ascender server, the job template ID, the host config key and, optionally, extra variables as a JSON object. It succeeds on any 2xx response, stops on a 403 or 404 response, and retries any other response once per minute for up to ten minutes:

```bash
#!/bin/bash
# Usage: ./request_configuration.sh <server> <template id> <host config key> [extra vars JSON]
SERVER=$1
TEMPLATE_ID=$2
HOST_CONFIG_KEY=$3
EXTRA_VARS=$4

if [ -n "$EXTRA_VARS" ]; then
  DATA="{\"host_config_key\": \"$HOST_CONFIG_KEY\", \"extra_vars\": $EXTRA_VARS}"
else
  DATA="{\"host_config_key\": \"$HOST_CONFIG_KEY\"}"
fi

for ATTEMPT in 1 2 3 4 5 6 7 8 9 10; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' --data "$DATA" \
    "$SERVER/api/v2/job_templates/$TEMPLATE_ID/callback/")
  case "$STATUS" in
    2??) echo "Success: $STATUS received."; exit 0 ;;
    403|404) echo "Failed: $STATUS received, halting."; exit 1 ;;
  esac
  echo "Failed: $STATUS received, retry $ATTEMPT in 1 minute."
  sleep 60
done
exit 1
```

For example, `./request_configuration.sh https://ascender.example.com 7 <host config key>`.

<Hint type="note">

Please note that this is an example script. You should edit this script if you need more dynamic behavior when detecting failure scenarios, as any non-200 error code may not be a transient error requiring retry.

</Hint>

Most likely you will use callbacks with dynamic inventory in Ascender, such as pulling cloud inventory from one of the supported cloud providers. In these cases, along with setting *Update On Launch*, be sure to configure an inventory cache timeout for the inventory source, to avoid hammering of your Cloud's API endpoints. Since the example `request_configuration.sh` script polls once per minute for up to ten minutes, a suggested cache invalidation time for inventory (configured on the inventory source itself) would be one or two minutes.

While we recommend against running the `request_configuration.sh` script from a cron job, a suggested cron interval would be perhaps every 30 minutes. Repeated configuration can be easily handled by scheduling in Ascender, so the primary use of callbacks by most users is to enable a base image that is bootstrapped into the latest configuration upon coming online. To do so, running at first boot is a better practice. First boot scripts are just simple init scripts that typically self-delete, so you would set up an init script that called a copy of the `request_configuration.sh` script and make that into an autoscaling image.

### Passing Extra Variables to Provisioning Callbacks

Just as you can pass `extra_vars` in a regular Job Template, you can also pass them to provisioning callbacks. To pass `extra_vars`, the data sent must be part of the body of the POST request as application/json (as the content type). Use the following JSON format as an example when adding your own `extra_vars` to be passed:

```text
'{"extra_vars": {"variable1":"value1","variable2":"value2",...}}'
```

You can also pass extra variables to the Job Template call using `curl`, such as is shown in the following example:

```bash
$ curl -f -H 'Content-Type: application/json' -XPOST \
    -d '{"host_config_key": "redhat", "extra_vars": "{\"foo\": \"bar\"}"}' \
    https://<ASCENDER_SERVER_NAME>/api/v2/job_templates/7/callback
```

For more information, refer to [Launching Jobs with Curl](/admin-guide/tips-and-tricks#launching-jobs-with-curl).

## Extra Variables

<Hint type="note">

`extra_vars` passed to the job launch API are only honored if one of the following is true:

- They correspond to variables in an enabled survey
- `ask_variables_on_launch` is set to True

</Hint>

When you pass survey variables, they are passed as extra variables (`extra_vars`) within Ascender. This can be tricky, as passing extra variables to a job template (as you would do with a survey) can override other variables being passed from the inventory and project.

By default, `extra_vars` are marked as `!unsafe` unless you specify them on the job template's Extra Variables section. These are trusted, because they can only be added by users with enough privileges to add or edit a Job Template. For example, nested variables do not expand when entered as a prompt, as the Jinja brackets are treated as a string. For more information about unsafe variables, see [unsafe or raw strings](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_advanced_syntax.html#unsafe-or-raw-strings).

For example, say that you have a defined variable for an inventory for `debug = true`. It is entirely possible that this variable, `debug = true`, can be overridden in a job template survey.

To ensure that the variables you need to pass are not overridden, ensure they are included by redefining them in the survey. Keep in mind that extra variables can be defined at the inventory, group, and host levels.

If specifying the `ALLOW_JINJA_IN_EXTRA_VARS` parameter, refer to the [Ascender Tips and Tricks](/admin-guide/tips-and-tricks#the-allow_jinja_in_extra_vars-variable) section of the [Ascender admin guides](/admin-guide) to configure it in the Jobs Settings screen of the Ascender UI.

<Hint type="note">

The Job Template extra variables dictionary is merged with the Survey variables.

</Hint>

Here are some simplified examples of `extra_vars` in YAML and JSON formats:

The configuration in YAML format:

```yaml
launch_to_orbit: true
satellites:
  - sputnik
  - explorer
  - satcom
```

The configuration in JSON format:

```json
{
  "launch_to_orbit": true,
  "satellites": ["sputnik", "explorer", "satcom"]
}
```

The following table notes the behavior (hierarchy) of variable precedence in Ascender as it compares to variable precedence in Ansible.

**Ascender Variable Precedence Hierarchy (last listed wins)**:

![Ascender variable precedence hierarchy compared with Ansible variable precedence](/assets/images/architecture-awx-variable-precedence-hierarchy.webp)

### Relaunching Job Templates

A relaunch (a job whose `launch_type` is `relaunch`) is not a copy of the job being relaunched. Ascender applies the values that were supplied when that job was launched, such as its prompted `extra_vars` and survey answers, to the job template as it is now. Everything that was not supplied at launch comes from the job template's current settings, including its `extra_vars`.

For example, say that you launch a Job Template with no `extra_vars`, which results in the creation of a Job called **j1**. Next, say that you edit the Job Template and add some `extra_vars` (such as `{"hello": "world"}`).

Relaunching **j1** results in the creation of **j2**, which includes `{"hello": "world"}`, because the relaunch uses the job template's current `extra_vars`. If **j1** had been launched with prompted `extra_vars`, **j2** would include those as well, and where both set the same variable, the value supplied for **j1** wins.
