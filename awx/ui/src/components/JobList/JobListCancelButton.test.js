import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import JobListCancelButton from './JobListCancelButton';

function getCancelButton() {
  // The non-kebab control has a stable id; query it directly so the lookup is
  // not affected by the aria-hidden PF applies to the page while a modal is
  // open/closing.
  return document.getElementById('jobs-list-cancel-button');
}

describe('<JobListCancelButton />', () => {
  test('should be disabled when no rows are selected', async () => {
    const { user } = renderWithContexts(<JobListCancelButton jobsToCancel={[]} />);
    expect(getCancelButton()).toBeDisabled();

    // Tooltip content is rendered on hover; asserts the
    // "Select a job to cancel" tooltip text.
    await user.hover(getCancelButton().closest('div'));
    expect(
      await screen.findByText('Select a job to cancel')
    ).toBeInTheDocument();
  });

  test('should be disabled when user does not have permissions to cancel selected job', () => {
    renderWithContexts(
      <JobListCancelButton
        jobsToCancel={[
          {
            id: 1,
            name: 'some job',
            summary_fields: {
              user_capabilities: {
                delete: false,
                start: false,
              },
            },
            status: 'running',
          },
        ]}
      />
    );
    expect(getCancelButton()).toBeDisabled();
  });

  test('should be disabled when selected job is not running', () => {
    renderWithContexts(
      <JobListCancelButton
        jobsToCancel={[
          {
            id: 1,
            name: 'some job',
            summary_fields: {
              user_capabilities: {
                delete: false,
                start: false,
              },
            },
            status: 'successful',
          },
        ]}
      />
    );
    expect(getCancelButton()).toBeDisabled();
  });

  test('should be enabled when user does have permission to cancel selected job', () => {
    renderWithContexts(
      <JobListCancelButton
        jobsToCancel={[
          {
            id: 1,
            name: 'some job',
            summary_fields: {
              user_capabilities: {
                delete: true,
                start: true,
              },
            },
            status: 'running',
          },
        ]}
      />
    );
    expect(getCancelButton()).toBeEnabled();
  });

  test('modal functions as expected', async () => {
    const onCancel = jest.fn();
    const { user } = renderWithContexts(
      <JobListCancelButton
        jobsToCancel={[
          {
            id: 1,
            name: 'some job',
            summary_fields: {
              user_capabilities: {
                delete: true,
                start: true,
              },
            },
            status: 'running',
          },
        ]}
        onCancel={onCancel}
      />
    );

    // no modal initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // open modal, then click Return -> onCancel not called, modal closes
    await user.click(getCancelButton());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(onCancel).toHaveBeenCalledTimes(0);

    // open modal again, click the confirm (danger) button -> onCancel called
    await user.click(getCancelButton());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // the confirm button shares the "Cancel job" text but lives in the modal
    const dialog = screen.getByRole('dialog');
    const confirmButton = dialog.querySelector('#cancel-job-confirm-button');
    await user.click(confirmButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
