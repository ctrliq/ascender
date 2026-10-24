import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  ProjectUpdatesAPI,
  AdHocCommandsAPI,
  SystemJobsAPI,
  WorkflowJobsAPI,
  JobsAPI,
} from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import JobCancelButton from './JobCancelButton';

vi.mock('../../api');

describe('<JobCancelButton/>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render properly', () => {
    renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'project_update' }}
        errorTitle="Error"
        title="Title"
      />
    );
    // the default (non-icon) button names the kind of run, no MinusCircleIcon
    expect(screen.getByRole('button', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Cancel Project Sync')).toBeInTheDocument();
    expect(document.querySelector('.pf-v6-c-button svg')).toBeNull();
  });

  test('should render icon button', () => {
    renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'project_update' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    // the icon variant renders the MinusCircleIcon (an svg) inside the button
    const button = screen.getByRole('button', { name: 'Title' });
    expect(button.querySelector('svg')).not.toBeNull();
  });

  test('should call api', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'project_update' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );
    await waitFor(() =>
      expect(ProjectUpdatesAPI.cancel).toHaveBeenCalledWith(1)
    );
  });

  test('should throw error', async () => {
    vi.mocked(ProjectUpdatesAPI.cancel).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/projectupdates',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'project_update' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );

    // error modal (errorTitle="Error", with ErrorDetail's "Details" expandable)
    // replaces the confirm modal whose "Confirm Cancellation" button is now gone
    expect(await screen.findByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm Cancellation' })
    ).not.toBeInTheDocument();
  });

  test('should cancel Ad Hoc Command job', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'ad_hoc_command' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );
    await waitFor(() =>
      expect(AdHocCommandsAPI.cancel).toHaveBeenCalledWith(1)
    );
  });

  test('should cancel system job', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'system_job' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );
    await waitFor(() => expect(SystemJobsAPI.cancel).toHaveBeenCalledWith(1));
  });

  test('should cancel workflow job', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'workflow_job' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );
    await waitFor(() => expect(WorkflowJobsAPI.cancel).toHaveBeenCalledWith(1));
  });

  test('should cancel job with unknown type via JobsAPI', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'hakunah_matata' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );
    await waitFor(() => expect(JobsAPI.cancel).toHaveBeenCalledWith(1));
  });

  /*
   * Without wording of its own from the caller, the button, the question and
   * the error all name the kind of run, the way Relaunch and Delete do.
   */
  test('names the kind of run it cancels', async () => {
    vi.mocked(ProjectUpdatesAPI.cancel).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: { method: 'post', url: '/api/v2/project_updates/1/cancel' },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <JobCancelButton job={{ id: 1, type: 'project_update' }} title="Title" />
    );
    expect(screen.getByText('Cancel Project Sync')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(
      await screen.findByText(
        'Are you sure you want to cancel this project sync?'
      )
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Cancellation' })
    );

    expect(
      await screen.findByText('Project Sync Cancel Error')
    ).toBeInTheDocument();
  });

  test('keeps the wording a caller gives it', async () => {
    const { user } = renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'workflow_job' }}
        title="Title"
        buttonText="Cancel Workflow"
        cancelationMessage="This will cancel all subsequent nodes."
      />
    );
    expect(screen.getByText('Cancel Workflow')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(
      await screen.findByText('This will cancel all subsequent nodes.')
    ).toBeInTheDocument();
  });
});
