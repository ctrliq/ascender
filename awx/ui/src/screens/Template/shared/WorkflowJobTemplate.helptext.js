
function getHelpText(t) {
  return {
    name: t`Name of the workflow job template.`,
    description: t`Optional description for the workflow job template.`,
    inventory: t`Select the inventory containing the hosts you want this workflow to manage.`,
    organization: t`The organization that owns this workflow job template.`,
    extra_vars: t`Pass extra command line variables to the workflow.`,
    limit: t`Provide a host pattern to further constrain the list of hosts that will be managed or affected by the workflow.`,
    scm_branch: t`Select a branch for the workflow.`,
    survey_enabled: t`Enable a survey for this workflow job template.`,
    allow_simultaneous: t`Allow simultaneous runs of this workflow job template.`,
    ask_variables_on_launch: t`Prompt for variables on launch.`,
    ask_limit_on_launch: t`Prompt for limit on launch.`,
    ask_scm_branch_on_launch: t`Prompt for SCM branch on launch.`,
    ask_inventory_on_launch: t`Prompt for inventory on launch.`,
    ask_labels_on_launch: t`Prompt for labels on launch.`,
    ask_credential_on_launch: t`Prompt for credentials on launch.`,
    ask_job_type_on_launch: t`Prompt for job type on launch.`,
    ask_verbosity_on_launch: t`Prompt for verbosity on launch.`,
    ask_tags_on_launch: t`Prompt for tags on launch.`,
    ask_skip_tags_on_launch: t`Prompt for skip tags on launch.`,
    ask_execution_environment_on_launch: t`Prompt for execution environment on launch.`,
    ask_instance_groups_on_launch: t`Prompt for instance groups on launch.`,
    ask_job_slice_count_on_launch: t`Prompt for job slice count on launch.`,
    ask_timeout_on_launch: t`Prompt for timeout on launch.`,
    ask_diff_mode_on_launch: t`Prompt for diff mode on launch.`,
    webhook_service: t`Webhook service for this workflow job template.`,
    webhook_url: t`Webhook URL for this workflow job template.`,
    webhook_key: t`Webhook key for this workflow job template.`,
    webhook_credential: t`Webhook credential for this workflow job template.`,
  };
}

export default getHelpText;
