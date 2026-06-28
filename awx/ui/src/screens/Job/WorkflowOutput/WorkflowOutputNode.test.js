import React from 'react';
import { WorkflowStateContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowOutputNode from './WorkflowOutputNode';

const nodeWithJT = {
  id: 2,
  originalNodeObject: {
    summary_fields: {
      job: {
        elapsed: 7,
        id: 9000,
        name: 'Automation JT',
        status: 'successful',
        type: 'job',
      },
      unified_job_template: {
        name: 'Automation JT',
      },
    },
    unifiedJobTemplate: {
      id: 77,
      name: 'Automation JT',
      unified_job_type: 'job',
    },
  },
};

const nodeWithoutJT = {
  id: 2,
  originalNodeObject: {
    summary_fields: {
      job: {
        elapsed: 7,
        id: 9000,
        name: 'Automation JT 2',
        status: 'successful',
        type: 'job',
      },
      unified_job_template: {
        name: 'Automation JT 2',
      },
    },
  },
};

const nodePositions = {
  1: {
    width: 72,
    height: 40,
    x: 0,
    y: 0,
  },
  2: {
    width: 180,
    height: 60,
    x: 282,
    y: 40,
  },
  3: {
    width: 180,
    height: 60,
    x: 564,
    y: 40,
  },
  4: {
    width: 180,
    height: 60,
    x: 846,
    y: 40,
  },
};

function renderNode(node) {
  return renderWithContexts(
    <svg>
      <WorkflowStateContext.Provider value={{ nodePositions }}>
        <WorkflowOutputNode
          mouseEnter={() => {}}
          mouseLeave={() => {}}
          node={node}
        />
      </WorkflowStateContext.Provider>
    </svg>
  );
}

describe('WorkflowOutputNode', () => {
  test('mounts successfully', () => {
    const { container } = renderNode(nodeWithJT);
    expect(container.querySelector('#node-2')).toBeInTheDocument();
  });

  test('node contents displayed correctly when Job and Job Template exist', () => {
    const { container } = renderNode(nodeWithJT);
    expect(container.querySelector('#node-2')).toHaveTextContent(
      'Automation JT'
    );
    expect(container.querySelector('#node-2')).toHaveTextContent('00:00:07');
  });

  test('node contents displayed correctly when Job Template deleted', () => {
    const { container } = renderNode(nodeWithoutJT);
    expect(container.querySelector('#node-2')).toHaveTextContent(
      'Automation JT 2'
    );
    expect(container.querySelector('#node-2')).toHaveTextContent('00:00:07');
  });

  test('node contents displayed correctly when Job deleted', () => {
    const { container } = renderNode({ id: 2 });
    expect(container.querySelector('#node-2')).toHaveTextContent('DELETED');
  });

  test('carried-forward node (relaunch from failed) shows as successful', () => {
    const carriedNode = {
      id: 2,
      originalNodeObject: {
        prior_run_succeeded: true,
        prior_run_elapsed: 7,
        summary_fields: {
          unified_job_template: { name: 'Carried JT', type: 'job_template' },
        },
        unifiedJobTemplate: {
          id: 77,
          name: 'Carried JT',
          unified_job_type: 'job',
        },
      },
    };
    const { container } = renderNode(carriedNode);
    const node = container.querySelector('#node-2');
    // no spawned job, but it renders the successful status icon (green)
    expect(
      node.querySelector('[data-job-status="successful"]')
    ).toBeInTheDocument();
    // and it shows the elapsed time carried over from the prior run
    expect(node).toHaveTextContent('00:00:07');
    // the job-template type letter still renders on the carried node
    expect(container.querySelector('#node-2-type-letter')).toHaveTextContent(
      'JT'
    );
  });

  test('pending node (not yet run) shows its type letter from the start', () => {
    const pendingNode = {
      id: 4,
      originalNodeObject: {
        summary_fields: {
          unified_job_template: { name: 'Pending JT', type: 'job_template' },
        },
      },
    };
    const { container } = renderNode(pendingNode);
    expect(container.querySelector('#node-4-type-letter')).toHaveTextContent(
      'JT'
    );
  });

  test('carried-forward nested workflow node shows the W type letter', () => {
    const carriedWorkflowNode = {
      id: 3,
      originalNodeObject: {
        prior_run_succeeded: true,
        prior_run_elapsed: 7,
        summary_fields: {
          unified_job_template: {
            name: 'Carried WF',
            type: 'workflow_job_template',
          },
        },
      },
    };
    const { container } = renderNode(carriedWorkflowNode);
    expect(container.querySelector('#node-3-type-letter')).toHaveTextContent(
      'W'
    );
  });

  test('running node has a blue frame matching the running icon', () => {
    const runningNode = {
      id: 2,
      originalNodeObject: {
        summary_fields: {
          job: { id: 9001, status: 'running', type: 'job' },
          unified_job_template: { name: 'Running JT', type: 'job_template' },
        },
      },
    };
    const { container } = renderNode(runningNode);
    expect(container.querySelector('rect').getAttribute('stroke')).toBe(
      "var(--ascender-status-running-color)"
    );
  });

  test('running node shows a live elapsed time', () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2021-09-01T12:00:10.000Z'));
    const runningNode = {
      id: 2,
      originalNodeObject: {
        summary_fields: {
          job: {
            id: 9003,
            status: 'running',
            type: 'job',
            started: '2021-09-01T12:00:00.000Z',
          },
          unified_job_template: { name: 'Running JT', type: 'job_template' },
        },
      },
    };
    const { container } = renderNode(runningNode);
    expect(container.querySelector('#node-2')).toHaveTextContent('00:00:10');
    jest.useRealTimers();
  });

  test('canceled node has an orange frame matching the canceled icon', () => {
    const canceledNode = {
      id: 2,
      originalNodeObject: {
        summary_fields: {
          job: { id: 9002, status: 'canceled', type: 'job' },
          unified_job_template: { name: 'Canceled JT', type: 'job_template' },
        },
      },
    };
    const { container } = renderNode(canceledNode);
    expect(container.querySelector('rect').getAttribute('stroke')).toBe(
      "var(--ascender-status-canceled-color)"
    );
  });
});
