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

jest.mock('../../api');

describe('<JobCancelButton/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render properly', () => {
    renderWithContexts(
      <JobCancelButton
        job={{ id: 1, type: 'project_update' }}
        errorTitle="Error"
        title="Title"
      />
    );
    // default (non-icon) button renders the "Cancel Job" text, no MinusCircleIcon
    expect(
      screen.getByRole('button', { name: 'Title' })
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel Job')).toBeInTheDocument();
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
      screen.getByRole('button', { name: 'Confirm cancel job' })
    );
    await waitFor(() =>
      expect(ProjectUpdatesAPI.cancel).toHaveBeenCalledWith(1)
    );
  });

  test('should throw error', async () => {
    ProjectUpdatesAPI.cancel.mockRejectedValue(
      new Error({
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
        job={{ id: 'a', type: 'project_update' }}
        errorTitle="Error"
        title="Title"
        showIconButton
      />
    );
    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm cancel job' })
    );

    // error modal (errorTitle="Error", with ErrorDetail's "Details" expandable)
    // replaces the confirm modal whose "Confirm cancel job" button is now gone
    expect(await screen.findByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm cancel job' })
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
      screen.getByRole('button', { name: 'Confirm cancel job' })
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
      screen.getByRole('button', { name: 'Confirm cancel job' })
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
      screen.getByRole('button', { name: 'Confirm cancel job' })
    );
    await waitFor(() =>
      expect(WorkflowJobsAPI.cancel).toHaveBeenCalledWith(1)
    );
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
      screen.getByRole('button', { name: 'Confirm cancel job' })
    );
    await waitFor(() => expect(JobsAPI.cancel).toHaveBeenCalledWith(1));
  });
});
