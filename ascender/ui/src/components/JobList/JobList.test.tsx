import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import {
  AdHocCommandsAPI,
  InventoryUpdatesAPI,
  JobTemplatesAPI,
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
import { createMemoryHistory } from '../../../testUtils/historyShim';
import JobList, { asChoiceLists } from './JobList';

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
        cancel: true,
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
        cancel: true,
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
        cancel: true,
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
        cancel: true,
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
        cancel: true,
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
        cancel: true,
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
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<JobList />);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /— job \d/ })).toHaveLength(6)
    );
  });

  /*
   * The toolbar reads left to right as the run does: start one, stop the ones
   * running, remove what has finished.
   */
  test('should offer run, cancel and delete, in that order', async () => {
    renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    const order = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter((label) => ['Run', 'Cancel', 'Delete'].includes(label ?? ''));
    expect(order).toEqual(['Run', 'Cancel', 'Delete']);

    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    // Nothing is selected, so neither of these has anything to act on.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test("puts a runs tab's own Run in place of the menu of everything", async () => {
    const { user } = renderWithContexts(
      <JobList
        runControl={
          <button type="button" aria-label="Run">
            Run this one
          </button>
        }
      />
    );
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('button', { name: 'Run' }));
    // The tab's own control, not the menu that asks what to run.
    expect(screen.getByText('Run this one')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  test('leaves the run control out entirely when told to', async () => {
    const { container } = renderWithContexts(<JobList runControl={false} />);
    await screen.findByRole('link', { name: '1 — job 1' });

    expect(
      screen.queryByRole('button', { name: 'Run' })
    ).not.toBeInTheDocument();
    // No toolbar item is left standing empty where the control would be.
    const emptyItems = [
      ...container.querySelectorAll('.pf-v6-c-toolbar__item'),
    ].filter((item) => item.childElementCount === 0);
    expect(emptyItems).toHaveLength(0);
  });

  /*
   * The API ORs every or__ clause together, with each other and with any the
   * defaults hold, as an inventory's Runs tab does. A Status of Failed has to
   * be an AND clause on every list, or it widens the list instead: to every
   * failed run anywhere, or, beside a Type of Job, to every job as well.
   */
  test.each([
    ['a list of its own', undefined, 'job.status=failed'],
    [
      'an inventory Runs tab',
      { or__job__inventory: 2, or__adhoccommand__inventory: 2 },
      'job.status=failed',
    ],
  ])(
    'filters by status on %s so that it narrows',
    async (_label, defaultParams, expected) => {
      const { user, history } = renderWithContexts(
        <JobList defaultParams={defaultParams} />
      );
      await screen.findByRole('link', { name: '1 — job 1' });

      await user.click(
        screen.getByRole('button', { name: 'Simple key select' })
      );
      await user.click(await screen.findByRole('option', { name: 'Status' }));
      await user.click(
        screen.getByRole('button', { name: 'Filter By Status' })
      );
      await user.click(await screen.findByRole('checkbox', { name: 'Failed' }));

      await waitFor(() => expect(history.location.search).toContain(expected));
    }
  );

  /*
   * Two ticked statuses mean either of them, so on every list they go as one
   * __in list: repeated AND clauses would match nothing, and the or__ group
   * would widen the list.
   */
  test.each([
    [
      'a list of its own',
      undefined,
      '?job.status=failed&job.status=successful',
      { status__in: 'failed,successful' },
    ],
    [
      'an inventory Runs tab',
      { or__job__inventory: 2, or__adhoccommand__inventory: 2 },
      '?job.status=failed&job.status=successful',
      { status__in: 'failed,successful' },
    ],
  ])(
    'asks for either of two ticked statuses on %s',
    async (_label, defaultParams, search, expected) => {
      renderWithContexts(<JobList defaultParams={defaultParams} />, {
        context: {
          router: {
            history: createMemoryHistory({ initialEntries: [`/${search}`] }),
          },
        },
      });

      await waitFor(() =>
        expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(
          expect.objectContaining(expected)
        )
      );
      expect(
        vi.mocked(UnifiedJobsAPI.read).mock.calls[0]?.[0]
      ).not.toHaveProperty('status');
    }
  );

  /*
   * Type and Status used to go as or__type and or__status, which the API ORs
   * together: a Type of Job and a Status of Failed listed every job and every
   * failed run of any kind, rather than the jobs that failed.
   */
  test('asks for runs of the ticked type that also have the ticked status', async () => {
    const { user, history } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    const tick = async (key: string, option: string) => {
      await user.click(
        screen.getByRole('button', { name: 'Simple key select' })
      );
      await user.click(await screen.findByRole('option', { name: key }));
      await user.click(
        screen.getByRole('button', { name: `Filter By ${key}` })
      );
      await user.click(await screen.findByRole('checkbox', { name: option }));
    };
    await tick('Type', 'Job');
    await tick('Status', 'Failed');

    await waitFor(() =>
      expect(history.location.search).toContain('job.status=failed')
    );
    expect(history.location.search).toContain('job.type=job');
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'job', status: 'failed' })
      )
    );
    const params = vi.mocked(UnifiedJobsAPI.read).mock.lastCall?.[0];
    expect(params).not.toHaveProperty('or__type');
    expect(params).not.toHaveProperty('or__status');
  });

  /* An address saved while the filters were or__ still opens, and asks for
     what it meant rather than joining the OR group. */
  test('reads a status saved in the old or__ form', async () => {
    renderWithContexts(<JobList />, {
      context: {
        router: {
          history: createMemoryHistory({
            initialEntries: [
              '/?job.or__status=failed&job.or__status=successful',
            ],
          }),
        },
      },
    });

    await screen.findByRole('link', { name: '1 — job 1' });
    const params = vi.mocked(UnifiedJobsAPI.read).mock.calls[0]?.[0];
    expect(params).toEqual(
      expect.objectContaining({ status__in: 'failed,successful' })
    );
    expect(params).not.toHaveProperty('or__status');
  });

  /*
   * The button offers every kind of run the list shows, and each item opens
   * what that kind is started from.
   */
  test('should offer a run of each kind the list shows', async () => {
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('button', { name: 'Run' }));

    [
      'Job',
      'Workflow',
      'Command',
      'Inventory Sync',
      'Project Sync',
      'Cleanup Job',
    ].forEach((kind) =>
      expect(screen.getByRole('menuitem', { name: kind })).toBeVisible()
    );
  });

  /* The template is the wizard's first step, then where to run it. */
  test('should open the launch wizard on the template to run', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 1, results: [{ id: 7, name: 'a template' }] },
    } as unknown as Awaited<ReturnType<typeof JobTemplatesAPI.read>>);
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: 'Job' }));

    expect(await screen.findByText('a template')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector('.pf-v6-c-wizard__nav-link.pf-m-current')
          ?.textContent
      ).toEqual('Template')
    );
  });

  test('should select and un-select items', async () => {
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    const firstRow = screen
      .getByRole('link', { name: '1 — job 1' })
      .closest('tr');
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
    await screen.findByRole('link', { name: '1 — job 1' });

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
    await screen.findByRole('link', { name: '1 — job 1' });

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
    };

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });
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
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

    // running jobs cannot be deleted -> the toolbar Delete button is disabled
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  /*
   * The selection is a copy of each row taken when it was ticked, while the
   * websocket moves the rows on. The toolbar must decide on the status a run
   * has now, so a run that finished after being ticked becomes deletable and
   * stops being cancelable.
   */
  describe('after a ticked run changes status', () => {
    let mockServer: WS;

    beforeEach(() => {
      WS.clean();
      global.document.cookie = 'csrftoken=abc123';
      mockServer = new WS('ws://localhost/websocket/');
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
        data: { count: 1, results: [mockResults[1]] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    });

    afterEach(() => {
      mockServer.close();
      WS.clean();
    });

    async function tickThenFinish() {
      const rendered = renderWithContexts(<JobList />);
      await screen.findByRole('link', { name: '2 — job 2' });
      await mockServer.connected;
      await rendered.user.click(
        screen.getByRole('checkbox', { name: 'Select row 0' })
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

      await act(async () => {
        mockServer.send(
          JSON.stringify({
            unified_job_id: 2,
            type: 'job',
            status: 'successful',
          })
        );
      });
      return rendered;
    }

    test('enables Delete once the run has finished', async () => {
      const destroyJob = mockInherited(JobsAPI, 'destroy');
      const { user } = await tickThenFinish();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', { name: 'confirm delete' })
      );
      await waitFor(() => expect(destroyJob).toHaveBeenCalledWith(2));
    });

    test('disables Cancel once the run has finished', async () => {
      await tickThenFinish();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      );
    });
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
    await screen.findByRole('link', { name: '2 — job 2' });

    const row = screen.getByRole('link', { name: '2 — job 2' }).closest('tr');
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
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
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
    await screen.findByRole('link', { name: '2 — job 2' });

    const row = screen.getByRole('link', { name: '2 — job 2' }).closest('tr');
    await user.click(
      within(row as unknown as HTMLElement).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('#cancel-job-confirm-button')!);

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});

describe('asChoiceLists', () => {
  test('sends a status or type with several options as one __in list', () => {
    expect(
      asChoiceLists({
        status: ['failed', 'error'],
        type: ['job', 'project_update'],
        page: 2,
      })
    ).toEqual({
      status__in: 'failed,error',
      type__in: 'job,project_update',
      page: 2,
    });
  });

  test('leaves a single option and other filters as they are', () => {
    const params = { status: 'failed', name__icontains: ['a', 'b'] };
    expect(asChoiceLists(params)).toEqual(params);
  });

  test('folds the old or__ form into the plain one', () => {
    expect(
      asChoiceLists({
        or__status: ['failed', 'error'],
        status: 'failed',
        or__type: 'job',
        or__job__inventory: 2,
      })
    ).toEqual({
      status__in: 'failed,error',
      type: 'job',
      or__job__inventory: 2,
    });
  });
});
