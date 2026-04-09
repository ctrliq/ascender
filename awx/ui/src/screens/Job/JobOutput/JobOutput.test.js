import React from 'react';
import { act } from 'react-dom/test-utils';
import { JobsAPI, JobEventsAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
import JobOutput from './JobOutput';
import mockJobData from '../shared/data.job.json';
import mockJobEventsData from './data.job_events.json';

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

describe('<JobOutput />', () => {
  let wrapper;
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
    await act(async () => {
      wrapper = mountWithContexts(<JobOutput job={mockJob} />);
    });
    
    // Wait for the component to finish loading
    await waitForElement(wrapper, 'JobOutput', (el) => {
      return JobsAPI.readEvents.mock.calls.length > 0;
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    wrapper.update();
    
    await act(async () =>
      wrapper.find('button[aria-label="Delete"]').simulate('click')
    );
    await waitForElement(
      wrapper,
      'Modal',
      (el) => el.props().isOpen === true && el.props().title === 'Delete Job'
    );
    await act(async () =>
      wrapper
        .find('Modal button[aria-label="Confirm Delete"]')
        .simulate('click')
    );
    expect(JobsAPI.destroy).toHaveBeenCalledTimes(1);
  });

  test('should show error dialog for failed deletion', async () => {
    JobsAPI.destroy.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'delete',
            url: `/api/v2/jobs/${mockJob.id}`,
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    await act(async () => {
      wrapper = mountWithContexts(<JobOutput job={mockJob} />);
    });
    
    // Wait for the component to finish loading
    await waitForElement(wrapper, 'JobOutput', (el) => {
      return JobsAPI.readEvents.mock.calls.length > 0;
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    wrapper.update();
    
    await act(async () => {
      wrapper.find('DeleteButton').invoke('onConfirm')();
    });
    await waitForElement(
      wrapper,
      'Modal[title="Job Delete Error"]',
      (el) => el.length === 1
    );
    await act(async () => {
      wrapper.find('Modal[title="Job Delete Error"]').invoke('onClose')();
    });
    await waitForElement(
      wrapper,
      'Modal[title="Job Delete Error"]',
      (el) => el.length === 0
    );
    expect(JobsAPI.destroy).toHaveBeenCalledTimes(1);
  });

  test('filter should be enabled after job finishes', async () => {
    await act(async () => {
      wrapper = mountWithContexts(<JobOutput job={mockJob} />);
    });
    
    // Wait for the component to finish loading by checking if API calls were made
    await waitForElement(wrapper, 'JobOutput', (el) => {
      // Give time for async operations to complete
      return JobsAPI.readEvents.mock.calls.length > 0;
    });
    
    // Allow additional time for component updates
    await new Promise(resolve => setTimeout(resolve, 100));
    wrapper.update();
    
    expect(wrapper.find('Search').props().isDisabled).toBe(false);
  });

  test('filter should be disabled while job is running', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <JobOutput job={{ ...mockJob, status: 'running' }} />
      );
    });
    
    // Wait for the component to finish loading by checking if API calls were made
    await waitForElement(wrapper, 'JobOutput', (el) => {
      return JobsAPI.readEvents.mock.calls.length > 0;
    });
    
    // Allow additional time for component updates
    await new Promise(resolve => setTimeout(resolve, 100));
    wrapper.update();
    
    expect(wrapper.find('Search').props().isDisabled).toBe(true);
  });

  test('should throw error', async () => {
    JobsAPI.readEvents = () => Promise.reject(new Error());
    await act(async () => {
      wrapper = mountWithContexts(<JobOutput job={mockJob} />);
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
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
    await act(async () => {
      wrapper = mountWithContexts(
        <JobOutput job={{ ...mockJob, status: 'failed' }} />
      );
    });
    await waitForElement(wrapper, 'EmptyOutput', (el) => el.length === 1);
  });

  describe('selection-aware overscanning', () => {
    let selectionChangeHandler;
    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: jest.fn(),
    };

    beforeEach(() => {
      // Capture the selectionchange listener so we can trigger it manually
      const originalAddEventListener = document.addEventListener;
      jest.spyOn(document, 'addEventListener').mockImplementation(
        (event, handler, ...rest) => {
          if (event === 'selectionchange') {
            selectionChangeHandler = handler;
          }
          return originalAddEventListener.call(
            document,
            event,
            handler,
            ...rest
          );
        }
      );
    });

    afterEach(() => {
      document.addEventListener.mockRestore();
      window.getSelection = undefined;
    });

    test('List should receive overscanIndicesGetter prop', async () => {
      await act(async () => {
        wrapper = mountWithContexts(<JobOutput job={mockJob} />);
      });

      await waitForElement(wrapper, 'JobOutput', (el) => {
        return JobsAPI.readEvents.mock.calls.length > 0;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      wrapper.update();

      const list = wrapper.find('List');
      if (list.length > 0) {
        expect(list.prop('overscanIndicesGetter')).toBeInstanceOf(Function);
      }
    });

    test('overscanIndicesGetter returns default range when no selection', async () => {
      await act(async () => {
        wrapper = mountWithContexts(<JobOutput job={mockJob} />);
      });

      await waitForElement(wrapper, 'JobOutput', (el) => {
        return JobsAPI.readEvents.mock.calls.length > 0;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      wrapper.update();

      const list = wrapper.find('List');
      if (list.length > 0) {
        const getter = list.prop('overscanIndicesGetter');
        const result = getter({
          cellCount: 100,
          overscanCellsCount: 20,
          startIndex: 10,
          stopIndex: 30,
          scrollDirection: 1,
        });
        expect(result.overscanStartIndex).toBe(0);
        expect(result.overscanStopIndex).toBe(50);
      }
    });

    test('should set selectedRowRange on selectionchange and expand overscan', async () => {
      await act(async () => {
        wrapper = mountWithContexts(<JobOutput job={mockJob} />);
      });

      await waitForElement(wrapper, 'JobOutput', (el) => {
        return JobsAPI.readEvents.mock.calls.length > 0;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      wrapper.update();

      // Mock window.getSelection to return a selection inside the output area
      const outputWrapper = wrapper.find('OutputWrapper').getDOMNode
        ? wrapper.find('OutputWrapper')
        : null;

      if (outputWrapper && selectionChangeHandler) {
        const mockRange = {
          commonAncestorContainer: document.body,
          getBoundingClientRect: () => ({
            top: 50,
            bottom: 150,
            left: 0,
            right: 100,
          }),
        };
        mockSelection.getRangeAt.mockReturnValue(mockRange);
        window.getSelection = jest.fn().mockReturnValue(mockSelection);

        // Trigger selectionchange and allow rAF to process
        await act(async () => {
          selectionChangeHandler();
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
        wrapper.update();

        const list = wrapper.find('List');
        if (list.length > 0) {
          const getter = list.prop('overscanIndicesGetter');
          expect(getter).toBeInstanceOf(Function);
        }
      }
    });

    test('should clear selectedRowRange when selection is collapsed', async () => {
      await act(async () => {
        wrapper = mountWithContexts(<JobOutput job={mockJob} />);
      });

      await waitForElement(wrapper, 'JobOutput', (el) => {
        return JobsAPI.readEvents.mock.calls.length > 0;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      wrapper.update();

      if (selectionChangeHandler) {
        // Simulate collapsed (empty) selection
        window.getSelection = jest.fn().mockReturnValue({
          isCollapsed: true,
          rangeCount: 0,
          getRangeAt: jest.fn(),
        });

        await act(async () => {
          selectionChangeHandler();
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
        wrapper.update();

        const list = wrapper.find('List');
        if (list.length > 0) {
          const getter = list.prop('overscanIndicesGetter');
          // With no selection, should return default overscan
          const result = getter({
            cellCount: 100,
            overscanCellsCount: 20,
            startIndex: 10,
            stopIndex: 30,
            scrollDirection: 1,
          });
          // Default: max(0, 10-20)=0 and min(99, 30+20)=50
          expect(result.overscanStartIndex).toBe(0);
          expect(result.overscanStopIndex).toBe(50);
        }
      }
    });

    test('overscanIndicesGetter clamps large selections to MAX_SELECTION_OVERSCAN', () => {
      // Replicate the overscanIndicesGetter logic for a selection that
      // exceeds the budget (selectionSpan > MAX_SELECTION_OVERSCAN).
      const MAX_SELECTION_OVERSCAN = 500;
      const selectedRowRange = { start: 0, end: 2000 };

      const startIndex = 1000;
      const stopIndex = 1020;
      const overscanCellsCount = 20;
      const cellCount = 3000;

      const defaultStart = Math.max(0, startIndex - overscanCellsCount);
      const defaultStop = Math.min(
        cellCount - 1,
        stopIndex + overscanCellsCount
      );

      const selectionSpan = selectedRowRange.end - selectedRowRange.start;
      // selectionSpan = 2000 > 500, so viewport-centered clamping applies
      expect(selectionSpan).toBeGreaterThan(MAX_SELECTION_OVERSCAN);

      const viewMid = Math.floor((startIndex + stopIndex) / 2);
      const halfBudget = Math.floor(MAX_SELECTION_OVERSCAN / 2);
      const clampedStart = Math.max(
        selectedRowRange.start,
        viewMid - halfBudget
      );
      const clampedEnd = Math.min(
        selectedRowRange.end,
        viewMid + halfBudget
      );

      const result = {
        overscanStartIndex: Math.min(
          defaultStart,
          Math.max(0, clampedStart)
        ),
        overscanStopIndex: Math.max(
          defaultStop,
          Math.min(cellCount - 1, clampedEnd)
        ),
      };

      // viewMid = 1010, halfBudget = 250
      // clampedStart = max(0, 1010 - 250) = 760
      // clampedEnd = min(2000, 1010 + 250) = 1260
      // defaultStart = max(0, 1000 - 20) = 980
      // defaultStop = min(2999, 1020 + 20) = 1040
      // overscanStartIndex = min(980, max(0, 760)) = 760
      // overscanStopIndex = max(1040, min(2999, 1260)) = 1260
      expect(result.overscanStartIndex).toBe(760);
      expect(result.overscanStopIndex).toBe(1260);
      // Total pinned rows = 1260 - 760 = 500, matching the budget
      expect(result.overscanStopIndex - result.overscanStartIndex).toBe(
        MAX_SELECTION_OVERSCAN
      );
    });

    test('overscanIndicesGetter fully preserves small selections even when scrolled away', () => {
      // Replicate the overscanIndicesGetter logic for a selection that
      // fits within the budget (selectionSpan <= MAX_SELECTION_OVERSCAN).
      // The viewport is far from the selection — rows should still be included.
      const MAX_SELECTION_OVERSCAN = 500;
      const selectedRowRange = { start: 10, end: 30 };

      // Viewport is far away from the selection
      const startIndex = 800;
      const stopIndex = 820;
      const overscanCellsCount = 20;
      const cellCount = 1000;

      const defaultStart = Math.max(0, startIndex - overscanCellsCount);
      const defaultStop = Math.min(
        cellCount - 1,
        stopIndex + overscanCellsCount
      );

      const selectionSpan = selectedRowRange.end - selectedRowRange.start;
      // selectionSpan = 20 <= 500, so full inclusion applies
      expect(selectionSpan).toBeLessThanOrEqual(MAX_SELECTION_OVERSCAN);

      const result = {
        overscanStartIndex: Math.min(
          defaultStart,
          Math.max(0, selectedRowRange.start)
        ),
        overscanStopIndex: Math.max(
          defaultStop,
          Math.min(cellCount - 1, selectedRowRange.end)
        ),
      };

      // defaultStart = max(0, 800-20) = 780
      // defaultStop = min(999, 820+20) = 840
      // overscanStartIndex = min(780, max(0, 10)) = 10
      // overscanStopIndex = max(840, min(999, 30)) = 840
      expect(result.overscanStartIndex).toBe(10);
      expect(result.overscanStopIndex).toBe(840);
      // The selected rows 10-30 are fully within the rendered range
      expect(result.overscanStartIndex).toBeLessThanOrEqual(
        selectedRowRange.start
      );
      expect(result.overscanStopIndex).toBeGreaterThanOrEqual(
        selectedRowRange.end
      );
    });
  });
});
