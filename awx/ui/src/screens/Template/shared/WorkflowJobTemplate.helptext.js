import { msg } from '@lingui/macro';

function getHelpText(i18n) {
  return {
    name: i18n._(msg`Name of the workflow job template.`),
    description: i18n._(msg`Optional description for the workflow job template.`),
    inventory: i18n._(msg`Select the inventory containing the hosts you want this workflow to manage.`),
    organization: i18n._(msg`The organization that owns this workflow job template.`),
    extra_vars: i18n._(msg`Pass extra command line variables to the workflow.`),
    limit: i18n._(msg`Provide a host pattern to further constrain the list of hosts that will be managed or affected by the workflow.`),
    scm_branch: i18n._(msg`Select a branch for the workflow.`),
    survey_enabled: i18n._(msg`Enable a survey for this workflow job template.`),
    allow_simultaneous: i18n._(msg`Allow simultaneous runs of this workflow job template.`),
    ask_variables_on_launch: i18n._(msg`Prompt for variables on launch.`),
    ask_limit_on_launch: i18n._(msg`Prompt for limit on launch.`),
    ask_scm_branch_on_launch: i18n._(msg`Prompt for SCM branch on launch.`),
    ask_inventory_on_launch: i18n._(msg`Prompt for inventory on launch.`),
    ask_labels_on_launch: i18n._(msg`Prompt for labels on launch.`),
    ask_credential_on_launch: i18n._(msg`Prompt for credentials on launch.`),
    ask_job_type_on_launch: i18n._(msg`Prompt for job type on launch.`),
    ask_verbosity_on_launch: i18n._(msg`Prompt for verbosity on launch.`),
    ask_tags_on_launch: i18n._(msg`Prompt for tags on launch.`),
    ask_skip_tags_on_launch: i18n._(msg`Prompt for skip tags on launch.`),
    ask_execution_environment_on_launch: i18n._(msg`Prompt for execution environment on launch.`),
    ask_instance_groups_on_launch: i18n._(msg`Prompt for instance groups on launch.`),
    ask_job_slice_count_on_launch: i18n._(msg`Prompt for job slice count on launch.`),
    ask_timeout_on_launch: i18n._(msg`Prompt for timeout on launch.`),
    ask_diff_mode_on_launch: i18n._(msg`Prompt for diff mode on launch.`),
    webhook_service: i18n._(msg`Webhook service for this workflow job template.`),
    webhook_url: i18n._(msg`Webhook URL for this workflow job template.`),
    webhook_key: i18n._(msg`Webhook key for this workflow job template.`),
    webhook_credential: i18n._(msg`Webhook credential for this workflow job template.`),
  };
}

export default getHelpText;
