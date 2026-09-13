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
import type { LaunchButtonRenderProps } from './LaunchButton';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import LaunchButton from './LaunchButton';

vi.mock('../../api');

describe('LaunchButton', () => {
  // The render-prop children expose a plain button; give it an accessible name
  // so it can be driven by role.
  const launchButton = ({ handleLaunch }: LaunchButtonRenderProps) => (
    <button type="submit" aria-label="launch" onClick={() => handleLaunch()} />
  );

  const relaunchButton = ({ handleRelaunch }: LaunchButtonRenderProps) => (
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
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.readCredentials).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readCredentials>);
  });

  afterEach(() => vi.clearAllMocks());

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

    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
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
    vi.mocked(WorkflowJobTemplatesAPI.readLaunch).mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readLaunch>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    vi.mocked(WorkflowJobTemplatesAPI.launch).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.launch>);
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
    vi.mocked(JobsAPI.readRelaunch).mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    } as unknown as ResponseOf<typeof JobsAPI.readRelaunch>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    vi.mocked(JobsAPI.relaunch).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof JobsAPI.relaunch>);
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
    await waitFor(() => expect(JobsAPI.relaunch).toHaveBeenCalledWith(1, {}));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/jobs/9000/output')
    );
  });

  test('should relaunch workflow job correctly', async () => {
    vi.mocked(WorkflowJobsAPI.readRelaunch).mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readRelaunch>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    vi.mocked(WorkflowJobsAPI.relaunch).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.relaunch>);
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
    vi.mocked(ProjectsAPI.readLaunchUpdate).mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.readLaunchUpdate>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    vi.mocked(ProjectsAPI.launchUpdate).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.launchUpdate>);
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
    vi.mocked(InventorySourcesAPI.readLaunchUpdate).mockResolvedValue({
      data: {
        can_start_without_user_input: true,
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readLaunchUpdate>);
    const history = createMemoryHistory({
      initialEntries: ['/jobs/9000'],
    });
    vi.mocked(InventorySourcesAPI.launchUpdate).mockResolvedValue({
      data: {
        id: 9000,
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.launchUpdate>);
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
    vi.mocked(JobTemplatesAPI.launch).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
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
