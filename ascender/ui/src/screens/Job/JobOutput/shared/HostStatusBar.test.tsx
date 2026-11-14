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
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.querySelectorAll(':scope > div > div')).toHaveLength(5);
  });

  test('segments keep their styling props out of the DOM', () => {
    // colour and count drive the styling only, through the style attribute;
    // as plain props they would land on the div, and count is not one
    const { container } = renderWithContexts(
      <HostStatusBar counts={mockCounts} />
    );
    const segments = (container.firstChild as HTMLElement).querySelectorAll(
      ':scope > div > div'
    );
    expect(segments).toHaveLength(5);
    segments.forEach((segment) => {
      expect(segment).not.toHaveAttribute('count');
      expect(segment).not.toHaveAttribute('color');
    });
  });

  /*
   * A command, a sync and a cleanup job end without a play, so the bar has no
   * host to report and says what the run came to instead.
   */
  describe('where the run has no hosts', () => {
    const segmentOf = (container: HTMLElement) =>
      (container.firstChild as HTMLElement).querySelector(
        ':scope > div > div'
      ) as HTMLElement;

    test('should show a successful run in the colour of a host that was ok', () => {
      const { container } = renderWithContexts(
        <HostStatusBar counts={{}} jobStatus="successful" />
      );

      expect(segmentOf(container)).toHaveStyle({ backgroundColor: '#12a66f' });
    });

    test('should show a failed run in the colour of a host that failed', () => {
      const { container } = renderWithContexts(
        <HostStatusBar counts={{}} jobStatus="failed" />
      );

      expect(segmentOf(container)).toHaveStyle({ backgroundColor: '#f04438' });
    });

    test('should say what the run came to', async () => {
      const { user, container } = renderWithContexts(
        <HostStatusBar counts={{}} jobStatus="successful" />
      );

      await user.hover(segmentOf(container));

      expect(await screen.findByText('Successful')).toBeInTheDocument();
    });

    test('should say nothing of a run still going', () => {
      const { container } = renderWithContexts(
        <HostStatusBar counts={{}} jobStatus="running" />
      );

      // Nothing has happened yet, so the bar keeps the colour it had. The
      // style attribute is read directly, since a computed inherit is
      // whatever the wrapper resolves to.
      expect(segmentOf(container).getAttribute('style')).toContain(
        'background-color: inherit'
      );
    });
  });

  test('tooltips should display host status and count', async () => {
    const { user, container } = renderWithContexts(
      <HostStatusBar counts={mockCounts} />
    );
    const wrapper = container.firstChild as HTMLElement;
    const segments = wrapper.querySelectorAll(':scope > div > div');
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
      await user.hover(segments[i]!);
      // eslint-disable-next-line no-await-in-loop
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent(
        `${expectedContent[i]!.label}${expectedContent[i]!.count}`
      );
      // eslint-disable-next-line no-await-in-loop
      await user.unhover(segments[i]!);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      );
    }
  });

  test('empty host counts should display tooltip and one bar segment', async () => {
    const { user, container } = renderWithContexts(<HostStatusBar />);
    const wrapper = container.firstChild as HTMLElement;
    const segments = wrapper.querySelectorAll(':scope > div > div');
    expect(segments).toHaveLength(1);

    await user.hover(segments[0]!);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Host status information for this job is unavailable.'
    );
  });
});
