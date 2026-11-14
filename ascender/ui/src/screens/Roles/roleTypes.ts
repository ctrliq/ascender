import type { I18n, MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type Base from 'api/Base';
import type { QSParams } from 'util/qs';
import {
  CredentialsAPI,
  InstanceGroupsAPI,
  InventoriesAPI,
  JobTemplatesAPI,
  OrganizationsAPI,
  ProjectsAPI,
  TeamsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';

/** The roles on nothing, which the platform defines for itself. */
export const SYSTEM = 'system';

export interface RoleType {
  /** What the api calls the model, which is how a role names its object. */
  key: string;
  /** What the tab says, translated where it is shown. */
  label: MessageDescriptor;
  /** Where to read one object of this kind, to see the roles it carries. */
  api?: Base;
  /**
   * Whether an object of this kind belongs to an organization. Where it does,
   * a role's page names it beside each object: the same credential name in two
   * organizations is two credentials.
   */
  hasOrganization?: boolean;
}

/**
 * Every kind of object this platform grants a role on, and roles on none.
 *
 * Each kind carries the same roles on every one of its objects: all job
 * templates have an Admin, an Execute and a Read. So the roles are read once
 * from any object of the kind rather than listed per object, which is the same
 * three rows repeated once per template.
 */
export const ROLE_TYPES: RoleType[] = [
  {
    key: 'credential',
    label: msg`Credentials`,
    api: CredentialsAPI,
    hasOrganization: true,
  },
  { key: 'instancegroup', label: msg`Instance Groups`, api: InstanceGroupsAPI },
  {
    key: 'inventory',
    label: msg`Inventories`,
    api: InventoriesAPI,
    hasOrganization: true,
  },
  {
    key: 'jobtemplate',
    label: msg`Job Templates`,
    api: JobTemplatesAPI,
    hasOrganization: true,
  },
  { key: 'organization', label: msg`Organizations`, api: OrganizationsAPI },
  {
    key: 'project',
    label: msg`Projects`,
    api: ProjectsAPI,
    hasOrganization: true,
  },
  { key: SYSTEM, label: msg`System` },
  {
    key: 'team',
    label: msg`Teams`,
    api: TeamsAPI,
    hasOrganization: true,
  },
  {
    key: 'workflowjobtemplate',
    label: msg`Workflow Templates`,
    api: WorkflowJobTemplatesAPI,
    hasOrganization: true,
  },
];

/** What the api is asked for the roles of a kind, or of nothing. */
export function typeFilter(model: string): QSParams {
  return model === SYSTEM
    ? { content_type__isnull: 'true' }
    : { content_type__model: model };
}

/** The kind itself, as the table above describes it. */
export function roleType(model: string) {
  return ROLE_TYPES.find(({ key }) => key === model);
}

/**
 * The label a kind is known by, for the trail and the detail.
 *
 * Args:
 *   i18n: The translator of the screen asking, from useLingui.
 *   model: What the api calls the kind.
 *
 * Returns:
 *   The kind's label in the viewer's language, or the model itself for a kind
 *   the table does not know.
 */
export function typeLabel(i18n: I18n, model: string): string {
  const label = ROLE_TYPES.find(({ key }) => key === model)?.label;
  return label ? i18n._(label) : model;
}
