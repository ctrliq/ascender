import {
  JobsAPI,
  ProjectUpdatesAPI,
  SystemJobsAPI,
  WorkflowJobsAPI,
  InventoryUpdatesAPI,
  AdHocCommandsAPI,
} from 'api';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { JobStatus, JobType, UserCapabilities } from '../types/api';

const RUNNING_STATUSES: readonly JobStatus[] = [
  'new',
  'pending',
  'waiting',
  'running',
];

/**
 * Whether a run in this status is still going: new, pending, waiting or
 * running.
 *
 * Args:
 *     status: The run's status, where it has one.
 *
 * Returns:
 *     True until the run has finished, whichever way it finished.
 */
export function isJobRunning(
  status: JobStatus | string | null | undefined
): boolean {
  return RUNNING_STATUSES.includes(status as JobStatus);
}

/**
 * The statuses the api refuses to delete a run in. A new run is left out: it
 * has not been handed to a node yet, and the api lets it go.
 */
const UNDELETABLE_STATUSES: readonly JobStatus[] = [
  'pending',
  'waiting',
  'running',
];

/**
 * Whether a run in this status can still be canceled, which is the api's own
 * list: a new run may be canceled as well as one already going. That is the
 * same list as a run still going, and one name for it where cancel is the
 * question reads better at the call than isJobRunning would, so the two are
 * one function rather than two lists that could drift apart.
 */
export const isJobCancelable = isJobRunning;

/** Whether the api accepts deleting a run in this status. */
export function isJobDeletable(
  status: JobStatus | string | null | undefined
): boolean {
  return !UNDELETABLE_STATUSES.includes(status as JobStatus);
}

/** The part of a run the cancel and delete checks read. */
interface RunPermissionFields {
  status?: JobStatus | string | null;
  summary_fields?: { user_capabilities?: UserCapabilities } | null;
}

/**
 * Whether to offer Cancel on this run. The api reports the cancel capability
 * for the run's creator, an admin of what it ran and a superuser, and only
 * while the run can still be stopped. The status is read here as well because
 * a live list moves it on without asking for the capabilities again.
 */
export function canCancelJob(job: RunPermissionFields | null | undefined) {
  return (
    isJobCancelable(job?.status) &&
    Boolean(job?.summary_fields?.user_capabilities?.cancel)
  );
}

/** Whether to offer Delete on this run: the right, in a status the api allows. */
export function canDeleteJob(job: RunPermissionFields | null | undefined) {
  return (
    isJobDeletable(job?.status) &&
    Boolean(job?.summary_fields?.user_capabilities?.delete)
  );
}

/** What each action on a run is called, named for the kind of run it is. */
export interface RunActionLabels {
  relaunch: MessageDescriptor;
  delete: MessageDescriptor;
  /** The cancel button and its confirmation's title. */
  cancel: MessageDescriptor;
  /** The question the cancel confirmation asks. */
  cancelConfirm: MessageDescriptor;
  /** The title of the alert shown when the api refuses the cancel. */
  cancelError: MessageDescriptor;
  /** The title of the alert shown when the api refuses the delete. */
  deleteError: MessageDescriptor;
  /** The sentence that alert opens with, above the api's own detail. */
  deleteErrorMessage: MessageDescriptor;
}

/*
 * Whole phrases rather than a verb and a noun put together, so a translation
 * can order and inflect them as its language needs. The nouns are the ones
 * the Runs list's Type column uses, with Workflow Job for a workflow run so it
 * is not read as the template.
 */
