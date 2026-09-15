import {
  JobsAPI,
  ProjectUpdatesAPI,
  SystemJobsAPI,
  WorkflowJobsAPI,
  InventoryUpdatesAPI,
  AdHocCommandsAPI,
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
