## Launch-time Configurations / Prompting

Admins of templates in Ascender have the option to allow fields to be overwritten
by user-provided values at the time of launch. The job that runs will
then use the launch-time values in lieu of the template values.

The rules are in `src/internal/api/job_launch.go` (`acceptPrompts` for job
templates), `src/internal/api/workflow_templates.go`
(`acceptWorkflowLaunchPrompts` for workflow job templates) and
`src/internal/api/schedule_write.go` (saved launch configurations).

Fields that can be prompted for, and corresponding `"ask_"` variables
(which exist on the template and must be set to `true` to enable prompting)
are the following:


##### Standard Pattern

 - `ask_<variable>_on_launch` allows use of `<variable>`

The standard pattern applies to the following fields of a job template:

 - `job_type`
 - `skip_tags`
 - `limit`
 - `diff_mode`
 - `verbosity`
 - `scm_branch`
 - `inventory`
 - `labels`
 - `execution_environment`
 - `forks`
 - `job_slice_count`
 - `timeout`
 - `instance_groups`


##### Non-Standard Cases

 - `ask_variables_on_launch` allows unrestricted use of `extra_vars`
 - `ask_tags_on_launch` allows use of `job_tags`
 - Enabled survey allows restricted use of `extra_vars`, only for variables in survey (with qualifiers)
 - `ask_credential_on_launch` allows use of `credentials`

Surveys are a special case of prompting for variables: applying a survey to
a template allows the variable names in the survey spec (requires the survey
spec to exist and `survey_enabled` to be true), and the answers are validated
against the questions. On the other hand,
if `ask_variables_on_launch` is true, users can provide any variables in
`extra_vars`.

A workflow job template prompts for `extra_vars`, `inventory`, `limit`,
`scm_branch`, `job_tags`, `skip_tags` and `labels`, with the same `ask_`
fields (see [Workflow Launch Configuration](./workflow.md#workflow-launch-configuration)).

Prompting for credentials of all types is controlled by `ask_credential_on_launch`.
Clients can provide a list of credentials of any type, but only one of _each_ type, in
`credentials` on a POST to the launch endpoint.
If the job is being spawned by a saved launch configuration (such as a schedule),
credentials are managed by the many-to-many relationship `credentials` of
the launch configuration object.
The credentials in this relationship will either add to the job template's
credential list, or replace a credential in the job template's list if it
is the same type. See [Multi-Credential Assignment](./credentials/multi_credential_assignment.md).

Prompted labels are added to the template's labels; prompted instance groups
replace the instance groups the job would otherwise run on.


### Manual Use of Prompts

Fields enabled as prompts in the template can be used for the following
actions in the API:

 - POST to `/api/v2/job_templates/N/launch/` (can accept all prompt-able fields)
 - POST to `/api/v2/workflow_job_templates/N/launch/` (can accept certain fields, see [Workflows](./workflow.md))
 - POST to `/api/v2/system_job_templates/N/launch/` (can accept certain fields, with no user configuration)

`GET` on a launch endpoint shows the template's `ask_` fields, its current
values under `defaults`, `variables_needed_to_start` (the variables of the required
survey questions), `passwords_needed_to_start`, and
`can_start_without_user_input`.

When launching manually with `credentials`, existing credentials on the job
template may only be removed if replaced by another credential of the same
type. This is so that relaunch will use the up-to-date credential on the
template if it has been edited since the prior launch.


#### Data Rules for Prompts

For the POST action to launch, data for "prompts" are provided as top-level
keys in the request data. There is a special case to allow a list to be
provided for `credentials`, which is otherwise not possible in Ascender API design.
The list of credentials provided in the POST data will become the list
for the spawned job.

A field that is not being overridden should be left out of the payload:
none of the launch fields takes `null`, which is refused with `400`
(`This field may not be null.` under the field's name), `inventory_id` (the
old name of `inventory`) and `credential_passwords` included. A workflow job
template's launch reads only its own fields (`extra_vars`, `inventory`,
`limit`, `scm_branch`, `labels`, `job_tags` and `skip_tags`; an
`inventory_id` there replaces `inventory`) and ignores the others, `null` or
not. The same holds for an ad hoc command's `limit`, `module_args`,
`extra_vars`, `verbosity` and `instance_groups`.

Example:

POST to `/api/v2/job_templates/N/launch/` with data:

```json
{
  "job_type": "check",
  "limit": "",
  "credentials": [1, 2, 4, 5],
  "extra_vars": {}
}
```

...where the job template has credentials `[2, 3, 5]`, and the credential types
are the following:

 - 1 - gce
 - 2 - ssh
 - 3 - gce
 - 4 - aws
 - 5 - openstack

Assuming that the job template is configured to prompt for all of these
fields, here is what happens in this action:

 - `job_type` of the job takes the value of "check"
 - `limit` of the job takes the value of `""`, which means that Ansible will
   target all hosts in the inventory, even though the job template may have
   been targeted to a smaller subset of hosts
 - The job uses the `credentials` with primary keys 1, 2, 4, and 5
 - `extra_vars` of the job template will be used without any overrides

If `extra_vars` in the request data contains some keys, these will
be combined with the job template `extra_vars` dictionary, with the
request data taking precedence. Survey answers come after the survey's
defaults, which come after the template's variables.

Provided credentials will replace any job template credentials of the same
exclusive type. In the example, the job template
Credential 3 was replaced with the provided Credential 1, because a job
may only use one GCE credential because these two credentials define the
same environment variables and configuration file.
If the launch had left out Credential 3 without providing Credential 1, a 400
error would have been returned because the job must contain the same types of
credentials as its job template.

The UI's prompt wizard checks this before it submits: on the Credentials step
of a job template's launch, schedule or workflow node prompt, each of the
template's own credentials must be replaced by one of the same type (a vault
credential by one with the same vault ID), and a schedule or workflow node
cannot be given a credential that asks for a password at launch. Workflow job
templates are not checked.

