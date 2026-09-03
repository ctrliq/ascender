import React from 'react';
import { waitFor } from '@testing-library/react';
import { WorkflowJobsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowOutput from './WorkflowOutput';

jest.mock('../../../api');

const job = {
  id: 1,
  name: 'Foo JT',
  status: 'successful',
};

const mockWorkflowJobNodes = [
  {
    id: 8,
    success_nodes: [10],
    failure_nodes: [],
    always_nodes: [9],
    summary_fields: {
      job: {
        elapsed: 10,
        id: 14,
        name: 'A Playbook',
        status: 'successful',
        type: 'job',
      },
    },
  },
  {
    id: 9,
    success_nodes: [],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      job: {
        elapsed: 10,
        id: 14,
        name: 'A Project Update',
        status: 'successful',
        type: 'project_update',
      },
    },
  },
  {
    id: 10,
    success_nodes: [],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      job: {
        elapsed: 10,
        id: 14,
        name: 'An Inventory Source Sync',
        status: 'successful',
        type: 'inventory_update',
      },
    },
  },
  {
    id: 11,
    success_nodes: [9],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      job: {
        elapsed: 10,
        id: 14,
        name: 'Pause',
        status: 'successful',
        type: 'workflow_approval',
      },
    },
  },
];

describe('WorkflowOutput', () => {
  beforeEach(() => {
    WorkflowJobsAPI.readNodes.mockResolvedValue({
      data: {
        count: mockWorkflowJobNodes.length,
        results: mockWorkflowJobNodes,
      },
    });
    window.SVGElement.prototype.height = {
      baseVal: {
        value: 100,
      },
    };
    window.SVGElement.prototype.width = {
      baseVal: {
        value: 100,
      },
    };
    window.SVGElement.prototype.getBBox = () => ({
      x: 0,
      y: 0,
      width: 500,
      height: 250,
    });

    window.SVGElement.prototype.getBoundingClientRect = () => ({
      x: 303,
      y: 252.359375,
      width: 1329,
      height: 259.640625,
      top: 252.359375,
      right: 1632,
      bottom: 512,
      left: 303,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete window.SVGElement.prototype.getBBox;
    delete window.SVGElement.prototype.getBoundingClientRect;
    delete window.SVGElement.prototype.height;
    delete window.SVGElement.prototype.width;
  });

  test('renders successfully', async () => {
    const { container } = renderWithContexts(
      <svg>
        <WorkflowOutput job={job} />
      </svg>
    );

    // The graph is laid out into <g id="workflow-g"> once nodes load.
    await waitFor(() =>
      expect(container.querySelector('#workflow-g')).toBeInTheDocument()
    );

    expect(
      container.querySelector('.pf-v6-c-empty-state')
    ).not.toBeInTheDocument();
    // WorkflowStartNode renders a <g id="node-1">.
    expect(container.querySelector('#node-1')).toBeInTheDocument();
    // Each WorkflowOutputNode renders <g id="node-N"> for N > 1 (4 nodes).
    const outputNodes = Array.from(
      container.querySelectorAll('g[id^="node-"]')
    ).filter((g) => g.id !== 'node-1' && g.id !== 'node-add');
    expect(outputNodes).toHaveLength(4);
    // Each WorkflowOutputLink renders <g id="link-source-target"> (5 links).
    const links = Array.from(
      container.querySelectorAll('g[id^="link-"]')
    ).filter((g) => !g.id.endsWith('-overlay'));
    expect(links).toHaveLength(5);
  });

  test('error shown to user when error thrown fetching workflow job nodes', async () => {
    WorkflowJobsAPI.readNodes.mockRejectedValue(new Error());
    const { container } = renderWithContexts(
      <svg>
        <WorkflowOutput job={job} />
      </svg>
    );

    // ContentError renders a PF empty state with the error heading.
    await waitFor(() =>
      expect(
        container.querySelector('.pf-v6-c-empty-state')
      ).toBeInTheDocument()
    );
  });

  test('a recovery refetch is skipped once the component is unmounted', async () => {
    jest.useFakeTimers();
    try {
      const { container, unmount } = renderWithContexts(
        <svg>
          <WorkflowOutput job={job} />
        </svg>
      );
      await waitFor(() =>
        expect(container.querySelector('#workflow-g')).toBeInTheDocument()
      );
      // Loading armed the 500 ms and 2500 ms recovery timers. Once the
      // component is gone they must not reach the API, whatever it would
      // answer: there is nothing left to refresh, and a rejection here used
      // to escape as an unhandled one into whichever test ran next.
      unmount();
      WorkflowJobsAPI.readNodes.mockClear();
      WorkflowJobsAPI.readNodes.mockRejectedValue(new Error('stale timer'));

      await jest.advanceTimersByTimeAsync(3000);

      expect(WorkflowJobsAPI.readNodes).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a failed recovery refetch leaves the graph in place', async () => {
    jest.useFakeTimers();
    try {
      const { container } = renderWithContexts(
        <svg>
          <WorkflowOutput job={job} />
        </svg>
      );
      await waitFor(() =>
        expect(container.querySelector('#workflow-g')).toBeInTheDocument()
      );
      WorkflowJobsAPI.readNodes.mockRejectedValue(new Error('recovery failed'));

      await jest.advanceTimersByTimeAsync(3000);

      // The refetches ran and failed; the graph is untouched and no error
      // state replaced it.
      expect(WorkflowJobsAPI.readNodes.mock.calls.length).toBeGreaterThan(1);
      expect(container.querySelector('#workflow-g')).toBeInTheDocument();
      expect(
        container.querySelector('.pf-v6-c-empty-state')
      ).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
