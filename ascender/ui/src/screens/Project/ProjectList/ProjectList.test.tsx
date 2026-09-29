import React from 'react';
import { createMemoryHistory } from 'history';
import { act, screen, waitFor, within } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import {
  ProjectsAPI,
  JobTemplatesAPI,
  InventorySourcesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import ProjectList from './ProjectList';

vi.mock('../../../api');

const mockProjects = [
  {
    id: 1,
    name: 'Project 1',
    url: '/api/v2/projects/1',
    type: 'project',
    scm_type: 'git',
    scm_revision: 'hfadsh89sa9gsaisdf0jogos0fgd9sgdf89adsf98',
    summary_fields: {
      last_job: {
        id: 9000,
        status: 'successful',
      },
      user_capabilities: {
        delete: true,
        update: true,
      },
    },
  },
  {
    id: 2,
    name: 'Project 2',
    url: '/api/v2/projects/2',
    type: 'project',
    scm_type: 'svn',
    scm_revision: '7788f7erga0jijodfgsjisiodf98sdga9hg9a98gaf',
    summary_fields: {
      last_job: {
        id: 9002,
        status: 'successful',
      },
      user_capabilities: {
        delete: true,
        update: true,
      },
    },
  },
  {
    id: 3,
    name: 'Project 3',
    url: '/api/v2/projects/3',
    type: 'project',
    scm_type: 'git',
    scm_revision: '4893adfi749493afjksjoaiosdgjoaisdjadfisjaso',
    summary_fields: {
      last_job: {
        id: 9003,
        status: 'successful',
      },
      user_capabilities: {
        delete: false,
        update: false,
      },
    },
  },
  {
    id: 4,
    name: 'Project 4',
    url: '/api/v2/projects/4',
    type: 'project',
    scm_type: 'archive',
    scm_revision: 'odsd9ajf8aagjisooajfij34ikdj3fs994s4daiaos7',
    summary_fields: {
      last_job: {
        id: 9004,
        status: 'successful',
      },
      user_capabilities: {
        delete: false,
        update: false,
      },
    },
  },
];

function getRowCheckbox(name: string) {
  const row = screen.getByRole('link', { name }).closest('tr');
  return within(row!).getByRole('checkbox');
}

describe('<ProjectList />', () => {
  beforeEach(() => {
    // Deleting one row first counts what depends on it, through one read
    // per related endpoint. Nothing here depends on the row being deleted.
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: {
        count: mockProjects.length,
        results: mockProjects,
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.read>);

    vi.mocked(ProjectsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should load and render projects', async () => {
    renderWithContexts(<ProjectList />);

    expect(
      await screen.findByRole('link', { name: 'Project 1' })
    ).toBeInTheDocument();
    mockProjects.forEach((p) =>
      expect(screen.getByRole('link', { name: p.name })).toBeInTheDocument()
    );
  });

  test('should select project when checked', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    const checkbox = getRowCheckbox('Project 1');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);
    expect(rowCheckboxes).toHaveLength(4);

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('should disable delete button when a non-deletable project is selected', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 3' });

    await user.click(getRowCheckbox('Project 3'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should call delete api and query related-resource delete details', async () => {
    vi.mocked(ProjectsAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof ProjectsAPI.destroy>
    );
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    await user.click(getRowCheckbox('Project 1'));
    await user.click(getRowCheckbox('Project 2'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(ProjectsAPI.destroy).toHaveBeenCalledTimes(2));
  });

  test('single-project delete confirmation fires the 3 related-resource requests', async () => {
    vi.mocked(ProjectsAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof ProjectsAPI.destroy>
    );
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    await user.click(getRowCheckbox('Project 1'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // opening the confirmation for a single item queries the related resources
    // (JobTemplates, WorkflowJobTemplates, InventorySources) that block delete
    await screen.findByRole('button', { name: 'confirm delete' });
    await waitFor(() => {
      expect(JobTemplatesAPI.read).toHaveBeenCalled();
      expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalled();
      expect(InventorySourcesAPI.read).toHaveBeenCalled();
    });
  });

  test('should show deletion error', async () => {
    vi.mocked(ProjectsAPI.destroy).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/projects/1',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });
    /* The list, the count of what has a source to sync from, and the count
       of those the reader may start. */
    expect(ProjectsAPI.read).toHaveBeenCalledTimes(3);

    await user.click(getRowCheckbox('Project 1'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('Add button shown for users with ability to POST', async () => {
    renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('Add button hidden for users without ability to POST', async () => {
    vi.mocked(ProjectsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.readOptions>);
    renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  /*
   * Sync All reads what the search matches, as the list does, and every page
   * of it rather than stopping at the first.
   */
  test('Sync All counts and syncs within the search, every page', async () => {
    const [first, , third] = mockProjects;
    vi.mocked(ProjectsAPI.read).mockImplementation(((
      params: Record<string, unknown> = {}
    ) => {
      if (params.page_size === 200) {
        return Promise.resolve({
          data:
            params.page === 1
              ? { count: 2, results: [first], next: '/page=2' }
              : { count: 2, results: [third], next: null },
        });
      }
      return Promise.resolve({
        data: { count: mockProjects.length, results: mockProjects },
      });
    }) as unknown as typeof ProjectsAPI.read);
    const history = createMemoryHistory({
      initialEntries: ['/projects?project.name__icontains=foo'],
    });
    const { user } = renderWithContexts(<ProjectList />, {
      context: { router: { history } },
    });
    await screen.findByRole('link', { name: 'Project 1' });

    // The counts that enable the button are taken within the search.
    expect(ProjectsAPI.read).toHaveBeenCalledWith({
      name__icontains: 'foo',
      not__scm_type: '',
      role_level: 'update_role',
      page_size: 1,
    });

    const button = screen.getByRole('button', { name: 'Sync All' });
    await user.hover(button);
    expect(
      await screen.findByText('Sync all Projects matching the current search')
    ).toBeInTheDocument();

    await user.click(button);
    await settleTooltips();
    await waitFor(() => expect(ProjectsAPI.sync).toHaveBeenCalledTimes(2));
    expect(ProjectsAPI.sync).toHaveBeenCalledWith(1);
    expect(ProjectsAPI.sync).toHaveBeenCalledWith(3);
    expect(ProjectsAPI.read).toHaveBeenCalledWith({
      name__icontains: 'foo',
      not__scm_type: '',
      role_level: 'update_role',
      page: 2,
      page_size: 200,
      order_by: 'name',
    });
  });

  /*
   * Two syncs ending close together start two reads of their projects. The
   * first used to be dropped once the second began, which left its row
   * holding the finished job and showing Syncing instead of its revision.
   */
  test('should show the new revision of every project whose sync finished', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const debug = global.console.debug;
    global.console.debug = () => {};

    try {
      const reads: Record<number, (data: unknown) => void> = {};
      vi.mocked(ProjectsAPI.readDetail).mockImplementation(
        ((id: number) =>
          new Promise((resolve) => {
            reads[id] = (data) => resolve({ data });
          })) as unknown as typeof ProjectsAPI.readDetail
      );

      renderWithContexts(<ProjectList />);
      await screen.findByRole('link', { name: 'Project 1' });
      await mockServer.connected;

      const send = (
        projectId: number,
        status: string,
        finished: string | null
      ) =>
        act(() => {
          mockServer.send(
            JSON.stringify({
              project_id: projectId,
              unified_job_id: 100 + projectId,
              type: 'project_update',
              status,
              finished,
            })
          );
        });

      send(1, 'running', null);
      send(2, 'running', null);
      await waitFor(() =>
        expect(screen.getAllByText('Syncing')).toHaveLength(2)
      );

      send(1, 'successful', '2026-09-29T10:00:00Z');
      await waitFor(() => expect(reads[1]).toBeDefined());
      send(2, 'successful', '2026-09-29T10:00:01Z');
      await waitFor(() => expect(reads[2]).toBeDefined());

      // Both reads are in flight; the first answers only after the second began.
      await act(async () => {
        reads[1]!({ ...mockProjects[0], scm_revision: 'aaaaaaa1111111' });
        reads[2]!({ ...mockProjects[1], scm_revision: 'bbbbbbb2222222' });
      });

      expect(await screen.findByText('aaaaaaa')).toBeInTheDocument();
      expect(await screen.findByText('bbbbbbb')).toBeInTheDocument();
      expect(screen.queryByText('Syncing')).not.toBeInTheDocument();
    } finally {
      global.console.debug = debug;
      WS.clean();
    }
  });
});
