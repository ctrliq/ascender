import { t } from '@lingui/react/macro';

function getHelpText(i18n) {
  return {
    name: i18n._(t`Name of the workflow job template.`),
    description: i18n._(
      t`Optional description for the workflow job template.`
    ),
    inventory: i18n._(
      t`Select the inventory containing the hosts you want this workflow to manage.`
    ),
    organization: i18n._(
      t`The organization that owns this workflow job template.`
    ),
    extra_vars: i18n._(t`Pass extra command line variables to the workflow.`),
    limit: i18n._(
      t`Provide a host pattern to further constrain the list of hosts that will be managed or affected by the workflow.`
    ),
    scm_branch: i18n._(t`Select a branch for the workflow.`),
    survey_enabled: i18n._(
      t`Enable a survey for this workflow job template.`
    ),
    allow_simultaneous: i18n._(
      t`Allow simultaneous runs of this workflow job template.`
    ),
    ask_variables_on_launch: i18n._(t`Prompt for variables on launch.`),
    ask_limit_on_launch: i18n._(t`Prompt for limit on launch.`),
    ask_scm_branch_on_launch: i18n._(t`Prompt for SCM branch on launch.`),
    ask_inventory_on_launch: i18n._(t`Prompt for inventory on launch.`),
    ask_labels_on_launch: i18n._(t`Prompt for labels on launch.`),
    ask_credential_on_launch: i18n._(t`Prompt for credentials on launch.`),
    ask_job_type_on_launch: i18n._(t`Prompt for job type on launch.`),
    ask_verbosity_on_launch: i18n._(t`Prompt for verbosity on launch.`),
    ask_tags_on_launch: i18n._(t`Prompt for tags on launch.`),
    ask_skip_tags_on_launch: i18n._(t`Prompt for skip tags on launch.`),
    ask_execution_environment_on_launch: i18n._(
      t`Prompt for execution environment on launch.`
    ),
    ask_instance_groups_on_launch: i18n._(
      t`Prompt for instance groups on launch.`
    ),
    ask_job_slice_count_on_launch: i18n._(
      t`Prompt for job slice count on launch.`
    ),
    ask_timeout_on_launch: i18n._(t`Prompt for timeout on launch.`),
    ask_diff_mode_on_launch: i18n._(t`Prompt for diff mode on launch.`),
    webhook_service: i18n._(
      t`Webhook service for this workflow job template.`
    ),
    webhook_url: i18n._(t`Webhook URL for this workflow job template.`),
    webhook_key: i18n._(t`Webhook key for this workflow job template.`),
    webhook_credential: i18n._(
      t`Webhook credential for this workflow job template.`
    ),
  };
}

export default getHelpText;
