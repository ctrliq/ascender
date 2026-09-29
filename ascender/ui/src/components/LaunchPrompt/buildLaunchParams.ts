import type { LaunchableResource } from 'types/api';
import mergeExtraVars from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import createNewLabels from 'util/labels';
import type { LaunchConfig, LaunchPromptValues } from './types';

/**
 * What the prompt collected, as the launch endpoint takes it.
 *
 * A field only travels where the template asked for it, and an empty one is
 * left out rather than sent as null: the api reads a key that is present as an
 * override of the template's own value. Labels are created here, since a new
 * one has to exist before the launch can name it.
 */
export default async function buildLaunchParams(
  values: LaunchPromptValues,
  launchConfig: LaunchConfig,
  resource: LaunchableResource
): Promise<Record<string, unknown>> {
  const postValues: Record<string, unknown> = {};
  const setValue = (key: string, value: unknown) => {
    if (typeof value !== 'undefined' && value !== null) {
      postValues[key] = value;
    }
  };
  const surveyValues = getSurveyValues(values);
  setValue('credential_passwords', values.credential_passwords);
  setValue('inventory_id', values.inventory?.id);
  setValue(
    'credentials',
    values.credentials?.map((c) => c.id)
  );
  setValue('job_type', values.job_type);
  // A blank limit only means something where the template has a limit of its
  // own to clear. On a workflow with none, an empty string still counts as a
  // prompt answer, and the workflow's answers override its nodes', so every
  // node's own limit would be replaced with none at all.
  setValue(
    'limit',
    values.limit === '' && !resource.limit ? undefined : values.limit
  );
  setValue('job_tags', values.job_tags);
  setValue('skip_tags', values.skip_tags);
  const extraVars = launchConfig.ask_variables_on_launch
    ? values.extra_vars || '---'
    : (resource.extra_vars ?? undefined);
  setValue('extra_vars', mergeExtraVars(extraVars, surveyValues));
  setValue('scm_branch', values.scm_branch);
  setValue('verbosity', values.verbosity);
  setValue('timeout', values.timeout);
  setValue('forks', values.forks);
  setValue('job_slice_count', values.job_slice_count);
  setValue('execution_environment', values.execution_environment?.id);

  if (launchConfig.ask_instance_groups_on_launch) {
    const instanceGroupIds: number[] = [];
    values.instance_groups?.forEach((instanceGroup) => {
      instanceGroupIds.push(instanceGroup.id);
    });
    setValue('instance_groups', instanceGroupIds);
  }

  if (launchConfig.ask_labels_on_launch) {
    const { labelIds } = await createNewLabels(
      values.labels ?? [],
      resource.organization
    );

    setValue('labels', labelIds);
  }

  return postValues;
}
