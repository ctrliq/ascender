import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import WS from 'vitest-websocket-mock';
import {
  AdHocCommandsAPI,
  InventoryUpdatesAPI,
  JobsAPI,
  ProjectUpdatesAPI,
  SystemJobsAPI,
  UnifiedJobsAPI,
  WorkflowJobsAPI,
  InventorySourcesAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { mockInherited } from '../../../testUtils/apiMocks';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../testUtils/rtlContexts';
import JobList, { JOB_LIST_SUMMARY_FIELDS } from './JobList';

vi.mock('../../api');

const mockResults = [
  {
    id: 1,
    url: '/api/v2/project_updates/1',
    name: 'job 1',
    type: 'project_update',
    status: 'running',
    related: {
      cancel: '/api/v2/project_updates/1/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        start: true,
      },
    },
  },
  {
    id: 2,
    url: '/api/v2/jobs/2',
    name: 'job 2',
    type: 'job',
    status: 'running',
    related: {
      cancel: '/api/v2/jobs/2/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        start: true,
      },
    },
  },
  {
    id: 3,
    url: '/api/v2/inventory_updates/3',
    name: 'job 3',
    type: 'inventory_update',
    status: 'running',
    related: {
      cancel: '/api/v2/inventory_updates/3/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        start: true,
      },
    },
  },
  {
    id: 4,
    url: '/api/v2/workflow_jobs/4',
    name: 'job 4',
    type: 'workflow_job',
    status: 'running',
    related: {
      cancel: '/api/v2/workflow_jobs/4/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        start: true,
      },
    },
  },
  {
    id: 5,
    url: '/api/v2/system_jobs/5',
    name: 'job 5',
    type: 'system_job',
    status: 'running',
    related: {
      cancel: '/api/v2/system_jobs/5/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
      },
    },
  },
  {
    id: 6,
    url: '/api/v2/ad_hoc_commands/6',
    name: 'job 6',
    type: 'ad_hoc_command',
    status: 'running',
    related: {
      cancel: '/api/v2/ad_hoc_commands/6/cancel',
    },
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
      },
    },
  },
];

// successful clones (non-running) so the bulk-delete button is enabled and we
// can drive a real delete through the toolbar + confirm modal.
const deletableResults = mockResults.map((job) => ({
  ...job,
  status: 'successful',
}));

function stackResult(templateId: number, representativeId: number) {
  return {
    ...mockResults[1],
    id: representativeId,
    name: 'stack job',
    status: 'running',
    started: '2019-08-08T19:24:18.329589Z',
    finished: null,
    stack: {
      count: 3,
      status_counts: { waiting: 1, running: 2 },
      template: {
        id: templateId,
        name: 'stack job',
        project: { id: 3, name: 'Web' },
        organization: { id: 1, name: 'Default' },
      },
    },
  } as unknown as (typeof mockResults)[number];
}

const stackedResults = [deletableResults[0], stackResult(10, 12)];

function statusResult(
  status: 'pending' | 'running',
  representativeId: number,
  count: number
) {
  return {
    ...mockResults[1],
    id: representativeId,
    name: `${status} jobs`,
    status,
    started: '2019-08-08T19:24:18.329589Z',
    finished: null,
    status_group: { status, count },
  } as unknown as (typeof mockResults)[number];
}

const statusResults = [statusResult('running', 12, 3), deletableResults[0]];

function getRowCheckboxes() {
  const selectAll = screen.queryByRole('checkbox', { name: 'Select all' });
  return screen.getAllByRole('checkbox').filter((box) => box !== selectAll);
}

