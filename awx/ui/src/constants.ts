/**
 * Which url segment a job's detail page lives under, keyed by the job's type.
 *
 * The API and the router disagree on these names, so every link to a job goes
 * through this map: a `project_update` is shown at /jobs/project/<id>.
 */
export const JOB_TYPE_URL_SEGMENTS: Record<string, string> = {
  job: 'playbook',
  project_update: 'project',
  system_job: 'management',
  inventory_update: 'inventory',
  ad_hoc_command: 'command',
  workflow_job: 'workflow',
};

export const SESSION_TIMEOUT_KEY = 'awx-session-timeout';
export const SESSION_REDIRECT_URL = 'awx-redirect-url';
export const PERSISTENT_FILTER_KEY = 'awx-persistent-filter';
export const SESSION_USER_ID = 'awx-session-user-id';
