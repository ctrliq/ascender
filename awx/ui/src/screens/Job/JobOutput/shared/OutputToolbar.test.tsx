import type { AnyJob } from 'types/api';
import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { OutputToolbar } from '.';
import mockJobData from '../../shared/data.job.json';

const mockJob = mockJobData as unknown as AnyJob;

describe('<OutputToolbar />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
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
        job={{ ...mockJob, type: 'system_job' }}
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
          ...mockJob,
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
          ...mockJob,
          elapsed: '274265.000',
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    const elapsed = screen.getByLabelText('Elapsed Time');
    expect(within(elapsed).getByText('76:11:05')).toBeInTheDocument();
  });

  // The two counts that mean something went wrong used to be given a `color`
  // prop, which nothing read: the rule behind it was invalid CSS and the
  // browser dropped it, so both badges rendered in PatternFly's default. They
  // carry a class now, and this is what says so.
  test('marks the unreachable and failed counts as the failures they are', () => {
    const { container } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    const unreachable = container.querySelector(
      '.awx-output-toolbar__badge--unreachable'
    );
    const failed = container.querySelector(
      '.awx-output-toolbar__badge--failed'
    );

    expect(unreachable).toHaveTextContent('1');
    expect(failed).toHaveTextContent('2');
    // and the counts that mean nothing went wrong are left alone
    expect(
      container.querySelectorAll('.awx-output-toolbar__badge').length
    ).toBeGreaterThan(2);
  });

  test('should hide relaunch button based on user capabilities', () => {
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
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
          ...mockJob,
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
          ...mockJob,
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
          ...mockJob,
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
