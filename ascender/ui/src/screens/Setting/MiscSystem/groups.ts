import { msg } from '@lingui/core/macro';
import type { SettingGroup } from '../shared/settingGroups';

// The shape every settings screen's groups take, named here as well so a tab
// reads its type from the same module as its groups.
export type { SettingGroup };

/**
 * What this screen sets, in the six groups its tabs offer.
 *
 * The activity stream is one decision taken twice, once for the stream and once
 * for what inventory syncs write to it. What an organization admin may see and
 * do is another, and the headers and lists a proxy in front of the platform
 * needs is a third: three settings that are wrong together or right together.
 * Everything left is the installation's own name for itself.
 */
export const GROUPS: SettingGroup[] = [
  {
    // Whether the stream is written at all, and whether syncs write to it.
    id: 'activity_stream',
    label: msg`Activity Stream`,
    keys: [
      'ACTIVITY_STREAM_ENABLED',
      'ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC',
    ],
  },
  {
    // What a job runs in where nothing else is asked for.
    id: 'execution_environment',
    label: msg`Execution Environment`,
    keys: ['DEFAULT_EXECUTION_ENVIRONMENT'],
  },
  {
    // What the installation calls itself. The UUID is read only, so it is shown
    // here and has no field on the edit form.
    id: 'misc',
    label: msg`Miscellaneous`,
    keys: ['ASCENDER_URL_BASE', 'INSTALL_UUID'],
  },
  {
    // What a proxy in front of the platform is allowed to say about a request,
    // and whether the AWS Secrets Manager lookup may fall back on the
    // credentials of the host it runs on.
    id: 'security',
    label: msg`Security`,
    keys: [
      'REMOTE_HOST_HEADERS',
      'PROXY_IP_ALLOWED_LIST',
      'CSRF_TRUSTED_ORIGINS',
      'AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS',
    ],
  },
  {
    // What an organization admin may see and change of other accounts.
    id: 'users',
    label: msg`Users`,
    // Whether the two system roles show up in every access list is part of
    // what an admin sees of other accounts, and the edit form asks for it here.
    keys: [
      'ORG_ADMINS_CAN_SEE_ALL_USERS',
      'ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS',
      'MANAGE_ORGANIZATION_AUTH',
      // Whether only a superuser may change a username or an email, which the
      // username lists in the OIDC and Entra ID user flags depend on.
      'RESTRICT_USER_IDENTITY_TO_SUPERUSERS',
    ],
  },
  {
    // Whether each job that uses a workload identity credential gets a signed
    // token an external system such as Vault can trust, and how long it lasts.
    id: 'workload_identity',
    label: msg`Workload Identity`,
    keys: ['WORKLOAD_IDENTITY_ENABLED', 'WORKLOAD_IDENTITY_DEFAULT_TTL'],
  },
];
