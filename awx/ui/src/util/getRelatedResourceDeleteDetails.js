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
import { msg } from '@lingui/core/macro';

// Resolves each request and returns the labels as lingui message
// descriptors, paired with their counts; translate with i18n._(label)
// at render time. `results` is false when nothing has a count > 0.
export async function getRelatedResourceDeleteCounts(requests) {
  let results = [];
  let error = null;

  try {
    const counts = await Promise.all(
      requests.map(async ({ request }) => {
        const {
          data: { count },
        } = await request();
        return count;
      })
    );
    results = requests
      .map(({ label }, index) => ({ label, count: counts[index] }))
      .filter(({ count }) => count > 0);
  } catch (err) {
    error = err;
  }

  return {
    results: results.length > 0 && results,
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
      label: msg`Job Templates`,
    },
    {
      request: () => ProjectsAPI.read({ credentials: selected.id }),
      label: msg`Projects`,
    },
    {
      request: () =>
        InventorySourcesAPI.read({
          credentials__id: selected.id,
        }),
      label: msg`Inventory Sources`,
    },
    {
      request: () =>
        CredentialInputSourcesAPI.read({
          source_credential: selected.id,
        }),
      label: msg`Credential Input Sources`,
    },
    {
      request: () =>
        ExecutionEnvironmentsAPI.read({
          credential: selected.id,
        }),
      label: msg`Execution Environments`,
    },
  ],

  credentialType: (selected) => [
    {
      request: async () =>
        CredentialsAPI.read({
          credential_type__id: selected.id,
        }),
      label: msg`Credentials`,
    },
  ],

  inventory: (selected) => [
    {
      request: async () =>
        JobTemplatesAPI.read({
          inventory: selected.id,
        }),
      label: msg`Job Templates`,
    },
    {
      request: () => WorkflowJobTemplatesAPI.read({ inventory: selected.id }),
      label: msg`Workflow Job Templates`,
    },
  ],

  inventorySource: (inventorySourceId) => [
    {
      request: async () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: inventorySourceId,
        }),
      label: msg`Workflow Job Template Nodes`,
    },
    {
      request: async () => InventorySourcesAPI.readGroups(inventorySourceId),
      label: msg`Groups`,
    },
    {
      request: async () => InventorySourcesAPI.readHosts(inventorySourceId),
      label: msg`Hosts`,
    },
  ],

  project: (selected) => [
    {
      request: () =>
        JobTemplatesAPI.read({
          project: selected.id,
        }),
      label: msg`Job Templates`,
    },
    {
      request: () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: selected.id,
        }),
      label: msg`Workflow Job Templates`,
    },
    {
      request: () =>
        InventorySourcesAPI.read({
          source_project: selected.id,
        }),
      label: msg`Inventory Sources`,
    },
  ],

  template: (selected) => [
    {
      request: async () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: selected.id,
        }),
      label: msg`Workflow Job Template Nodes`,
    },
  ],

  organization: (selected) => [
    {
      request: async () =>
        CredentialsAPI.read({
          organization: selected.id,
        }),
      label: msg`Credentials`,
    },
    {
      request: async () =>
        TeamsAPI.read({
          organization: selected.id,
        }),
      label: msg`Teams`,
    },
    {
      request: async () =>
        NotificationTemplatesAPI.read({
          organization: selected.id,
        }),
      label: msg`Notification Templates`,
    },
    {
      request: () =>
        ExecutionEnvironmentsAPI.read({
          organization: selected.id,
        }),
      label: msg`Execution Environments`,
    },
    {
      request: async () =>
        ProjectsAPI.read({
          organization: selected.id,
        }),
      label: msg`Projects`,
    },
    {
      request: () =>
        InventoriesAPI.read({
          organization: selected.id,
        }),
      label: msg`Inventories`,
    },
    {
      request: () =>
        ApplicationsAPI.read({
          organization: selected.id,
        }),
      label: msg`Applications`,
    },
  ],
  executionEnvironment: (selected) => [
    {
      request: async () =>
        UnifiedJobTemplatesAPI.read({
          execution_environment: selected.id,
        }),
      label: msg`Templates`,
    },
    {
      request: async () =>
        ProjectsAPI.read({
          default_environment: selected.id,
        }),
      label: msg`Projects`,
    },
    {
      request: async () =>
        OrganizationsAPI.read({
          default_environment: selected.id,
        }),
      label: msg`Organizations`,
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
      label: msg`Workflow Job Template Nodes`,
    },
  ],
  instanceGroup: (selected) => [
    {
      request: () => OrganizationsAPI.read({ instance_groups: selected.id }),
      label: msg`Organizations`,
    },
    {
      request: () => InventoriesAPI.read({ instance_groups: selected.id }),
      label: msg`Inventories`,
    },
    {
      request: () =>
        UnifiedJobTemplatesAPI.read({ instance_groups: selected.id }),
      label: msg`Templates`,
    },
  ],

  instance: (selected) => [
    {
      request: () => InstanceGroupsAPI.read({ instances: selected.id }),
      label: msg`Instance Groups`,
    },
  ],
};
