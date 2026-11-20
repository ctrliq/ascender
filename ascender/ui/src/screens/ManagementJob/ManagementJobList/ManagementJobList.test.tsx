import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { SystemJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ManagementJobList from './ManagementJobList';

vi.mock('../../../api/models/SystemJobTemplates');

const managementJobs = {
  data: {
    results: [
      {
        id: 1,
        name: 'Cleanup Activity Stream',
        description: 'Remove activity stream history',
        job_type: 'cleanup_activitystream',
        url: '/api/v2/system_job_templates/1/',
      },
      {
        id: 2,
        name: 'Cleanup Expired OAuth 2 Tokens',
        description: 'Cleanup expired OAuth 2 access and refresh tokens',
        job_type: 'cleanup_tokens',
        url: '/api/v2/system_job_templates/2/',
      },
      {
        id: 3,
        name: 'Cleanup Expired Sessions',
        description: 'Cleans out expired browser sessions',
        job_type: 'cleanup_sessions',
        url: '/api/v2/system_job_templates/3/',
      },
      {
        id: 4,
        name: 'Cleanup Job Details',
        description: 'Remove job history older than X days',
        job_type: 'cleanup_tokens',
        url: '/api/v2/system_job_templates/4/',
      },
    ],
    count: 4,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<ManagementJobList/>', () => {
  beforeEach(() => {
    vi.mocked(SystemJobTemplatesAPI.read).mockResolvedValue(
      managementJobs as unknown as ApiResponse<unknown>
    );
    vi.mocked(SystemJobTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should mount successfully', async () => {
    renderWithContexts(<ManagementJobList />);
    expect(
      await screen.findByText('Cleanup Activity Stream')
    ).toBeInTheDocument();
  });

  test('should have data fetched and render 4 rows', async () => {
    renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');

    const rows = managementJobs.data.results.map((job) => job.name);
    rows.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
    // Verify the list renders exactly one row per management job (excluding the
    // header row) so missing/duplicate rows are caught.
    const dataRows = screen
      .getAllByRole('row')
      .filter((row) => row.id.startsWith('mgmt-jobs-row-'));
    expect(dataRows).toHaveLength(managementJobs.data.results.length);
    expect(SystemJobTemplatesAPI.read).toHaveBeenCalled();
    expect(SystemJobTemplatesAPI.readOptions).toHaveBeenCalled();
  });

  /*
   * The ticks say which jobs a run covers, and running one is a superuser's
   * to do, so the column is there for a superuser and nowhere else: a
   * selection that can act on nothing is an indent and no more.
   */
  test('should start the table at a tick box for a superuser', async () => {
    renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');

    expect(
      screen.getByRole('columnheader', { name: 'Row select' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select all' })
    ).toBeInTheDocument();
  });

  test('should start the table at the name for everybody else', async () => {
    renderWithContexts(<ManagementJobList />, {
      context: { config: { me: { is_superuser: false } } },
    });
    await screen.findByText('Cleanup Activity Stream');

    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim());
    expect(headers[0]).toEqual('Name');
    expect(
      screen.queryByRole('columnheader', { name: 'Row select' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Run' })
    ).not.toBeInTheDocument();
    // Nor a select-all for rows that have no ticks to set.
    expect(
      screen.queryByRole('checkbox', { name: 'Select all' })
    ).not.toBeInTheDocument();
  });

  /* The two that keep history ask how much before anything is started. */
  test('should ask for the days the ticked jobs keep', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 70 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');

    await user.click(
      within(
        screen.getByText('Cleanup Activity Stream').closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      await screen.findByText('Set how many days of data should be retained.')
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Run' })
    );

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(1, {
        extra_vars: { days: 30 },
      })
    );
  });

  /* The others take nothing, so there is nothing to ask. */
  test('should run a job that keeps nothing without asking', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 71 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Expired Sessions');

    await user.click(
      within(
        screen
          .getByText('Cleanup Expired Sessions')
          .closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(3, {})
    );
  });

  /* A partial failure says why each refused job was not started, in the
     api's words, rather than only naming it. */
  test('should give the reason each refused job was not started', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockImplementation(((id: number) =>
      id === 3
        ? Promise.reject(
            Object.assign(new Error('Request failed'), {
              response: { data: { detail: 'Job is already running.' } },
            })
          )
        : Promise.resolve({
            data: { id: 72 },
          })) as unknown as typeof SystemJobTemplatesAPI.launch);
    const { user } = renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Expired Sessions');

    await user.click(
      within(
        screen
          .getByText('Cleanup Expired Sessions')
          .closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(
      within(
        screen.getByText('Cleanup Job Details').closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Cleanup Expired Sessions: Job is already running.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Cleanup Job Details/)
    ).not.toBeInTheDocument();
  });

  test('should have nothing to run until something is ticked', async () => {
    const { user } = renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');

    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toBeDisabled();
    await user.hover(run.parentElement!);
    expect(
      await screen.findByText('Select Cleanup Jobs to Run')
    ).toBeInTheDocument();
  });

  test('should throw content error', async () => {
    vi.mocked(SystemJobTemplatesAPI.read).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'GET',
            url: '/api/v2/system_job_templates',
          },
          data: 'An error occurred',
        },
      })
    );
    renderWithContexts(<ManagementJobList />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should not render add button', async () => {
    vi.mocked(SystemJobTemplatesAPI.read).mockResolvedValue(
      managementJobs as unknown as ApiResponse<unknown>
    );
    vi.mocked(SystemJobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: false } },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.readOptions>);
    renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Add/i })
      ).not.toBeInTheDocument()
    );
  });
});
