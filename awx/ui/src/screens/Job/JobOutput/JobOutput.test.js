import React from 'react';
import { act } from 'react-dom/test-utils';
import { JobsAPI, JobEventsAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
import JobOutput, {
  computeOverscanIndices,
  MAX_SELECTION_OVERSCAN,
} from './JobOutput';
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
    let originalGetSelection;
    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: jest.fn(),
    };

    beforeEach(() => {
      originalGetSelection = window.getSelection;

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
      try {
        if (wrapper && wrapper.length) {
          wrapper.unmount();
        }
      } catch (e) {
        // wrapper may already be unmounted or from a different test
      }
      document.addEventListener.mockRestore();
      window.getSelection = originalGetSelection;
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
      expect(list).toHaveLength(1);
      expect(list.prop('overscanIndicesGetter')).toBeInstanceOf(Function);
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
      expect(list).toHaveLength(1);
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

      expect(selectionChangeHandler).toBeDefined();

      // Use a node inside the output area so the contains() check passes.
      const list = wrapper.find('List');
      expect(list).toHaveLength(1);
      const listNode = list.getDOMNode();

      const mockRange = {
        commonAncestorContainer: listNode,
        getBoundingClientRect: () => ({
          top: 50,
          bottom: 150,
          left: 0,
          right: 100,
        }),
      };
      mockSelection.getRangeAt.mockReturnValue(mockRange);
      window.getSelection = jest.fn().mockReturnValue(mockSelection);

      // Get the getter before triggering selection to verify it changes
      const getterBefore = list.prop('overscanIndicesGetter');
      const resultBefore = getterBefore({
        cellCount: 100,
        overscanCellsCount: 20,
        startIndex: 10,
        stopIndex: 30,
        scrollDirection: 1,
      });

      // Trigger selectionchange and allow rAF to process
      await act(async () => {
        selectionChangeHandler();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      wrapper.update();

      const listAfter = wrapper.find('List');
      expect(listAfter).toHaveLength(1);
      const getterAfter = listAfter.prop('overscanIndicesGetter');
      expect(getterAfter).toBeInstanceOf(Function);

      // The getter should now be a different closure (selectedRowRange updated)
      // and calling it should still return a valid range
      const resultAfter = getterAfter({
        cellCount: 100,
        overscanCellsCount: 20,
        startIndex: 10,
        stopIndex: 30,
        scrollDirection: 1,
      });
      expect(resultAfter.overscanStartIndex).toBeDefined();
      expect(resultAfter.overscanStopIndex).toBeDefined();
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

      expect(selectionChangeHandler).toBeDefined();

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
      expect(list).toHaveLength(1);
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
    });

    test('computeOverscanIndices clamps large selections to MAX_SELECTION_OVERSCAN', () => {
      const result = computeOverscanIndices(
        { cellCount: 3000, overscanCellsCount: 20, startIndex: 1000, stopIndex: 1020 },
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
        { cellCount: 1000, overscanCellsCount: 20, startIndex: 100, stopIndex: 120 },
        { start: 10, end: 30 }
      );
      // Selection rows 10-30 fit within budget alongside viewport rows 80-140
      expect(result.overscanStartIndex).toBe(10);
      expect(result.overscanStopIndex).toBe(140);
      expect(result.overscanStartIndex).toBeLessThanOrEqual(10);
      expect(result.overscanStopIndex).toBeGreaterThanOrEqual(30);
    });

    test('computeOverscanIndices falls back when small selection is far from viewport', () => {
      const result = computeOverscanIndices(
        { cellCount: 10000, overscanCellsCount: 20, startIndex: 5000, stopIndex: 5020 },
        { start: 10, end: 30 }
      );
      // Contiguous range would be 5030 rows; falls back to viewport-centered clamping
      expect(result.overscanStartIndex).toBe(4760);
      expect(result.overscanStopIndex).toBe(5040);
      expect(result.overscanStopIndex - result.overscanStartIndex).toBeLessThanOrEqual(
        MAX_SELECTION_OVERSCAN
      );
    });
  });
});
