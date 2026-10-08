import {
  JobsAPI,
  ProjectUpdatesAPI,
  SystemJobsAPI,
  WorkflowJobsAPI,
  InventoryUpdatesAPI,
  AdHocCommandsAPI,
  ExecutionEnvironmentBuilderBuildsAPI,
} from 'api';
import type { JobStatus, JobType } from '../types/api';

const RUNNING_STATUSES: readonly JobStatus[] = [
  'new',
  'pending',
  'waiting',
  'running',
];

export function isJobRunning(status: JobStatus | string | undefined): boolean {
  return RUNNING_STATUSES.includes(status as JobStatus);
}

/**
 * Whether this job's relaunch may be handed variables that overwrite the ones
 * it ran with, which only a workflow job carries. Read off the job rather than
 * narrowed by its type, because the job lists hold the union of every job kind
 * and only the workflow ones are sent the field.
 */
export function canOverwriteRelaunchVars(job: unknown): boolean {
  return Boolean(
    (job as { allow_overwrite_flow_vars_on_relaunch?: boolean | null } | null)
      ?.allow_overwrite_flow_vars_on_relaunch
  );
}

/**
 * Whether a running job gets a Cancel button on its detail and output screens.
 * Those screens read this off the start capability, but the API turns start
 * off for every job whose template prevents relaunch, so those jobs are let
 * through here and the API decides whether the cancel goes ahead, as it does
 * from the job list.
 */
export function canOfferCancel(job: unknown): boolean {
  const summary = (
    job as {
      summary_fields?: {
        user_capabilities?: { start?: boolean };
        job_template?: { prevent_relaunch?: boolean };
      };
    } | null
  )?.summary_fields;
  return Boolean(
    summary?.user_capabilities?.start || summary?.job_template?.prevent_relaunch
  );
}

// Overloaded so a caller that names the type in the call gets that model
// rather than the union of all of them, which shares only the base methods.
export function getJobModel(type: 'ad_hoc_command'): typeof AdHocCommandsAPI;
export function getJobModel(
  type: 'inventory_update'
): typeof InventoryUpdatesAPI;
export function getJobModel(type: 'project_update'): typeof ProjectUpdatesAPI;
export function getJobModel(type: 'system_job'): typeof SystemJobsAPI;
export function getJobModel(type: 'workflow_job'): typeof WorkflowJobsAPI;
export function getJobModel(
  type: 'execution_environment_builder_build'
): typeof ExecutionEnvironmentBuilderBuildsAPI;
export function getJobModel(
  type: JobType | string | undefined
):
  | typeof AdHocCommandsAPI
  | typeof InventoryUpdatesAPI
  | typeof ProjectUpdatesAPI
  | typeof SystemJobsAPI
  | typeof WorkflowJobsAPI
  | typeof ExecutionEnvironmentBuilderBuildsAPI
  | typeof JobsAPI;
export function getJobModel(type: JobType | string | undefined) {
  if (type === 'ad_hoc_command') return AdHocCommandsAPI;
  if (type === 'inventory_update') return InventoryUpdatesAPI;
  if (type === 'project_update') return ProjectUpdatesAPI;
  if (type === 'system_job') return SystemJobsAPI;
  if (type === 'workflow_job') return WorkflowJobsAPI;
  if (type === 'execution_environment_builder_build')
    return ExecutionEnvironmentBuilderBuildsAPI;

  return JobsAPI;
}