const RUN_ACTION_LABELS: Record<JobType, RunActionLabels> = {
  job: {
    relaunch: msg`Relaunch Job`,
    delete: msg`Delete Job`,
    cancel: msg`Cancel Job`,
    cancelConfirm: msg`Are you sure you want to cancel this job?`,
    cancelError: msg`Job Cancel Error`,
    deleteError: msg`Job Delete Error`,
    deleteErrorMessage: msg`Failed to delete job.`,
  },
  workflow_job: {
    relaunch: msg`Relaunch Workflow Job`,
    delete: msg`Delete Workflow Job`,
    cancel: msg`Cancel Workflow Job`,
    cancelConfirm: msg`Are you sure you want to cancel this workflow job?`,
    cancelError: msg`Workflow Job Cancel Error`,
    deleteError: msg`Workflow Job Delete Error`,
    deleteErrorMessage: msg`Failed to delete workflow job.`,
  },
  project_update: {
    relaunch: msg`Relaunch Project Sync`,
    delete: msg`Delete Project Sync`,
    cancel: msg`Cancel Project Sync`,
    cancelConfirm: msg`Are you sure you want to cancel this project sync?`,
    cancelError: msg`Project Sync Cancel Error`,
    deleteError: msg`Project Sync Delete Error`,
    deleteErrorMessage: msg`Failed to delete project sync.`,
  },
  inventory_update: {
    relaunch: msg`Relaunch Inventory Sync`,
    delete: msg`Delete Inventory Sync`,
    cancel: msg`Cancel Inventory Sync`,
    cancelConfirm: msg`Are you sure you want to cancel this inventory sync?`,
    cancelError: msg`Inventory Sync Cancel Error`,
    deleteError: msg`Inventory Sync Delete Error`,
    deleteErrorMessage: msg`Failed to delete inventory sync.`,
  },
  ad_hoc_command: {
    relaunch: msg`Relaunch Command`,
    delete: msg`Delete Command`,
    cancel: msg`Cancel Command`,
    cancelConfirm: msg`Are you sure you want to cancel this command?`,
    cancelError: msg`Command Cancel Error`,
    deleteError: msg`Command Delete Error`,
    deleteErrorMessage: msg`Failed to delete command.`,
  },
  system_job: {
    relaunch: msg`Relaunch Cleanup Job`,
    delete: msg`Delete Cleanup Job`,
    cancel: msg`Cancel Cleanup Job`,
    cancelConfirm: msg`Are you sure you want to cancel this cleanup job?`,
    cancelError: msg`Cleanup Job Cancel Error`,
    deleteError: msg`Cleanup Job Delete Error`,
    deleteErrorMessage: msg`Failed to delete cleanup job.`,
  },
};

/** The action labels for a run of this type, a job's where the type is unknown. */
export function getRunActionLabels(
  type: JobType | string | null | undefined
): RunActionLabels {
  return RUN_ACTION_LABELS[type as JobType] ?? RUN_ACTION_LABELS.job;
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

// Overloaded so a caller that names the type in the call gets that model
// rather than the union of all six, which shares only the base methods.
export function getJobModel(type: 'ad_hoc_command'): typeof AdHocCommandsAPI;
export function getJobModel(
  type: 'inventory_update'
): typeof InventoryUpdatesAPI;
export function getJobModel(type: 'project_update'): typeof ProjectUpdatesAPI;
export function getJobModel(type: 'system_job'): typeof SystemJobsAPI;
export function getJobModel(type: 'workflow_job'): typeof WorkflowJobsAPI;
export function getJobModel(
  type: JobType | string | undefined
):
  | typeof AdHocCommandsAPI
  | typeof InventoryUpdatesAPI
  | typeof ProjectUpdatesAPI
  | typeof SystemJobsAPI
  | typeof WorkflowJobsAPI
  | typeof JobsAPI;
export function getJobModel(type: JobType | string | undefined) {
  if (type === 'ad_hoc_command') return AdHocCommandsAPI;
  if (type === 'inventory_update') return InventoryUpdatesAPI;
  if (type === 'project_update') return ProjectUpdatesAPI;
  if (type === 'system_job') return SystemJobsAPI;
  if (type === 'workflow_job') return WorkflowJobsAPI;

  return JobsAPI;
}
