import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import {
  InventorySourcesAPI,
  JobsAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import LaunchButton from './LaunchButton';

jest.mock('../../api');

describe('LaunchButton', () => {
  // The render-prop children expose a plain button; give it an accessible name
  // so it can be driven by role.
  const launchButton = ({ handleLaunch }) => (
    <button type="submit" aria-label="launch" onClick={() => handleLaunch()} />
  );

  const relaunchButton = ({ handleRelaunch }) => (
    <button
      type="submit"
      aria-label="relaunch"
      onClick={() => handleRelaunch()}
    />
  );

  const resource = {
    id: 1,
    type: 'job_template',
  };

  beforeEach(() => {
    JobTemplatesAPI.readLaunch.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
        ask_inventory_on_launch: false,
        ask_variables_on_launch: false,
        ask_limit_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_execution_environment_on_launch: false,
        ask_labels_on_launch: false,
        ask_forks_on_launch: false,
        ask_job_slice_count_on_launch: false,
        ask_timeout_on_launch: false,
        ask_instance_groups_on_launch: false,
        survey_enabled: false,
        variables_needed_to_start: [],
      },
    });
    JobTemplatesAPI.readCredentials.mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('renders the expected content', () => {
    renderWithContexts(
      <LaunchButton resource={resource}>{launchButton}</LaunchButton>
    );
    expect(screen.getByRole('button', { name: 'launch' })).toBeInTheDocument();
  });

  test('should redirect to job after successful launch', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });

    JobTemplatesAPI.launch.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton resource={resource}>{launchButton}</LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'launch' }));
    expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledWith(1, {})
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should launch the correct job type', async () => {
    WorkflowJobTemplatesAPI.readLaunch.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    });
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    WorkflowJobTemplatesAPI.launch.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton
        resource={{
          id: 1,
          type: 'workflow_job_template',
        }}
      >
        {launchButton}
      </LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'launch' }));
    expect(WorkflowJobTemplatesAPI.readLaunch).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.launch).toHaveBeenCalledWith(1, {})
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should relaunch job correctly', async () => {
    JobsAPI.readRelaunch.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    });
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    JobsAPI.relaunch.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton
        resource={{
          id: 1,
          type: 'job',
        }}
      >
        {relaunchButton}
      </LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'relaunch' }));
    expect(JobsAPI.readRelaunch).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(JobsAPI.relaunch).toHaveBeenCalledWith(1, {})
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should relaunch workflow job correctly', async () => {
    WorkflowJobsAPI.readRelaunch.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    });
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    WorkflowJobsAPI.relaunch.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton
        resource={{
          id: 1,
          type: 'workflow_job',
        }}
      >
        {relaunchButton}
      </LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'relaunch' }));
    expect(WorkflowJobsAPI.readRelaunch).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(WorkflowJobsAPI.relaunch).toHaveBeenCalledWith(1, {})
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should relaunch project sync correctly', async () => {
    ProjectsAPI.readLaunchUpdate.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    });
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    ProjectsAPI.launchUpdate.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton
        resource={{
          id: 1,
          project: 5,
          type: 'project_update',
        }}
      >
        {relaunchButton}
      </LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'relaunch' }));
    expect(ProjectsAPI.readLaunchUpdate).toHaveBeenCalledWith(5);
    await waitFor(() =>
      expect(ProjectsAPI.launchUpdate).toHaveBeenCalledWith(5)
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should relaunch inventory sync correctly', async () => {
    InventorySourcesAPI.readLaunchUpdate.mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    });
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    InventorySourcesAPI.launchUpdate.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <LaunchButton
        resource={{
          id: 1,
          inventory_source: 5,
          type: 'inventory_update',
        }}
      >
        {relaunchButton}
      </LaunchButton>,
      {
        context: {
          router: { history },
        },
      }
    );
    await user.click(screen.getByRole('button', { name: 'relaunch' }));
    expect(InventorySourcesAPI.readLaunchUpdate).toHaveBeenCalledWith(5);
    await waitFor(() =>
      expect(InventorySourcesAPI.launchUpdate).toHaveBeenCalledWith(5)
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('displays error modal after unsuccessful launch', async () => {
    JobTemplatesAPI.launch.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/job_templates/1/launch',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <LaunchButton resource={resource}>{launchButton}</LaunchButton>
    );
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'launch' }));

    // AlertModal renders its title as the dialog heading once the launch fails
    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
