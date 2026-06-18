import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { SystemJobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ManagementJobList from './ManagementJobList';

jest.mock('../../../api/models/SystemJobTemplates');

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
    SystemJobTemplatesAPI.read.mockResolvedValue(managementJobs);
    SystemJobTemplatesAPI.readOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  test('should throw content error', async () => {
    SystemJobTemplatesAPI.read.mockRejectedValue(
      new Error({
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
    SystemJobTemplatesAPI.read.mockResolvedValue(managementJobs);
    SystemJobTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    renderWithContexts(<ManagementJobList />);
    await screen.findByText('Cleanup Activity Stream');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Add/i })
      ).not.toBeInTheDocument()
    );
  });
});
