import type { AnyJob } from 'types/api';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { WorkflowJobsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowOutput from './WorkflowOutput';

// jsdom implements none of the SVG geometry the graph measures, so the suite
// patches these onto the prototype and takes them off again afterwards.
const svgPrototype = window.SVGElement.prototype as unknown as Record<
  string,
  unknown
>;

vi.mock('../../../api');

const job = {
  id: 1,
  name: 'Foo JT',
  status: 'successful',
} as unknown as AnyJob;

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
    vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
      data: {
        count: mockWorkflowJobNodes.length,
        results: mockWorkflowJobNodes,
      },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readNodes>);
    svgPrototype.height = {
      baseVal: {
        value: 100,
      },
    };
    svgPrototype.width = {
      baseVal: {
        value: 100,
      },
    };
    svgPrototype.getBBox = () => ({
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
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete svgPrototype.getBBox;
    delete svgPrototype.getBoundingClientRect;
    delete svgPrototype.height;
    delete svgPrototype.width;
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
    vi.mocked(WorkflowJobsAPI.readNodes).mockRejectedValue(new Error());
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
    vi.useFakeTimers();
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
      vi.mocked(WorkflowJobsAPI.readNodes).mockClear();
      vi.mocked(WorkflowJobsAPI.readNodes).mockRejectedValue(
        new Error('stale timer')
      );

      await vi.advanceTimersByTimeAsync(3000);

      expect(WorkflowJobsAPI.readNodes).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a failed recovery refetch leaves the graph in place', async () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithContexts(
        <svg>
          <WorkflowOutput job={job} />
        </svg>
      );
      await waitFor(() =>
        expect(container.querySelector('#workflow-g')).toBeInTheDocument()
      );
      vi.mocked(WorkflowJobsAPI.readNodes).mockRejectedValue(
        new Error('recovery failed')
      );

      await vi.advanceTimersByTimeAsync(3000);

      // The refetches ran and failed; the graph is untouched and no error
      // state replaced it.
      expect(
        vi.mocked(WorkflowJobsAPI.readNodes).mock.calls.length
      ).toBeGreaterThan(1);
      expect(container.querySelector('#workflow-g')).toBeInTheDocument();
      expect(
        container.querySelector('.pf-v6-c-empty-state')
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
