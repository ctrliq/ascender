import React from 'react';
import {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { JobsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobOutput, {
  computeOverscanIndices,
  MAX_SELECTION_OVERSCAN,
} from './JobOutput';
import mockJobData from '../shared/data.job.json';
import mockJobEventsData from './data.job_events.json';

// Under jsdom the PF Tooltip wrapping the OutputToolbar action buttons measures
// 0 size and never renders queryable content, yet its focus/hover-driven entry
// timer fires setVisible *after* the virtualized tree unmounts — tripping
// setupTests' console-error trap with no settle-able tooltip. None of these
// tests assert tooltip content, so render the Tooltip as a passthrough (no
// timers) to keep the delete-flow assertions intact.
jest.mock('@patternfly/react-core', () => {
  const actual = jest.requireActual('@patternfly/react-core');
  return {
    ...actual,
    Tooltip: ({ children }) => children,
  };
});

jest.mock('../../../api');

const applyJobEventMock = (mockJobEvents) => {
  const mockReadEvents = async (jobId, params) => {
    const [...results] = mockJobEvents.results;
    if (params.order_by && params.order_by.includes('-')) {
      results.reverse();
    }
    return {
      data: {
        results,
        count: mockJobEvents.count,
      },
    };
  };
  JobsAPI.readEvents = jest.fn().mockImplementation(mockReadEvents);
  JobsAPI.readChildrenSummary = jest.fn().mockResolvedValue({
    data: {
      1: [0, 100],
    },
  });
  JobsAPI.destroy = jest.fn().mockResolvedValue({});
};

// Wait until JobOutput's initial events load settles (the output area's
// ContentLoading spinner is removed) so all async state updates land in act.
async function waitForLoaded() {
  await waitFor(() =>
    expect(JobsAPI.readEvents.mock.calls.length).toBeGreaterThan(0)
  );
  // Only wait for the spinner when one is actually present, and let a real
  // timeout fail the test rather than swallowing it with .catch().
  if (document.querySelector('[role="progressbar"]')) {
    await waitForElementToBeRemoved(
      () => document.querySelector('[role="progressbar"]'),
      { timeout: 4000 }
    );
  }
}

describe('<JobOutput />', () => {
  const mockJob = mockJobData;

  beforeEach(() => {
    applyJobEventMock(mockJobEventsData);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 100,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should make expected api call for delete', async () => {
    const { user } = renderWithContexts(<JobOutput job={mockJob} />);
    await waitForLoaded();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // DeleteButton opens an AlertModal titled "Delete Job".
    await screen.findByRole('dialog', { name: /Delete Job/ });
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    await waitFor(() => expect(JobsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should show error dialog for failed deletion', async () => {
    JobsAPI.destroy.mockRejectedValue(new Error('delete failed'));
    const { user } = renderWithContexts(<JobOutput job={mockJob} />);
    await waitForLoaded();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    // The failed delete surfaces a "Job Delete Error" AlertModal.
    const errorModal = await screen.findByRole('dialog', {
      name: /Job Delete Error/,
    });
    expect(JobsAPI.destroy).toHaveBeenCalledTimes(1);

    await user.click(
      within(errorModal).getByRole('button', { name: /close/i })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /Job Delete Error/ })
      ).not.toBeInTheDocument()
    );
  });

  test('filter should be enabled after job finishes', async () => {
    renderWithContexts(<JobOutput job={mockJob} />);
    await waitForLoaded();
    expect(screen.getByLabelText('Search text input')).toBeEnabled();
  });

  test('filter should be disabled while job is running', async () => {
    renderWithContexts(<JobOutput job={{ ...mockJob, status: 'running' }} />);
    await waitForLoaded();
    expect(screen.getByLabelText('Search text input')).toBeDisabled();
  });

  test('should throw error', async () => {
    JobsAPI.readEvents = () => Promise.reject(new Error());
    const { container } = renderWithContexts(<JobOutput job={mockJob} />);
    // ContentError renders a PF empty state.
    await waitFor(() =>
      expect(
        container.querySelector('.pf-v6-c-empty-state')
      ).toBeInTheDocument()
    );
  });

  test('should show failed empty output screen', async () => {
    JobsAPI.readEvents.mockResolvedValue({
      data: {
        count: 0,
        next: null,
        previous: null,
        results: [],
      },
    });
    renderWithContexts(<JobOutput job={{ ...mockJob, status: 'failed' }} />);
    // EmptyOutput renders a PF empty state once the (empty) load settles.
    await waitFor(() =>
      expect(document.querySelector('.pf-v6-c-empty-state')).toBeInTheDocument()
    );
  });

  describe('follow mode', () => {
    // Renders a running job (follow mode starts enabled → "Unfollow" button)
    // and returns the scroll container with a scrollable geometry mocked in,
    // scrolled to an established mid-output position.
    async function renderFollowingJob() {
      renderWithContexts(<JobOutput job={{ ...mockJob, status: 'running' }} />);
      await waitForLoaded();
      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();

      const scroller = document.querySelector('.ascender-output-scroll');
      Object.defineProperty(scroller, 'clientHeight', {
        configurable: true,
        value: 200,
      });
      Object.defineProperty(scroller, 'scrollHeight', {
        configurable: true,
        value: 1000,
      });
      scroller.scrollTop = 500;
      fireEvent.scroll(scroller);
      return scroller;
    }

    test('is not disabled by a programmatic upward scroll', async () => {
      const scroller = await renderFollowingJob();

      // An upward scroll with no user gesture in progress — what the
      // virtualizer's corrective ResizeObserver scrolls look like. Follow
      // must survive it (this made the button flicker on live output).
      scroller.scrollTop = 480;
      fireEvent.scroll(scroller);

      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();
    });

    test('is disabled by scrolling up with the wheel', async () => {
      const scroller = await renderFollowingJob();

      fireEvent.wheel(scroller, { deltaY: -50 });

      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();
    });

    // PageUp delivered through the real click→focus path is covered by the
    // test above; this one focuses the container directly (as a keyboard user
    // who tabbed to it would) and sweeps the remaining key bindings.
    test('is disabled by each upward-scrolling key, not by downward ones', async () => {
      const scroller = await renderFollowingJob();
      scroller.focus();

      // Downward-scrolling keys must not touch follow mode.
      fireEvent.keyDown(scroller, { key: 'ArrowDown' });
      fireEvent.keyDown(scroller, { key: 'End' });
      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();

      [
        { key: 'ArrowUp' },
        { key: 'Home' },
        { key: ' ', shiftKey: true },
      ].forEach((keyInit) => {
        // Re-enable follow by returning to the bottom before each key.
        scroller.scrollTop = 800;
        fireEvent.scroll(scroller);
        expect(
          screen.getByRole('button', { name: 'Unfollow' })
        ).toBeInTheDocument();

        fireEvent.keyDown(scroller, keyInit);
        expect(
          screen.getByRole('button', { name: 'Follow' })
        ).toBeInTheDocument();
      });
    });

    test('is disabled by an upward-scrolling key after clicking the output', async () => {
      const scroller = await renderFollowingJob();

      // Clicking the output must focus the scroll container, so that
      // keyboard-scroll keys target it (and not <body>, which would scroll
      // the container in Chromium without ever reaching handleKeyDown).
      fireEvent.mouseDown(scroller);
      expect(scroller).toHaveFocus();
      fireEvent.mouseUp(window);

      fireEvent.keyDown(document.activeElement, { key: 'PageUp' });

      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();
    });

    test('is disabled by an upward scroll while the pointer is held down', async () => {
      const scroller = await renderFollowingJob();

      fireEvent.mouseDown(scroller);
      scroller.scrollTop = 480;
      fireEvent.scroll(scroller);

      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();
    });

    test('is not disabled by an upward scroll after the pointer is released', async () => {
      const scroller = await renderFollowingJob();

      fireEvent.mouseDown(scroller);
      fireEvent.mouseUp(window);
      scroller.scrollTop = 480;
      fireEvent.scroll(scroller);

      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();
    });

    test('is re-enabled by scrolling to the bottom', async () => {
      const scroller = await renderFollowingJob();

      fireEvent.wheel(scroller, { deltaY: -50 });
      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();

      scroller.scrollTop = 800;
      fireEvent.scroll(scroller);

      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();
    });

    test('is re-enabled by reaching a fractional-pixel bottom', async () => {
      const scroller = await renderFollowingJob();

      fireEvent.wheel(scroller, { deltaY: -50 });
      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();

      // Still meaningfully above the bottom: follow must stay off.
      scroller.scrollTop = 780;
      fireEvent.scroll(scroller);
      expect(
        screen.getByRole('button', { name: 'Follow' })
      ).toBeInTheDocument();

      // Browsers report fractional scrollTop against integer scrollHeight/
      // clientHeight, so the true bottom can read as 0 < distance < 1px.
      scroller.scrollTop = 799.5;
      fireEvent.scroll(scroller);

      expect(
        screen.getByRole('button', { name: 'Unfollow' })
      ).toBeInTheDocument();
    });
  });

  // computeOverscanIndices is the pure core of the selection-aware overscan
  // logic. JobOutput drives it through react-virtualized's <List>, which
  // measures 0 height under jsdom and renders no rows — so the List prop /
  // selectionchange wiring has no observable DOM. We exercise the behavior
  // directly through the exported pure function instead.
  describe('selection-aware overscanning', () => {
    test('computeOverscanIndices returns default range when no selection', () => {
      const result = computeOverscanIndices(
        {
          cellCount: 100,
          overscanCellsCount: 20,
          startIndex: 10,
          stopIndex: 30,
        },
        null
      );
      expect(result.overscanStartIndex).toBe(0);
      expect(result.overscanStopIndex).toBe(50);
    });

    test('computeOverscanIndices clamps large selections to MAX_SELECTION_OVERSCAN', () => {
      const result = computeOverscanIndices(
        {
          cellCount: 3000,
          overscanCellsCount: 20,
          startIndex: 1000,
          stopIndex: 1020,
        },
        { start: 0, end: 2000 }
      );
      // viewMid = 1010, halfBudget = 250 → clampedStart=760, clampedEnd=1260
      expect(result.overscanStartIndex).toBe(760);
      expect(result.overscanStopIndex).toBe(1260);
      expect(result.overscanStopIndex - result.overscanStartIndex).toBe(
        MAX_SELECTION_OVERSCAN
      );
    });

    test('computeOverscanIndices preserves small selection when viewport is nearby', () => {
      const result = computeOverscanIndices(
        {
          cellCount: 1000,
          overscanCellsCount: 20,
          startIndex: 100,
          stopIndex: 120,
        },
        { start: 10, end: 30 }
      );
      expect(result.overscanStartIndex).toBe(10);
      expect(result.overscanStopIndex).toBe(140);
      expect(result.overscanStartIndex).toBeLessThanOrEqual(10);
      expect(result.overscanStopIndex).toBeGreaterThanOrEqual(30);
    });

    test('computeOverscanIndices falls back when small selection is far from viewport', () => {
      const result = computeOverscanIndices(
        {
          cellCount: 10000,
          overscanCellsCount: 20,
          startIndex: 5000,
          stopIndex: 5020,
        },
        { start: 10, end: 30 }
      );
      expect(result.overscanStartIndex).toBe(4760);
      expect(result.overscanStopIndex).toBe(5040);
      expect(
        result.overscanStopIndex - result.overscanStartIndex
      ).toBeLessThanOrEqual(MAX_SELECTION_OVERSCAN);
    });
  });
});
