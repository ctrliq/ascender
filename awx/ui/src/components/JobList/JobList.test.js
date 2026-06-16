import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
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
import {
  renderWithContexts,
  settleTooltips,
} from '../../../testUtils/rtlContexts';
import JobList from './JobList';

jest.mock('../../api');

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

function getRowCheckboxes() {
  const selectAll = screen.queryByRole('checkbox', { name: 'Select all' });
  return screen
    .getAllByRole('checkbox')
    .filter((box) => box !== selectAll);
}

describe('<JobList />', () => {
  let debug;
  beforeEach(() => {
    UnifiedJobsAPI.read.mockResolvedValue({
      data: { count: 3, results: mockResults },
    });

    UnifiedJobsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    InventorySourcesAPI.readOptions.mockResolvedValue({
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
    });
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<JobList />);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /— job \d/ })).toHaveLength(6)
    );
  });

  test('should select and un-select items', async () => {
    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    const firstRow = screen
      .getByRole('link', { name: '1 — job 1' })
      .closest('tr');
    const checkbox = within(firstRow).getByRole('checkbox');

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
    UnifiedJobsAPI.read.mockResolvedValue({
      data: { count: 6, results: deletableResults },
    });
    AdHocCommandsAPI.destroy = jest.fn().mockResolvedValue({});
    InventoryUpdatesAPI.destroy = jest.fn().mockResolvedValue({});
    JobsAPI.destroy = jest.fn().mockResolvedValue({});
    ProjectUpdatesAPI.destroy = jest.fn().mockResolvedValue({});
    SystemJobsAPI.destroy = jest.fn().mockResolvedValue({});
    WorkflowJobsAPI.destroy = jest.fn().mockResolvedValue({});

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => {
      expect(AdHocCommandsAPI.destroy).toHaveBeenCalledTimes(1);
      expect(InventoryUpdatesAPI.destroy).toHaveBeenCalledTimes(1);
      expect(JobsAPI.destroy).toHaveBeenCalledTimes(1);
      expect(ProjectUpdatesAPI.destroy).toHaveBeenCalledTimes(1);
      expect(SystemJobsAPI.destroy).toHaveBeenCalledTimes(1);
      expect(WorkflowJobsAPI.destroy).toHaveBeenCalledTimes(1);
    });
  });

  test('should query jobs list after delete API requests', async () => {
    UnifiedJobsAPI.read.mockResolvedValue({
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
    });
    ProjectUpdatesAPI.destroy = jest.fn().mockResolvedValue({});
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
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(2)
    );
    expect(UnifiedJobsAPI.read).toHaveBeenLastCalledWith(jobListParams);
  });

  test('should display message about job running status', async () => {
    UnifiedJobsAPI.read.mockResolvedValue({
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
    });

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

    // running jobs cannot be deleted -> the toolbar Delete button is disabled
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('error is shown when job not successfully deleted from api', async () => {
    UnifiedJobsAPI.read.mockResolvedValue({
      data: { count: 6, results: deletableResults },
    });
    JobsAPI.destroy.mockImplementation(() => {
      throw new Error({
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
    await user.click(within(row).getByRole('checkbox'));
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
    UnifiedJobsAPI.read.mockResolvedValue({
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
    });
    AdHocCommandsAPI.cancel = jest.fn().mockResolvedValue({});
    InventoryUpdatesAPI.cancel = jest.fn().mockResolvedValue({});
    JobsAPI.cancel = jest.fn().mockResolvedValue({});
    ProjectUpdatesAPI.cancel = jest.fn().mockResolvedValue({});
    SystemJobsAPI.cancel = jest.fn().mockResolvedValue({});
    WorkflowJobsAPI.cancel = jest.fn().mockResolvedValue({});

    const { user } = renderWithContexts(<JobList />);
    await screen.findByRole('link', { name: '1 — job 1' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Cancel jobs' }));
    // confirm modal -> the danger confirm button
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('#cancel-job-confirm-button'));

    await waitFor(() => {
      expect(ProjectUpdatesAPI.cancel).toHaveBeenCalledWith(1);
      expect(JobsAPI.cancel).toHaveBeenCalledWith(2);
      expect(InventoryUpdatesAPI.cancel).toHaveBeenCalledWith(3);
      expect(WorkflowJobsAPI.cancel).toHaveBeenCalledWith(4);
      expect(SystemJobsAPI.cancel).toHaveBeenCalledWith(5);
      expect(AdHocCommandsAPI.cancel).toHaveBeenCalledWith(6);
    });
  });

  test('error is shown when job not successfully cancelled', async () => {
    JobsAPI.cancel.mockImplementation(() => {
      throw new Error({
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
    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Cancel job' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('#cancel-job-confirm-button'));

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});
