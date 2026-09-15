import type { DeleteCount } from 'util/getRelatedResourceDeleteDetails';
import {
  InventoriesAPI,
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobTemplatesAPI,
  WorkflowJobTemplateNodesAPI,
  CredentialsAPI,
  ExecutionEnvironmentsAPI,
  CredentialInputSourcesAPI,
} from 'api';
import { i18n } from '@lingui/core';
import type { ResponseOf } from '../../testUtils/responseOf';
import {
  getRelatedResourceDeleteCounts,
  relatedResourceDeleteRequests,
} from './getRelatedResourceDeleteDetails';
import { messages as enMessages } from '../locales/en/messages';

vi.mock('../api/models/Credentials');
vi.mock('../api/models/Inventories');
vi.mock('../api/models/InventorySources');
vi.mock('../api/models/JobTemplates');
vi.mock('../api/models/Projects');
vi.mock('../api/models/WorkflowJobTemplates');
vi.mock('../api/models/WorkflowJobTemplateNodes');
vi.mock('../api/models/CredentialInputSources');
vi.mock('../api/models/ExecutionEnvironments');
vi.mock('../api/models/Applications');
vi.mock('../api/models/NotificationTemplates');
vi.mock('../api/models/Teams');

describe('delete details', () => {
  beforeAll(() => {
    i18n.load({ en: enMessages });
    i18n.activate('en');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should call api for credentials list', () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.credential({ id: 1 })
    );
    expect(InventorySourcesAPI.read).toHaveBeenCalledWith({
      credentials__id: 1,
    });
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({ credentials: 1 });
    expect(ProjectsAPI.read).toHaveBeenCalledWith({ credentials: 1 });
  });

  test('should call api for projects list', () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.project({ id: 1 })
    );
    expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalledWith({
      unified_job_template: 1,
    });
    expect(InventorySourcesAPI.read).toHaveBeenCalledWith({
      source_project: 1,
    });
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({ project: 1 });
  });

  test('should call api for templates list', () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.template({ id: 1 })
    );
    expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalledWith({
      unified_job_template: 1,
    });
  });

  test('should call api for credential type list', () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.credentialType({ id: 1 })
    );
    expect(CredentialsAPI.read).toHaveBeenCalledWith({
      credential_type__id: 1,
    });
  });

  test('should call api for inventory list', () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.inventory({ id: 1 })
    );
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({ inventory: 1 });
    expect(WorkflowJobTemplatesAPI.read).toHaveBeenCalledWith({
      inventory: 1,
    });
  });

  test('should call api for inventory source list', async () => {
    vi.mocked(InventoriesAPI.updateSources).mockResolvedValue({
      data: [{ inventory_source: 2 }],
    } as unknown as ResponseOf<typeof InventoriesAPI.updateSources>);
    await getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.inventorySource(1)
    );
    expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalledWith({
      unified_job_template: 1,
    });
  });

  test('should call api for organization list', async () => {
    getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.organization({ id: 1 })
    );
    expect(CredentialsAPI.read).toHaveBeenCalledWith({ organization: 1 });
  });

  test('should call return error for inventory source list', async () => {
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockRejectedValue({
      response: {
        config: {
          method: 'get',
          url: '/api/v2/workflow_job_template_nodes',
        },
        data: 'An error occurred',
        status: 403,
      },
    });
    const { error } = await getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.inventorySource(1)
    );

    expect(error).toBeDefined();
  });

  test('should return proper results', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 1 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { count: 10 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    vi.mocked(CredentialInputSourcesAPI.read).mockResolvedValue({
      data: { count: 20 },
    } as unknown as ResponseOf<typeof CredentialInputSourcesAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: { count: 30 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: { count: 2 },
    } as unknown as ResponseOf<typeof ProjectsAPI.read>);

    const { results } = await getRelatedResourceDeleteCounts(
      relatedResourceDeleteRequests.credential({ id: 1 })
    );
    expect(
      (results as DeleteCount[]).map(({ label, count }) => [
        i18n._(label),
        count,
      ])
    ).toEqual([
      ['Job Templates', 1],
      ['Projects', 2],
      ['Inventory Sources', 10],
      ['Credential Input Sources', 20],
      ['Execution Environments', 30],
    ]);
  });
});
