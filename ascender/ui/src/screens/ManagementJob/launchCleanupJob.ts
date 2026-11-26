import type { SystemJobTemplate } from 'types/api';
import { SystemJobTemplatesAPI } from 'api';
import getErrorMessage from 'components/ErrorDetail/getErrorMessage';
import { keepsHistory } from 'components/JobList/LaunchDaysPrompt';

/**
 * Starts one run of a cleanup job, which is what every launch on these screens
 * does: the rocket on a list row, the button on the details and the runs tab,
 * and the toolbar that runs whatever was ticked.
 *
 * The number of days goes only to a job that keeps history. The other two take
 * no extra variables at all, and the toolbar asks once for however many jobs
 * were ticked, so a job that keeps nothing may be handed a number it must not
 * send on.
 *
 * Args:
 *   job: The cleanup job, by its id and the job type that says whether it
 *     keeps history.
 *   days: How many days of records to keep, where the prompt asked for them.
 *
 * Returns:
 *   The id of the run the launch started.
 *
 * Raises:
 *   The api's error when the launch is refused, for the caller to report.
 */
export default async function launchCleanupJob(
  job: Pick<SystemJobTemplate, 'id'> & { job_type?: string | null },
  days?: number
): Promise<number> {
  const { data } = await SystemJobTemplatesAPI.launch(
    job.id,
    typeof days === 'number' && keepsHistory(job as Record<string, unknown>)
      ? { extra_vars: { days } }
      : {}
  );
  return data.id;
}

/**
 * Why a launch was refused, in the api's words where it gave any.
 *
 * Args:
 *   error: What the launch threw.
 *
 * Returns:
 *   The api's detail or its field errors joined into one line, the error's own
 *   message where the request never reached the api, or an empty string where
 *   there is nothing to say.
 */
export function launchRefusalReason(error: unknown): string {
  const { response, message } = (error ?? {}) as {
    response?: { data?: unknown };
    message?: string;
  };
  const reason = getErrorMessage(response);
  if (Array.isArray(reason)) {
    return reason.map(String).join(' ');
  }
  return reason ?? message ?? '';
}
