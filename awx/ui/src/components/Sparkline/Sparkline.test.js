import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Sparkline from './Sparkline';

describe('Sparkline', () => {
  test('renders the expected content', () => {
    const { container } = renderWithContexts(<Sparkline />);
    // No jobs => no icons/links rendered.
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  test('renders an icon with tooltips and links for each job', () => {
    const jobs = [
      {
        id: 1,
        status: 'successful',
        finished: '2019-08-08T15:27:57.320120Z',
      },
      {
        id: 2,
        status: 'failed',
        finished: '2019-08-09T15:27:57.320120Z',
      },
    ];
    const { container } = renderWithContexts(<Sparkline jobs={jobs} />);
    // One Link per job, addressed by its accessible name. Each Link wraps a
    // Tooltip + StatusIcon (the StatusIcon div carries aria-label={status}).
    const link1 = screen.getByRole('link', { name: 'View job 1' });
    const link2 = screen.getByRole('link', { name: 'View job 2' });
    expect(link1).toHaveAttribute('href', '/jobs/undefined/1');
    expect(link2).toHaveAttribute('href', '/jobs/undefined/2');
    expect(link1.querySelector('[data-job-status="successful"]')).toBeInTheDocument();
    expect(link2.querySelector('[data-job-status="failed"]')).toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
