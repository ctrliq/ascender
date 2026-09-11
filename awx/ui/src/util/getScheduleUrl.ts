import type { AnyJob } from '../types/api';

/**
 * The details url for the schedule that launched a job, which differs per job
 * type because each type hangs its schedules off a different resource.
 *
 * Returns undefined for a type with no schedule route, and for an inventory
 * update with no inventory, which is what the switch below always did.
 */
export default function getScheduleUrl(job: AnyJob): string | undefined {
  const templateId = job.summary_fields?.unified_job_template?.id;
  const scheduleId = job.summary_fields?.schedule?.id;
  const inventoryId = job.summary_fields?.inventory?.id ?? null;
  let scheduleUrl: string | undefined;

  switch (job.type) {
    case 'inventory_update':
      scheduleUrl = inventoryId
        ? `/inventories/inventory/${inventoryId}/sources/${templateId}/schedules/${scheduleId}/details`
        : undefined;
      break;
    case 'job':
      scheduleUrl = `/templates/job_template/${templateId}/schedules/${scheduleId}/details`;
      break;
    case 'project_update':
      scheduleUrl = `/projects/${templateId}/schedules/${scheduleId}/details`;
      break;
    case 'system_job':
      scheduleUrl = `/management_jobs/${templateId}/schedules/${scheduleId}/details`;
      break;
    case 'workflow_job':
      scheduleUrl = `/templates/workflow_job_template/${templateId}/schedules/${scheduleId}/details`;
      break;
    default:
      break;
  }

  return scheduleUrl;
}
