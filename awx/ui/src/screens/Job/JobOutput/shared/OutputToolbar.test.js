import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { OutputToolbar } from '.';
import mockJobData from '../../shared/data.job.json';

describe('<OutputToolbar />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          host_status_counts: {
            dark: 1,
            failures: 2,
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.getByLabelText('Elapsed Time')).toBeInTheDocument();
  });

  test('should hide badge counts based on job type', () => {
    renderWithContexts(
      <OutputToolbar
        job={{ ...mockJobData, type: 'system_job' }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.queryByLabelText('Play Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Host Count')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Unreachable Host Count')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Failed Host Count')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Elapsed Time')).toBeInTheDocument();
  });

  test('should hide badge if count is equal to zero', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          host_status_counts: {},
          playbook_counts: {},
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    expect(screen.queryByLabelText('Play Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Host Count')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Unreachable Host Count')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Failed Host Count')
    ).not.toBeInTheDocument();
  });

  test('should display elapsed time as HH:MM:SS', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          elapsed: 274265,
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    const elapsed = screen.getByLabelText('Elapsed Time');
    expect(within(elapsed).getByText('76:11:05')).toBeInTheDocument();
  });

  test('should hide relaunch button based on user capabilities', () => {
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Relaunch' })
    ).toBeInTheDocument();
    unmount();

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          summary_fields: {
            user_capabilities: {
              start: false,
            },
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Relaunch' })
    ).not.toBeInTheDocument();
  });

  test('should hide delete button based on user capabilities', () => {
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    unmount();

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJobData,
          summary_fields: {
            user_capabilities: {
              delete: false,
            },
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });
});
