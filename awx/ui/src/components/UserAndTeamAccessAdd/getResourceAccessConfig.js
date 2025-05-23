import { msg } from '@lingui/macro';
import {
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  CredentialsAPI,
  InventoriesAPI,
  ProjectsAPI,
  OrganizationsAPI,
  InstanceGroupsAPI,
} from 'api';

export default function getResourceAccessConfig(i18n) {
  return [
    {
      selectedResource: 'jobTemplate',
      label: i18n._(msg`Job templates`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Playbook name`),
          key: 'playbook__icontains',
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => JobTemplatesAPI.read(queryParams),
      fetchOptions: () => JobTemplatesAPI.readOptions(),
    },
    {
      selectedResource: 'workflowJobTemplate',
      label: i18n._(msg`Workflow job templates`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Playbook name`),
          key: 'playbook__icontains',
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => WorkflowJobTemplatesAPI.read(queryParams),
      fetchOptions: () => WorkflowJobTemplatesAPI.readOptions(),
    },
    {
      selectedResource: 'credential',
      label: i18n._(msg`Credentials`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Type`),
          key: 'or__scm_type',
          options: [
            [``, i18n._(msg`Manual`)],
            [`git`, i18n._(msg`Git`)],
            [`svn`, i18n._(msg`Subversion`)],
            [`archive`, i18n._(msg`Remote Archive`)],
            [`insights`, i18n._(msg`Red Hat Insights`)],
          ],
        },
        {
          name: i18n._(msg`Source Control URL`),
          key: 'scm_url__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => CredentialsAPI.read(queryParams),
      fetchOptions: () => CredentialsAPI.readOptions(),
    },
    {
      selectedResource: 'inventory',
      label: i18n._(msg`Inventories`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => InventoriesAPI.read(queryParams),
      fetchOptions: () => InventoriesAPI.readOptions(),
    },
    {
      selectedResource: 'project',
      label: i18n._(msg`Projects`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Type`),
          key: 'or__scm_type',
          options: [
            [``, i18n._(msg`Manual`)],
            [`git`, i18n._(msg`Git`)],
            [`svn`, i18n._(msg`Subversion`)],
            [`archive`, i18n._(msg`Remote Archive`)],
            [`insights`, i18n._(msg`Red Hat Insights`)],
          ],
        },
        {
          name: i18n._(msg`Source Control URL`),
          key: 'scm_url__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => ProjectsAPI.read(queryParams),
      fetchOptions: () => ProjectsAPI.readOptions(),
    },
    {
      selectedResource: 'organization',
      label: i18n._(msg`Organizations`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => OrganizationsAPI.read(queryParams),
      fetchOptions: () => OrganizationsAPI.readOptions(),
    },
    {
      selectedResource: 'Instance Groups',
      label: i18n._(msg`Instance Groups`),
      searchColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Created By (Username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(msg`Modified By (Username)`),
          key: 'modified_by__username__icontains',
        },
      ],
      sortColumns: [
        {
          name: i18n._(msg`Name`),
          key: 'name',
        },
      ],
      fetchItems: (queryParams) => InstanceGroupsAPI.read(queryParams),
      fetchOptions: () => InstanceGroupsAPI.readOptions(),
    },
  ];
}
