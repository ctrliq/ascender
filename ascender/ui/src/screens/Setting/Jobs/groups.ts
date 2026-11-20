import { msg } from '@lingui/core/macro';
import type { SettingGroup } from '../shared/settingGroups';

// The shape every settings screen's groups take, named here as well so a tab
// reads its type from the same module as its groups.
export type { SettingGroup };

/**
 * What this screen sets, in the five groups its tabs offer, listed as the tabs
 * read them: by name, so a group added later has one place to go.
 *
 * Twenty six settings on one page is a page nobody reads: how long a job may
 * run is one subject, how many may run at once is another, what a job runs
 * inside is a third, where its roles and collections come from is a fourth,
 * and what is left is what is left.
 */
export const GROUPS: SettingGroup[] = [
  {
    // Where the roles and collections a project asks for come from.
    id: 'content',
    label: msg`Content`,
    keys: [
      'ASCENDER_ROLES_ENABLED',
      'ASCENDER_COLLECTIONS_ENABLED',
      'GALAXY_IGNORE_CERTS',
      'GALAXY_TASK_ENV',
    ],
  },
  {
    // What a job runs inside, and what of the host it can see from there.
    id: 'execution',
    label: msg`Execution`,
    keys: [
      'ASCENDER_ISOLATION_BASE_PATH',
      'ASCENDER_ISOLATION_SHOW_PATHS',
      'ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S',
      'DEFAULT_CONTAINER_RUN_OPTIONS',
      'ASCENDER_TASK_ENV',
      'ASCENDER_ANSIBLE_CALLBACK_PLUGINS',
      'ENABLE_ANSIBLE_29',
    ],
  },
  {
    // How much the platform will take on at once.
    id: 'limits',
    label: msg`Limits`,
    keys: [
      'MAX_FORKS',
      'MAX_WEBSOCKET_EVENT_RATE',
      'SCHEDULE_MAX_JOBS',
      'ASCENDER_AUTO_STATS_ENABLED',
      'ASCENDER_AUTO_STATS_MAX_HOSTS',
    ],
  },
  {
    // What is left: what an ad hoc command may call, what an extra variable
    // may hold, and what the output says.
    id: 'misc',
    label: msg`Miscellaneous`,
    keys: [
      'AD_HOC_COMMANDS',
      'ALLOW_JINJA_IN_EXTRA_VARS',
      'PROJECT_UPDATE_VVV',
      'ASCENDER_SHOW_PLAYBOOK_LINKS',
    ],
  },
  {
    // How long anything may take before the platform stops waiting.
    id: 'timeouts',
    label: msg`Timeouts`,
    keys: [
      'DEFAULT_JOB_TIMEOUT',
      'DEFAULT_JOB_IDLE_TIMEOUT',
      'DEFAULT_INVENTORY_UPDATE_TIMEOUT',
      'DEFAULT_PROJECT_UPDATE_TIMEOUT',
      'ANSIBLE_FACT_CACHE_TIMEOUT',
      'ASCENDER_RUNNER_KEEPALIVE_SECONDS',
    ],
  },
];
