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

export function getJobModel(type: JobType | string | undefined) {
  if (type === 'ad_hoc_command') return AdHocCommandsAPI;
  if (type === 'inventory_update') return InventoryUpdatesAPI;
  if (type === 'project_update') return ProjectUpdatesAPI;
  if (type === 'system_job') return SystemJobsAPI;
  if (type === 'workflow_job') return WorkflowJobsAPI;

  return JobsAPI;
}
