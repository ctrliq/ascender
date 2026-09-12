import type { Project, SummaryFields } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import {
  ProjectsAPI,
  JobTemplatesAPI,
  InventorySourcesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ProjectDetail from './ProjectDetail';

vi.mock('../../../api');
vi.mock('hooks/useBrandName', () => ({
  __esModule: true,
  default: () => ({
    current: 'AWX',
  }),
}));

const mockProject = {
  id: 1,
  type: 'project',
  url: '/api/v2/projects/1',
  summary_fields: {
    organization: {
      id: 10,
      name: 'Foo',
    },
    default_environment: {
      id: 12,
      name: 'Bar',
      image: 'quay.io/ansible/awx-ee',
    },
    credential: {
      id: 1000,
      name: 'qux',
      kind: 'scm',
    },
    signature_validation_credential: {
      id: 2000,
      name: 'svc',
      kind: 'cryptography',
    },
    last_job: {
      id: 9000,
      status: 'successful',
    },
    created_by: {
      id: 1,
      username: 'admin',
    },
    modified_by: {
      id: 1,
      username: 'admin',
    },
    user_capabilities: {
      edit: true,
      delete: true,
      start: true,
      schedule: true,
      copy: true,
    },
  },
  created: '2019-10-10T01:15:06.780472Z',
  modified: '2019-10-10T01:15:06.780490Z',
  name: 'Project 1',
  description: 'lorem ipsum',
  scm_type: 'git',
  scm_url: 'https://mock.com/bar',
  scm_branch: 'baz',
  scm_refspec: 'refs/remotes/*',
  scm_clean: true,
  scm_delete_on_update: true,
  scm_track_submodules: true,
  credential: 100,
  signature_validation_credential: 200,
  status: 'successful',
  organization: 10,
  scm_update_on_launch: true,
  scm_update_cache_timeout: 5,
  allow_override: true,
  default_environment: 1,
} as unknown as Project & {
  summary_fields: Required<
    Pick<
      SummaryFields,
      | 'organization'
      | 'credential'
      | 'signature_validation_credential'
      | 'default_environment'
    >
  >;
};

function renderDetail(
  project: Project = mockProject,
  entry = '/projects/1/details'
) {
  const history = createMemoryHistory({ initialEntries: [entry] });
  return renderWithContexts(<ProjectDetail project={project} />, {
    context: { router: { history } },
  });
}

describe('<ProjectDetail />', () => {
  beforeEach(() => {
    // Deleting one row first counts what depends on it, through one read
    // per related endpoint. Nothing here depends on the row being deleted.
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    // DeleteButton queries related resources when opening its confirm modal
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render Details', () => {
    renderDetail();

    assertDetail('Name', mockProject.name);
    assertDetail('Description', mockProject.description);
    assertDetail('Organization', mockProject.summary_fields.organization.name);
    assertDetail('Source Control Type', 'Git');
    assertDetail('Source Control URL', mockProject.scm_url);
    assertDetail('Source Control Branch', mockProject.scm_branch);
    assertDetail('Source Control Refspec', mockProject.scm_refspec);
    assertDetail(
      'Source Control Credential',
      `Scm: ${mockProject.summary_fields.credential.name}`
    );
    assertDetail(
      'Content Signature Validation Credential',
      `Cryptography: ${mockProject.summary_fields.signature_validation_credential.name}`
    );
    assertDetail(
      'Cache Timeout',
      `${mockProject.scm_update_cache_timeout} seconds`
    );

    assertDetail(
      'Default Execution Environment',
      mockProject.summary_fields.default_environment.name
    );

    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();

    const optionsTerm = screen.getByText('Enabled Options');
    const optionsList = within(
      optionsTerm.nextElementSibling as unknown as HTMLElement
    ).getAllByRole('listitem');
    expect(optionsList).toHaveLength(5);
    [
      'Discard local changes before syncing',
      'Delete the project before syncing',
      'Track submodules latest commit on branch',
      'Update revision on job launch',
      'Allow branch override',
    ].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
  });

  test('should hide options label when all project options return false', () => {
    const mockOptions: Partial<Project> = {
      scm_type: '',
      scm_clean: false,
      scm_delete_on_update: false,
      scm_track_submodules: false,
      scm_update_on_launch: false,
      allow_override: false,
      created: '',
      modified: '',
    };
    renderDetail({ ...mockProject, ...mockOptions });
    expect(screen.queryByText('Enabled Options')).not.toBeInTheDocument();
  });

  test('delete confirmation fires the 3 related-resource requests', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    const { user } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // opening the delete confirmation queries the related resources that
    // could block deletion: the job templates and the inventory sources that
    // use this project, and the workflow nodes that run it
    await waitFor(() => {
      expect(JobTemplatesAPI.read).toHaveBeenCalled();
      expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalled();
      expect(InventorySourcesAPI.read).toHaveBeenCalled();
    });
  });

  test('should render with missing summary fields', async () => {
    renderDetail({ ...mockProject, summary_fields: {} });
    expect(await screen.findByText('Name')).toBeInTheDocument();
  });

  test('should show edit and sync button for users with edit permission', async () => {
    renderDetail();
    // the Sync button shows its "Sync" label only on the details view
    const editButton = await screen.findByRole('link', { name: 'edit' });
    const syncButton = await screen.findByRole('button', {
      name: 'Sync Project',
    });
    expect(editButton).toHaveTextContent('Edit');
    expect(syncButton).toHaveTextContent('Sync');
    expect(editButton).toHaveAttribute('href', '/projects/1/edit');
  });

  test('should hide edit button for users without edit permission', async () => {
    renderDetail({
      ...mockProject,
      summary_fields: {
        user_capabilities: {
          edit: false,
        },
      },
    });
    await screen.findByText('Name');
    expect(
      screen.queryByRole('link', { name: 'edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sync Project' })
    ).not.toBeInTheDocument();
  });

  test('edit button should navigate to project edit', async () => {
    const { history, user } = renderDetail();
    await user.click(screen.getByRole('link', { name: 'edit' }));
    expect(history.location.pathname).toEqual('/projects/1/edit');
  });

  test('sync button should call api to sync project', async () => {
    vi.mocked(ProjectsAPI.readSync).mockResolvedValue({
      data: { can_update: true },
    } as unknown as ResponseOf<typeof ProjectsAPI.readSync>);
    vi.mocked(ProjectsAPI.sync).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof ProjectsAPI.sync>);
    const { user } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Sync Project' }));
    await waitFor(() => expect(ProjectsAPI.sync).toHaveBeenCalledTimes(1));
  });

  test('expected api calls are made for delete', async () => {
    vi.mocked(ProjectsAPI.destroy).mockResolvedValueOnce(
      {} as unknown as ResponseOf<typeof ProjectsAPI.destroy>
    );
    const { user } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    await waitFor(() => expect(ProjectsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('Error dialog shown for failed deletion', async () => {
    vi.mocked(ProjectsAPI.destroy).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