describe('<JobList />', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 3, results: mockResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);

    vi.mocked(UnifiedJobsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readOptions>);
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            source: {
              choices: [
                ['scm', 'Sourced from Project'],
                ['file', 'File, Directory or Script'],
              ],
            },
          },
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<JobList />);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /^job \d/ })).toHaveLength(6)
    );
  });

  test('requests the stacked list with group_by=template', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          group_by: 'template',
          summary_fields: JOB_LIST_SUMMARY_FIELDS.join(','),
        })
      )
    );
    expect(UnifiedJobsAPI.read).not.toHaveBeenCalledWith(
      expect.objectContaining({ unified_job_template: expect.anything() })
    );
  });

  test('renders stack rows with status counts and no checkbox', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });

    const { user } = renderWithContexts(<JobList />, {
      context: { router: { history } },
    });
    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    const row = document.querySelector('#job-row-12') as HTMLElement;
    expect(within(row).getByText('Waiting 1')).toBeInTheDocument();
    expect(within(row).getByText('Running 2')).toBeInTheDocument();
    expect(within(row).queryByText(/New/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Pending/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/x3/)).not.toBeInTheDocument();
    expect(within(row).queryByRole('checkbox')).toBeNull();

    // Select all ignores the stack row: only the regular row is selectable.
    const rowCheckboxes = getRowCheckboxes();
    expect(rowCheckboxes).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(rowCheckboxes[0]).toBeChecked();
    expect(within(row).queryByRole('checkbox')).toBeNull();
  });

  test('expand all includes stack rows', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });

    const { user } = renderWithContexts(<JobList />, {
      context: { router: { history } },
    });
    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    const stackRow = document.querySelector('#job-row-12') as HTMLElement;
    const regularRow = document.querySelector('#job-row-1') as HTMLElement;
    const stackToggle = within(stackRow).getByRole('button', {
      name: 'Details',
    });
    expect(stackToggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Expand all rows' }));

    expect(stackToggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(regularRow).getByRole('button', { name: 'Details' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('refreshes status counts from the status summary endpoint', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: statusResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStatusSummaries).mockResolvedValue({
      data: { counts: { running: 4 } },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readStatusSummaries>);

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=status'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    expect(await screen.findByText('Running 3')).toBeInTheDocument();
    await server.connected;
    await expect(server).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          schedules: ['changed'],
          control: ['limit_reached_1'],
        },
      })
    );

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 12,
          type: 'job',
          status: 'pending',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStatusSummaries).toHaveBeenCalled()
    );
    expect(await screen.findByText('Running 4')).toBeInTheDocument();
    server.close();
  });

  test('reloads a status-grouped page when the active total decreases', async () => {
    const base = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(base);
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: statusResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStatusSummaries).mockResolvedValue({
      data: { counts: { running: 2 } },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readStatusSummaries>);

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=status'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    expect(await screen.findByText('Running 3')).toBeInTheDocument();
    await server.connected;
    // The page loaded at `base`; once the ejection window has passed, the
    // pending full-page read may run immediately.
    now.mockReturnValue(base + 4000);

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 12,
          unified_job_template_id: 10,
          status: 'successful',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStatusSummaries).toHaveBeenCalled()
    );
    // A lower active total means a job became terminal, so the terminal row and
    // the page count must be read rather than only patching the chip.
    await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(2));
    server.close();
  });

  test('ignores status summaries when the page has no status rows', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 25, results: [deletableResults[0]] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStatusSummaries).mockResolvedValue({
      data: { counts: { running: 2 } },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readStatusSummaries>);

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=status&job.page=2'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    await screen.findByRole('link', { name: 'job 1' });
    await server.connected;

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 12,
          unified_job_template_id: 10,
          status: 'pending',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStatusSummaries).toHaveBeenCalled()
    );
    // Page 2 has no status rows to patch or eject; only the safety poll may
    // eventually read the page.
    expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    server.close();
  });

  test('keeps status rows when a summary read fails', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: statusResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStatusSummaries).mockRejectedValue(
      new Error('summary failed')
    );

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=status'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    expect(await screen.findByText('Running 3')).toBeInTheDocument();
    await server.connected;

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 12,
          unified_job_template_id: 10,
          status: 'pending',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStatusSummaries).toHaveBeenCalled()
    );
    expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Running 3')).toBeInTheDocument();
    server.close();
  });

  test('reloads a template-grouped page when a stack loses a member', async () => {
    const base = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(base);
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStackSummaries).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            ...mockResults[1],
            id: 12,
            name: 'stack job',
            status: 'running',
            started: '2019-08-08T19:24:18.329589Z',
            finished: null,
            stack: {
              count: 2,
              status_counts: { running: 2 },
              template: { id: 10, name: 'stack job' },
            },
          },
        ],
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readStackSummaries>);

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    await server.connected;
    now.mockReturnValue(base + 4000);

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 99,
          unified_job_template_id: 10,
          status: 'successful',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStackSummaries).toHaveBeenCalled()
    );
    await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(2));
    server.close();
  });

  test('keeps stack rows when a summary read fails', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStackSummaries).mockRejectedValue(
      new Error('summary failed')
    );

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    await server.connected;

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 99,
          unified_job_template_id: 10,
          status: 'successful',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStackSummaries).toHaveBeenCalled()
    );
    expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#job-row-12')).not.toBeNull();
    server.close();
  });

  test('re-reads the page when a stack summary changes its representative', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readStackSummaries).mockResolvedValue({
      data: { count: 1, results: [stackResult(10, 13)] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readStackSummaries>);

    global.document.cookie = 'csrftoken=abc123';
    const server = new WS('ws://localhost/websocket/');
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });
    renderWithContexts(<JobList />, { context: { router: { history } } });

    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    await server.connected;

    await act(async () => {
      server.send(
        JSON.stringify({
          unified_job_id: 99,
          unified_job_template_id: 10,
          status: 'running',
        })
      );
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.readStackSummaries).toHaveBeenCalled()
    );
    // The summary changed which job represents the stack, so the page must
    // re-read to move the row and update sorting.
    await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(2));
    server.close();
  });

  test('keeps a stack expanded when its representative changes', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: stackedResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template'],
    });
    const { user } = renderWithContexts(<JobList />, {
      context: { router: { history } },
    });

    await waitFor(() =>
      expect(document.querySelector('#job-row-12')).not.toBeNull()
    );
    const firstStackRow = document.querySelector('#job-row-12') as HTMLElement;
    await user.click(
      within(firstStackRow).getByRole('button', { name: 'Details' })
    );
    expect(
      within(firstStackRow).getByRole('button', { name: 'Details' })
    ).toHaveAttribute('aria-expanded', 'true');

    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [deletableResults[0], stackResult(10, 13)],
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);

    const idHeader = screen.getByRole('columnheader', { name: 'ID' });
    await user.click(within(idHeader).getByRole('button', { name: 'ID' }));

    await waitFor(() =>
      expect(document.querySelector('#job-row-13')).not.toBeNull()
    );
    const nextStackRow = document.querySelector('#job-row-13') as HTMLElement;
    expect(
      within(nextStackRow).getByRole('button', { name: 'Details' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('#job-row-12')).toBeNull();
  });

  test('prunes selection when a selected row leaves the page', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 2, results: mockResults.slice(0, 2) },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    const firstRow = screen.getByRole('link', { name: 'job 1' }).closest('tr');
    await user.click(
      within(firstRow as unknown as HTMLElement).getByRole('checkbox')
    );

    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 1, results: mockResults.slice(1, 2) },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    const idHeader = screen.getByRole('columnheader', { name: 'ID' });
    await user.click(within(idHeader).getByRole('button', { name: 'ID' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'job 1' })
      ).not.toBeInTheDocument()
    );
    const secondRow = screen.getByRole('link', { name: 'job 2' }).closest('tr');
    expect(
      within(secondRow as unknown as HTMLElement).getByRole('checkbox')
    ).not.toBeChecked();
  });

  test('shows the group by selector when showGroupingSelector is set', async () => {
    renderWithContexts(<JobList showGroupingSelector />);
    expect(
      await screen.findByRole('button', { name: 'No grouping' })
    ).toBeInTheDocument();
  });

  test('keeps the group by selector enabled on a grouped template-filtered list', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/jobs?group_by=template&job.unified_job_template=12&job.page=2',
      ],
    });
    renderWithContexts(<JobList showGroupingSelector />, {
      context: { router: { history } },
    });

    const toggle = await screen.findByRole('button', {
      name: 'Group by template',
    });
    expect(toggle).toBeEnabled();
  });

  test('requests a grouped template-filtered list with group_by=template', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs?group_by=template&job.unified_job_template=12'],
    });
    renderWithContexts(<JobList showGroupingSelector />, {
      context: { router: { history } },
    });

    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          group_by: 'template',
          unified_job_template: '12',
        })
      )
    );
  });

  test('should sort by ID when the ID header is clicked', async () => {
    const { history, user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    const idHeader = screen.getByRole('columnheader', { name: 'ID' });
    await user.click(within(idHeader).getByRole('button', { name: 'ID' }));
    expect(history.location.search).toContain('job.order_by=id');
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenLastCalledWith(
        expect.objectContaining({ order_by: 'id' })
      )
    );

    // a second click on the now-sorted column flips it to descending
    await user.click(within(idHeader).getByRole('button', { name: 'ID' }));
    expect(history.location.search).toContain('job.order_by=-id');
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenLastCalledWith(
        expect.objectContaining({ order_by: '-id' })
      )
    );
  });

  test('should select and un-select items', async () => {
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    const firstRow = screen.getByRole('link', { name: 'job 1' }).closest('tr');
    const checkbox = within(firstRow as unknown as HTMLElement).getByRole(
      'checkbox'
    );

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should select and deselect all', async () => {
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = getRowCheckboxes();
    expect(rowCheckboxes).toHaveLength(6);

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should send all corresponding delete API requests', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 6, results: deletableResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    // Each model gets its own destroy: they inherit one from Base, so the
    // counts below would otherwise all be the same function's.
    const destroyAdHoc = mockInherited(AdHocCommandsAPI, 'destroy');
    const destroyInventoryUpdate = mockInherited(
      InventoryUpdatesAPI,
      'destroy'
    );
    const destroyJob = mockInherited(JobsAPI, 'destroy');
    const destroyProjectUpdate = mockInherited(ProjectUpdatesAPI, 'destroy');
    const destroySystemJob = mockInherited(SystemJobsAPI, 'destroy');
    const destroyWorkflowJob = mockInherited(WorkflowJobsAPI, 'destroy');

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => {
      expect(destroyAdHoc).toHaveBeenCalledTimes(1);
      expect(destroyInventoryUpdate).toHaveBeenCalledTimes(1);
      expect(destroyJob).toHaveBeenCalledTimes(1);
      expect(destroyProjectUpdate).toHaveBeenCalledTimes(1);
      expect(destroySystemJob).toHaveBeenCalledTimes(1);
      expect(destroyWorkflowJob).toHaveBeenCalledTimes(1);
    });
  });

  test('should query jobs list after delete API requests', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            url: '/api/v2/project_updates/1',
            name: 'job 1',
            type: 'project_update',
            status: 'successful',
            related: {
              cancel: '/api/v2/project_updates/1/cancel',
            },
            summary_fields: {
              user_capabilities: {
                delete: true,
                start: true,
              },
            },
          },
        ],
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(ProjectUpdatesAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof ProjectUpdatesAPI.destroy>
    );
    const jobListParams = {
      order_by: '-finished',
      not__launch_type: 'sync',
      page: 1,
      page_size: 20,
      summary_fields: JOB_LIST_SUMMARY_FIELDS.join(','),
    };

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });
    expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(jobListParams);

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    // a re-fetch of the list is triggered after deletion
    await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(2));
    expect(UnifiedJobsAPI.read).toHaveBeenLastCalledWith(jobListParams);
  });

  test('should display message about job running status', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            url: '/api/v2/project_updates/1',
            name: 'job 1',
            type: 'project_update',
            status: 'running',
            related: {
              cancel: '/api/v2/project_updates/1/cancel',
            },
            summary_fields: {
              user_capabilities: {
                delete: true,
                start: true,
              },
            },
          },
          {
            id: 2,
            url: '/api/v2/jobs/2',
            name: 'job 2',
            type: 'job',
            status: 'running',
            related: {
              cancel: '/api/v2/jobs/2/cancel',
            },
            summary_fields: {
              user_capabilities: {
                delete: true,
                start: true,
              },
            },
          },
        ],
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

    // running jobs cannot be deleted -> the toolbar Delete button is disabled
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('error is shown when job not successfully deleted from api', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 6, results: deletableResults },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(JobsAPI.destroy).mockImplementation(() => {
      throw Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/jobs/2',
          },
          data: 'An error occurred',
        },
      });
    });

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 2' });

    const row = screen.getByRole('link', { name: 'job 2' }).closest('tr');
    await user.click(
      within(row as unknown as HTMLElement).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should send all corresponding cancel API requests', async () => {
    // every selected job must be running AND cancellable (start capability) so
    // the real toolbar Cancel button is enabled; jobs 5/6 lack start by default.
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: {
        count: 6,
        results: mockResults.map((job) => ({
          ...job,
          summary_fields: {
            ...job.summary_fields,
            user_capabilities: {
              ...job.summary_fields.user_capabilities,
              start: true,
            },
          },
        })),
      },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    // Each model gets its own cancel, so the assertions below say which
    // model was asked rather than only that some model was.
    const cancelAdHoc = mockInherited(AdHocCommandsAPI, 'cancel');
    const cancelInventoryUpdate = mockInherited(InventoryUpdatesAPI, 'cancel');
    const cancelJob = mockInherited(JobsAPI, 'cancel');
    const cancelProjectUpdate = mockInherited(ProjectUpdatesAPI, 'cancel');
    const cancelSystemJob = mockInherited(SystemJobsAPI, 'cancel');
    const cancelWorkflowJob = mockInherited(WorkflowJobsAPI, 'cancel');

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Cancel jobs' }));
    // confirm modal -> the danger confirm button
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('#cancel-job-confirm-button')!);

    await waitFor(() => {
      expect(cancelProjectUpdate).toHaveBeenCalledWith(1);
      expect(cancelJob).toHaveBeenCalledWith(2);
      expect(cancelInventoryUpdate).toHaveBeenCalledWith(3);
      expect(cancelWorkflowJob).toHaveBeenCalledWith(4);
      expect(cancelSystemJob).toHaveBeenCalledWith(5);
      expect(cancelAdHoc).toHaveBeenCalledWith(6);
    });
  });

  test('error is shown when job not successfully cancelled', async () => {
    vi.mocked(JobsAPI.cancel).mockImplementation(() => {
      throw Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/jobs/2/cancel',
          },
          data: 'An error occurred',
        },
      });
    });

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: 'job 2' });

    const row = screen.getByRole('link', { name: 'job 2' }).closest('tr');
    await user.click(
      within(row as unknown as HTMLElement).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Cancel job' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('#cancel-job-confirm-button')!);

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});