A prompted value equal to the template's own is not a change and is accepted
whether or not the template prompts for it.


### Saved Launch-time Configurations

Several other mechanisms which automatically launch jobs can apply prompts
at launch-time that are saved in advance:

 - Workflow nodes
 - Schedules
 - Job relaunch / re-scheduling
 - (partially) Workflow job templates

In the case of workflow nodes and schedules, the prompted fields are saved
directly on the object: workflow job template nodes, workflow job nodes (a
copy of the first) and schedules. They take `inventory`,
`execution_environment`, `scm_branch`, `job_type`, `job_tags`, `skip_tags`,
`limit`, `diff_mode`, `verbosity`, `forks`, `job_slice_count`, `timeout`, and
`extra_data` (the variables, under that name for historical reasons). Setting
one of these to `null` removes it from the saved configuration. A `PUT`
(and a create) sets the char prompts it leaves out (`scm_branch`,
`job_type`, `job_tags`, `skip_tags`, `limit`, `diff_mode`, `verbosity`,
`forks`, `job_slice_count` and `timeout`) to `null`, so it removes them; a
`PATCH` leaves them as they are. A schedule's `PUT` must name its
`unified_job_template` (`This field is required.`).

The many-to-many `credentials`, `labels` and `instance_groups` differ from
the other fields because they are managed through sub-endpoints of the node
or schedule (`/api/v2/schedules/N/credentials/`,
`/api/v2/workflow_job_template_nodes/N/credentials/`, and so on). The
credentials there are the _additional_ credentials to apply when it spawns a
job.

Jobs themselves have a launch configuration stored in a related table
(`main_joblaunchconfig`), only used to prepare the launch-time configuration
for a later relaunch and re-scheduling of the job. To see these prompts for a
particular job, do a GET to `/api/v2/jobs/N/create_schedule/`.

