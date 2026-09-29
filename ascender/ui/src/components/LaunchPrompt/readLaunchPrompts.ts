import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import type { LaunchCredential } from 'types/api';
import type { LabelInput } from 'util/labels';
import type { LaunchConfig, SurveyConfig } from './types';

/** What a template asks for at launch, which the prompt steps are built from. */
export interface LaunchPrompts {
  launchConfig: LaunchConfig | null;
  surveyConfig: SurveyConfig | null;
  labels: LabelInput[];
  credentials: LaunchCredential[];
}

/** A template that asks for nothing, or one whose prompts are not read yet. */
export const NO_LAUNCH_PROMPTS: LaunchPrompts = {
  launchConfig: null,
  surveyConfig: null,
  labels: [],
  credentials: [],
};

/**
 * Reads everything a template's launch prompt is built from.
 *
 * The launch configuration comes first, because it says which of the rest
 * there is to read: the survey only where one is enabled, the labels and the
 * credentials only where the template asks for them on launch. A workflow
 * job template has no credentials of its own to seed the step with.
 *
 * Args:
 *     template: The job template or workflow job template to launch.
 *
 * Returns:
 *     The launch configuration and whatever it said to read besides.
 *
 * Raises:
 *     Whatever the first failing read rejects with.
 */
export default async function readLaunchPrompts(template: {
  id: number;
  type?: string;
}): Promise<LaunchPrompts> {
  const isWorkflow = template.type === 'workflow_job_template';
  const api = isWorkflow ? WorkflowJobTemplatesAPI : JobTemplatesAPI;
  const { id } = template;

  const { data: launchConfig } = await api.readLaunch(id);
  const read: LaunchPrompts = { ...NO_LAUNCH_PROMPTS, launchConfig };

  if (launchConfig.survey_enabled) {
    const { data } = await api.readSurvey(id);
    read.surveyConfig = data;
  }

  if (launchConfig.ask_labels_on_launch) {
    const {
      data: { results },
    } = await api.readAllLabels(id);
    // The schema has a label's name nullable; the labels field takes a
    // string, and a label the api sent always has one.
    read.labels = results.map((label) => ({
      ...label,
      name: label.name ?? '',
      isReadOnly: true,
    }));
  }

  if (launchConfig.ask_credential_on_launch && !isWorkflow) {
    const {
      data: { results },
    } = await JobTemplatesAPI.readCredentials(id);
    read.credentials = results;
  }

  return read;
}
