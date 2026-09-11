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
import type { MessageDescriptor } from '@lingui/core';
import type { ApiEntity, Paginated } from '../types/api';

/**
 * A row these checks run for. It has come back from the API already, so it
 * carries an id where ApiEntity leaves that optional.
 */
type DeletableEntity = ApiEntity & { id: number };

/** One related-resource count to look up before a delete is allowed. */
export interface DeleteRequest {
  /**
   * Only the count is read off the response, so a request is free to add up
   * several of its own and hand back a figure rather than a whole response.
   */
  request: () => Promise<{ data: { count: number } }>;
  label: MessageDescriptor;
}

/** A label paired with how many related objects it found. */
export interface DeleteCount {
  label: MessageDescriptor;
  count: number;
}

// Resolves each request and returns the labels as lingui message
// descriptors, paired with their counts; translate with i18n._(label)
// at render time. `results` is false when nothing has a count > 0.
export async function getRelatedResourceDeleteCounts(
  requests: DeleteRequest[]
): Promise<{ results: DeleteCount[] | false; error: unknown }> {
  let results: DeleteCount[] = [];
  let error: unknown = null;

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
      .map(({ label }, index) => ({ label, count: counts[index] ?? 0 }))
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
  credential: (selected: DeletableEntity) => [
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

  credentialType: (selected: DeletableEntity) => [
    {
      request: async () =>
        CredentialsAPI.read({
          credential_type__id: selected.id,
        }),
      label: msg`Credentials`,
    },
  ],

  inventory: (selected: DeletableEntity) => [
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

  inventorySource: (inventorySourceId: number | string) => [
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

  project: (selected: DeletableEntity) => [
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

  template: (selected: DeletableEntity) => [
    {
      request: async () =>
        WorkflowJobTemplateNodesAPI.read({
          unified_job_template: selected.id,
        }),
      label: msg`Workflow Job Template Nodes`,
    },
  ],

  organization: (selected: DeletableEntity) => [
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
  executionEnvironment: (selected: DeletableEntity) => [
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
      // No try/catch: this used to wrap whatever it caught in new Error(err),
      // which stringified one Error into the message of another and lost the
      // original stack. Letting it propagate is what that wrapper was for.
      request: async () => {
        const {
          data: { results },
        } = await InventorySourcesAPI.read<Paginated<ApiEntity>>({
          execution_environment: selected.id,
        });

        const responses = await Promise.all(
          (results as ApiEntity[]).map((result) =>
            WorkflowJobTemplateNodesAPI.read({
              unified_job_template: result.id as number,
            })
          )
        );

        const total = responses.reduce(
          (acc, { data }) => acc + ((data as { count: number }).count ?? 0),
          0
        );
        return { data: { count: total } };
      },
      label: msg`Workflow Job Template Nodes`,
    },
  ],
  instanceGroup: (selected: DeletableEntity) => [
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

  instance: (selected: DeletableEntity) => [
    {
      request: () => InstanceGroupsAPI.read({ instances: selected.id }),
      label: msg`Instance Groups`,
    },
  ],
};
