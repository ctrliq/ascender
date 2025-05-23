import { i18n } from '@lingui/core';
import { msg } from '@lingui/macro';

import {
  UnifiedJobTemplatesAPI,
  CredentialsAPI,
  InventoriesAPI,
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobTemplateNodesAPI,
  WorkflowJobTemplatesAPI,
  CredentialInputSourcesAPI,
  TeamsAPI,
  NotificationTemplatesAPI,
  ExecutionEnvironmentsAPI,
  ApplicationsAPI,
  OrganizationsAPI,
  InstanceGroupsAPI,
} from 'api';

export async function getRelatedResourceDeleteCounts(requests) {
  const results = {};
  let error = null;
  let hasCount = false;

  try {
    await Promise.all(
      requests.map(async ({ request, label }) => {
        const {
          data: { count },
        } = await request();

        if (count > 0) {
          results[label] = count;
          hasCount = true;
        }
      })
    );
  } catch (err) {
    error = err;
  }

  return {
    results: hasCount && results,
    error,
  };
}

export const relatedResourceDeleteRequests = {
  credential: (selected) => [
    {
      request: () =>
        JobTemplatesAPI.read({
          credentials: selected.id,
        }),
      label: i18n._(msg`Job Templates`),
    },
    {
      request: () => ProjectsAPI.read({ credentials: selected.id }),
      label: i18n._(msg`Projects`),
    },
    {
      request: () =>
        InventorySourcesAPI.read({
          credentials__id: selected.id,
        }),
      label: i18n._(msg`Inventory Sources`),
    },
    {
      request: () =>
        CredentialInputSourcesAPI.read({
          source_credential: selected.id,
        }),
      label: i18n._(msg`Credential Input Sources`),
    },
    {
      request: () =>
        ExecutionEnvironmentsAPI.read({
          credential: selected.id,
        }),
      label: i18n._(msg`Execution Environments`),
    },
  ],

  credentialType: (selected) => [
    {
      request: async () =>
        CredentialsAPI.read({
          credential_type__id: selected.id,
        }),
      label: i18n._(msg`Credentials`),
    },
  ],

  inventory: (selected) => [
    {
      request: async () =>
        JobTemplatesAPI.read({
          inventory: selected.id,
        }),
      label: i18n._(msg`Job Templates`),
    },
    {
      request: () => WorkflowJobTemplatesAPI.read({ inventory: selected.id }),
      label: i18n._(msg`Workflow Job Template`),
    },
  ],

  inventorySource: (inventorySourceId) => [
    {
      request: async () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: inventorySourceId,
        }),
      label: i18n._(msg`Workflow Job Template Nodes`),
    },
    {
      request: async () => InventorySourcesAPI.readGroups(inventorySourceId),
      label: i18n._(msg`Groups`),
    },
    {
      request: async () => InventorySourcesAPI.readHosts(inventorySourceId),
      label: i18n._(msg`Hosts`),
    },
  ],

  project: (selected) => [
    {
      request: () =>
        JobTemplatesAPI.read({
          project: selected.id,
        }),
      label: i18n._(msg`Job Templates`),
    },
    {
      request: () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: selected.id,
        }),
      label: i18n._(msg`Workflow Job Templates`),
    },
    {
      request: () =>
        InventorySourcesAPI.read({
          source_project: selected.id,
        }),
      label: i18n._(msg`Inventory Sources`),
    },
  ],

  template: (selected) => [
    {
      request: async () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: selected.id,
        }),
      label: [i18n._(msg`Workflow Job Template Nodes`)],
    },
  ],

  organization: (selected) => [
    {
      request: async () =>
        CredentialsAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Credential`),
    },
    {
      request: async () =>
        TeamsAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Teams`),
    },
    {
      request: async () =>
        NotificationTemplatesAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Notification Templates`),
    },
    {
      request: () =>
        ExecutionEnvironmentsAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Execution Environments`),
    },
    {
      request: async () =>
        ProjectsAPI.read({
          organization: selected.id,
        }),
      label: [i18n._(msg`Projects`)],
    },
    {
      request: () =>
        InventoriesAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Inventories`),
    },
    {
      request: () =>
        ApplicationsAPI.read({
          organization: selected.id,
        }),
      label: i18n._(msg`Applications`),
    },
  ],
  executionEnvironment: (selected) => [
    {
      request: async () =>
        UnifiedJobTemplatesAPI.read({
          execution_environment: selected.id,
        }),
      label: [i18n._(msg`Templates`)],
    },
    {
      request: async () =>
        ProjectsAPI.read({
          default_environment: selected.id,
        }),
      label: [i18n._(msg`Projects`)],
    },
    {
      request: async () =>
        OrganizationsAPI.read({
          default_environment: selected.id,
        }),
      label: [i18n._(msg`Organizations`)],
    },
    {
      request: async () => {
        try {
          const {
            data: { results },
          } = await InventorySourcesAPI.read({
            execution_environment: selected.id,
          });

          const responses = await Promise.all(
            results.map((result) =>
              WorkflowJobTemplateNodesAPI.read({
                unified_job_template: result.id,
              })
            )
          );

          const total = responses.reduce(
            ({ data: { count: acc } }, { data: { count: cur } }) => acc + cur,
            { data: { count: 0 } }
          );
          return { data: { count: total } };
        } catch (err) {
          throw new Error(err);
        }
      },
      label: [i18n._(msg`Workflow Job Template Nodes`)],
    },
  ],
  instanceGroup: (selected) => [
    {
      request: () => OrganizationsAPI.read({ instance_groups: selected.id }),
      label: i18n._(msg`Organizations`),
    },
    {
      request: () => InventoriesAPI.read({ instance_groups: selected.id }),
      label: i18n._(msg`Inventories`),
    },
    {
      request: () =>
        UnifiedJobTemplatesAPI.read({ instance_groups: selected.id }),
      label: i18n._(msg`Templates`),
    },
  ],

  instance: (selected) => [
    {
      request: () => InstanceGroupsAPI.read({ instances: selected.id }),
      label: i18n._(msg`Instance Groups`),
    },
  ],
};
