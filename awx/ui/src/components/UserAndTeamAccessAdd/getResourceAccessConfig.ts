import {
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  CredentialsAPI,
  InventoriesAPI,
  ProjectsAPI,
  OrganizationsAPI,
  InstanceGroupsAPI,
} from 'api';
import type { QSParams } from 'util/qs';
import type { Translate } from 'types/lingui';

export default function getResourceAccessConfig(t: Translate) {
  return [
    {
      selectedResource: 'jobTemplate',
      label: t`Job templates`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Playbook name`,
          key: 'playbook__icontains',
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) => JobTemplatesAPI.read(queryParams),
      fetchOptions: () => JobTemplatesAPI.readOptions(),
    },
    {
      selectedResource: 'workflowJobTemplate',
      label: t`Workflow job templates`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Playbook name`,
          key: 'playbook__icontains',
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) =>
        WorkflowJobTemplatesAPI.read(queryParams),
      fetchOptions: () => WorkflowJobTemplatesAPI.readOptions(),
    },
    {
      selectedResource: 'credential',
      label: t`Credentials`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Type`,
          key: 'or__scm_type',
          options: [
            [``, t`Manual`],
            [`git`, t`Git`],
            [`svn`, t`Subversion`],
            [`archive`, t`Remote Archive`],
            [`insights`, t`Red Hat Insights`],
          ],
        },
        {
          name: t`Source Control URL`,
          key: 'scm_url__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) => CredentialsAPI.read(queryParams),
      fetchOptions: () => CredentialsAPI.readOptions(),
    },
    {
      selectedResource: 'inventory',
      label: t`Inventories`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) => InventoriesAPI.read(queryParams),
      fetchOptions: () => InventoriesAPI.readOptions(),
    },
    {
      selectedResource: 'project',
      label: t`Projects`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Type`,
          key: 'or__scm_type',
          options: [
            [``, t`Manual`],
            [`git`, t`Git`],
            [`svn`, t`Subversion`],
            [`archive`, t`Remote Archive`],
            [`insights`, t`Red Hat Insights`],
          ],
        },
        {
          name: t`Source Control URL`,
          key: 'scm_url__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) => ProjectsAPI.read(queryParams),
      fetchOptions: () => ProjectsAPI.readOptions(),
    },
    {
      selectedResource: 'organization',
      label: t`Organizations`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) => OrganizationsAPI.read(queryParams),
      fetchOptions: () => OrganizationsAPI.readOptions(),
    },
    {
      selectedResource: 'Instance Groups',
      label: t`Instance Groups`,
      searchColumns: [
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: t`Name`,
          key: 'name',
        },
      ],
      fetchItems: (queryParams: QSParams) =>
        InstanceGroupsAPI.read(queryParams),
      fetchOptions: () => InstanceGroupsAPI.readOptions(),
    },
  ];
}
