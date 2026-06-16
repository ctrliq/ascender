import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { HostStatusBar } from '.';

describe('<HostStatusBar />', () => {
  const mockCounts = {
    ok: 5,
    skipped: 1,
  };

  test('should render five bar segments', () => {
    const { container } = renderWithContexts(
      <HostStatusBar counts={mockCounts} />
    );
    // BarWrapper holds one BarSegment div per host status (5 total).
    const wrapper = container.firstChild;
    expect(wrapper.querySelectorAll(':scope > div')).toHaveLength(5);
  });

  test('tooltips should display host status and count', async () => {
    const { user, container } = renderWithContexts(
      <HostStatusBar counts={mockCounts} />
    );
    const wrapper = container.firstChild;
    const segments = wrapper.querySelectorAll(':scope > div');
    const expectedContent = [
      { label: 'OK', count: 5 },
      { label: 'Skipped', count: 1 },
      { label: 'Changed', count: 0 },
      { label: 'Failed', count: 0 },
      { label: 'Unreachable', count: 0 },
    ];

    // PF Tooltip content only mounts to the DOM on hover.
    for (let i = 0; i < segments.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await user.hover(segments[i]);
      // eslint-disable-next-line no-await-in-loop
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent(
        `${expectedContent[i].label}${expectedContent[i].count}`
      );
      // eslint-disable-next-line no-await-in-loop
      await user.unhover(segments[i]);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      );
    }
  });

  test('empty host counts should display tooltip and one bar segment', async () => {
    const { user, container } = renderWithContexts(<HostStatusBar />);
    const wrapper = container.firstChild;
    const segments = wrapper.querySelectorAll(':scope > div');
    expect(segments).toHaveLength(1);

    await user.hover(segments[0]);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Host status information for this job is unavailable.'
    );
  });
});