A saved configuration is checked against its template's prompting rules
when it is saved (`LaunchConfigurationBaseSerializer.validate`). Which
prompts are checked depends on the request:

 - a request that sets `unified_job_template` (a create, a schedule's
   `PUT`, or any request naming it, even unchanged) checks the whole saved
   configuration as it will be, the `credentials`, `labels` and
   `instance_groups` already attached included;
 - otherwise a request that sends prompt fields checks only those (with
   `extra_data` standing for the variables); since a job template's survey
   is checked whenever prompts are, a schedule update that sends a prompt
   field but not `extra_data` is refused when the survey has required
   questions without answers in that request;
 - a request that sends no prompt field (a new `name`, `description` or
   `enabled`, a node's `identifier`) checks nothing.

A value for a field a job template or workflow job template does not prompt
for is refused with `Field is not configured to prompt on launch.`
(variables with ``Variables <names> are not allowed on launch. ...`` under
`extra_data`), and survey answers are validated as at launch (an encrypted
password answer decrypted). A workflow job template ignores the prompts it
has no `ask_` field for (`job_type`, `verbosity`, and so on). A schedule
also needs the answers to the required survey questions (`'<variable>' value
missing` under `variables_needed_to_start`); a workflow node does not, since
the workflow may provide them. Projects, inventory sources and approval
templates take no prompts: every prompt field sent is refused with `Field is
not allowed on launch.` A system job template's schedule refuses its
prompt fields the same way and takes only `days`, `older_than` and
`granularity` in `extra_data` (``Variables <names> are not allowed for
system jobs.``); for the cleanup jobs `days` must be a whole number, not
negative (`days must be a positive integer.`).

A survey password answer is stored encrypted. Sent back as `$encrypted$`,
it keeps the stored answer; with no stored answer it is dropped when the
question has a default (the default then applies at launch), and refused
otherwise (`Provided variable <name> has no database value to replace
with.`). `$encrypted$` for a variable that is not a survey password is
refused (`"$encrypted$ is a reserved keyword, may not be used for
<name>."`), and a non-superuser may not send an encrypted value.

Activity stream entries and notification messages never show the
ciphertext itself: every encrypted value in the variables they carry
reads `$encrypted$`. That holds for one written with escaped dollar signs
(`$` in JSON, `\x24` in YAML) and for variables kept as text inside
an entry too. Such text is parsed, and when it held one it is shown
masked and written out again as JSON; other text is shown as written.


#### Workflow Node Launch Configuration

Workflow job nodes combine `extra_vars` from their parent
workflow job with the variables that they provide in
`extra_data`, as well as artifacts from prior job runs. Both of these
sources of variables have higher precedence than the variables defined in
the node.

All prompts that a workflow node passes to a spawned job abide by the
rules of the related template.
That means that if the node's job template has `ask_variables_on_launch` set
to false with no survey, the workflow node's variables will not
take effect in the job that is spawned.
If the node's job template has `ask_inventory_on_launch` set to false and
the node provides an inventory, this resource will not be used in the spawned
job. If a user creates a node that would do this, a 400 response will be returned.


#### Workflow Job Template Prompts

Workflow job templates are different from other cases because they do not have a
template directly linked, so their prompts are a form of action-at-a-distance.
When the node's prompts are gathered to spawn its job, any prompts from the workflow job
will take precedence over the node's value.

As a special exception, `extra_vars` from a workflow will not obey the job template survey
and prompting rules: they are passed to the jobs of job template nodes as they
are. For a nested workflow node, the workflow's and the node's variables are
combined and pass the nested workflow job template's rules.

Other than that exception, job template prompting rules are still adhered to when
a job is spawned. The workflow job's labels are not passed on: when the job
template asks for labels, its job gets the node's labels, never the
workflow's. (The workflow job of a sliced job template keeps the job
template launch's labels, which its slices get.)


#### Job Relaunch and Re-scheduling

Job relaunch does not allow a user to provide any prompted fields at the time of relaunch.
Relaunching re-applies all the prompts used at the
time of the original launch, to the current job template (even if it has been
modified). A user with execute on the job template may relaunch when the job
used no prompts, or only prompts the template still asks for and resources the
user can use; otherwise relaunching takes execute on the job's organization
("Job was launched with prompted fields you do not have access to."). A job
launched with prompts that include survey passwords can be relaunched only by
the user who launched it or a superuser, not even by an organization admin
("Job was launched with secret prompts provided by another user.").

Those same rules apply when creating a schedule from a job with the
`/api/v2/jobs/N/create_schedule/` endpoint. The schedule is created disabled,
named "Auto-generated schedule from job N", with the job's launch
configuration.

Jobs orphaned by a deleted job template can be relaunched,
but only with Organization or System Administrator privileges.


#### Credential Password Prompting Restriction

If a job template uses a credential that is configured to prompt for a
password at launch, these passwords cannot be saved for later as part
of a saved launch-time configuration. This is for security reasons:
such a credential cannot be attached to a schedule or node (`Credential that
requires user input on launch cannot be used in saved launch configuration.`),
a schedule or workflow node of a job template that does not prompt for
credentials but needs such passwords is refused (`Saved launch configurations cannot provide passwords
needed to start.`), and a job created from a schedule that would need them is
failed with "Scheduled job could not start because it was not in the right
state or required manual credentials".

Credential passwords _can_ be provided at time of relaunch.


### Validation

The general rule for validation:

> When a job is created from a template, only fields specifically configured
to be prompt-able are allowed to differ from the template to the job.

In other words, if no prompts (including surveys) are configured, a job
must be identical to the template it was created from, for all fields
that become `ansible-playbook` options.


#### Disallowed Fields

If a manual launch of a job template provides fields not allowed by the rules
of the template, the behavior is:

 - Launches without those fields, ignores fields
 - lists fields in `ignored_fields` in POST response

A manual launch of a workflow job template refuses them instead (`400`).


#### Data Type Validation

All fields provided on launch, or saved in a launch-time configuration
for later, are subject to the same validation that they would be
if saving to the job template. For example, only certain values of
`job_type` are valid.

Surveys impose additional restrictions, and violations of the survey
validation rules will prevent launch from proceeding (`variables_needed_to_start`).


#### Fields Required on Launch

Failing to provide required variables also results in a validation error
when manually launching. It also results in a 400 error if the user
fails to provide those fields when saving a schedule.


#### Broken Saved Configurations

If a job is spawned from a schedule or a workflow in a state that has rejected
prompts, this is logged, and the job is still launched, without
those prompts applied.

A job a workflow node spawns that cannot start (it has no project or
inventory, or needs credential passwords the workflow launch did not provide)
is created in the `failed` state with an explanation, "Job spawned from
workflow could not start because it was missing a related resource such as
project or inventory" or "Job spawned from workflow could not start because
it was not in the right state or required manual credentials".


### Scenarios

**Variable Precedence**
  - Schedule has survey answers for workflow job template survey
  - Workflow job template has node that has answers to job template survey
  - On launch, the schedule answers override all others

**Survey Password Durability**
   - Schedule has survey password answers from workflow job template survey
   - Workflow job template node has answers to different password questions from job template survey
   - Saving with `"$encrypted$"` as a password answer replaces it with the
     value saved before; with no value saved before, it is refused (`Provided
     variable <name> has no database value to replace with.`)
   - `"$encrypted$"` for a variable that is not a survey password is refused
     (`"$encrypted$ is a reserved keyword, may not be used for <name>."`)
   - Final job it spawns has both answers encrypted

**POST to Associate Credential to Workflow Job Template Node**
   - Requires admin to WFJT and execute to job template
   - This is in addition to the restriction of `ask_credential_on_launch`

**Credentials Merge Behavior**
   - Job template has machine & cloud credentials, set to prompt for credential on launch
   - Schedule for job template provides no credentials
   - Spawned job still uses all job template credentials
