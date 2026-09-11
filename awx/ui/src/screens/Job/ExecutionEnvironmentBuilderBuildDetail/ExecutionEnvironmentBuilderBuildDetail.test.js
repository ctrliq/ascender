import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { ExecutionEnvironmentBuilderBuildsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentBuilderBuildDetail from './ExecutionEnvironmentBuilderBuildDetail';

jest.mock('../../../api');

const mockJob = {
  id: 101,
  name: 'Test Builder Build',
  type: 'execution_environment_builder_build',
  url: '/api/v2/builds/101/',
  status: 'successful',
  started: '2024-03-01T12:00:00.000000Z',
  finished: '2024-03-01T12:05:00.000000Z',
  job_explanation: '',
  summary_fields: {
    execution_environment_builder: {
      id: 10,
      name: 'My Builder',
      image: 'quay.io/my-org/my-ee',
      tag: 'latest',
      summary_fields: {
        credential: {
          id: 5,
          name: 'Registry Cred',
          description: '',
          kind: 'registry',
          credential_type_id: 20,
        },
      },
    },
    execution_environment: {
      id: 1,
      name: 'Default EE',
      description: '',
      image: 'quay.io/ansible/awx-ee',
    },
    created_by: {
      id: 1,
      username: 'admin',
    },
    user_capabilities: {
      start: true,
      delete: true,
    },
  },
};

describe('<ExecutionEnvironmentBuilderBuildDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display job details', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    assertDetail('Job ID', '101');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
    assertDetail('Environment Name', 'My Builder');
    assertDetail('Image', 'quay.io/my-org/my-ee');
    assertDetail('Tag', 'latest');
  });

  test('should not display finished date when job has not finished', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail
        job={{ ...mockJob, finished: null }}
      />
    );
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  });

  test('should display credential chip when credential exists', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(screen.getByText('Credential')).toBeInTheDocument();
    expect(screen.getByText('Registry Cred')).toBeInTheDocument();
  });

  test('should not display credential when builder has no credential', () => {
    const jobWithoutCred = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        execution_environment_builder: {
          ...mockJob.summary_fields.execution_environment_builder,
          summary_fields: {},
        },
      },
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobWithoutCred} />
    );
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
  });

  test('should show Relaunch button when user can start', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(
      screen.getByRole('button', { name: 'Relaunch' })
    ).toBeInTheDocument();
  });

  test('should hide Relaunch button when user cannot start', () => {
    const jobNoStart = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: false, delete: true },
      },
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobNoStart} />
    );
    expect(
      screen.queryByRole('button', { name: 'Relaunch' })
    ).not.toBeInTheDocument();
  });

  test('should show Delete button when job is completed and user can delete', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should hide Delete button when user cannot delete', () => {
    const jobNoDelete = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: true, delete: false },
      },
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobNoDelete} />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should hide Delete button when job is running', () => {
    const runningJob = { ...mockJob, status: 'running' };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningJob} />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should show Cancel button when job is running and user can start', () => {
    const runningJob = { ...mockJob, status: 'running' };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningJob} />
    );
    expect(
      screen.getByRole('button', { name: 'Cancel Build' })
    ).toBeInTheDocument();
  });

  test('should hide Cancel button when job is not running', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel Build' })
    ).not.toBeInTheDocument();
  });

  test('should hide Cancel button when user cannot start', () => {
    const runningNoStart = {
      ...mockJob,
      status: 'pending',
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: false, delete: true },
      },
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningNoStart} />
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel Build' })
    ).not.toBeInTheDocument();
  });

  test('should call API destroy and navigate to /jobs on successful delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/101/details'],
    });
    ExecutionEnvironmentBuilderBuildsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />,
      { context: { router: { history } } }
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));

    await waitFor(() =>
      expect(ExecutionEnvironmentBuilderBuildsAPI.destroy).toHaveBeenCalledWith(
        101
      )
    );
    await waitFor(() => expect(history.location.pathname).toBe('/jobs'));
  });

  test('should display error modal when delete fails', async () => {
    ExecutionEnvironmentBuilderBuildsAPI.destroy.mockRejectedValue(
      new Error('Delete failed')
    );
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));

    expect(
      await screen.findByText('Build Delete Error')
    ).toBeInTheDocument();
  });

  test('should display job_explanation in status when provided', () => {
    const jobWithExplanation = {
      ...mockJob,
      status: 'failed',
      job_explanation: 'Build timed out',
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobWithExplanation} />
    );
    expect(screen.getByText('Build timed out')).toBeInTheDocument();
  });
});
