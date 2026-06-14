import React from 'react';
import { WorkflowStateContext } from 'contexts/Workflow';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
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

describe('WorkflowOutputNode', () => {
  test('mounts successfully', () => {
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={nodeWithJT}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper).toHaveLength(1);
  });
  test('node contents displayed correctly when Job and Job Template exist', () => {
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={nodeWithJT}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.text('p')).toContain('Automation JT');
    expect(wrapper.find('WorkflowOutputNode Elapsed').text()).toBe('00:00:07');
  });
  test('node contents displayed correctly when Job Template deleted', () => {
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={nodeWithoutJT}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.contains(<p>Automation JT 2</p>)).toBe(true);
    expect(wrapper.find('WorkflowOutputNode Elapsed').text()).toBe('00:00:07');
  });
  test('node contents displayed correctly when Job deleted', () => {
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={{ id: 2 }}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.text()).toBe('DELETED');
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
        unifiedJobTemplate: { id: 77, name: 'Carried JT', unified_job_type: 'job' },
      },
    };
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={carriedNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    // no spawned job, but it renders the successful status icon (green), not the default label
    expect(wrapper.find('StatusIcon[status="successful"]')).toHaveLength(1);
    expect(wrapper.find('NodeDefaultLabel')).toHaveLength(0);
    // and it shows the elapsed time carried over from the prior run
    expect(wrapper.find('WorkflowOutputNode Elapsed').text()).toBe('00:00:07');
    // the job-template type letter still renders on the carried node
    expect(wrapper.find('#node-2-type-letter').first().text()).toBe('JT');
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
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={pendingNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    // no job and not carried, but the type letter is shown immediately
    expect(wrapper.find('#node-4-type-letter').first().text()).toBe('JT');
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
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={carriedWorkflowNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.find('#node-3-type-letter').first().text()).toBe('W');
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
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={runningNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.find('rect').first().prop('stroke')).toBe(
      'var(--pf-global--primary-color--100)'
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
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={runningNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    wrapper.update();
    expect(wrapper.find('WorkflowOutputNode Elapsed').text()).toBe('00:00:10');
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
    const wrapper = mountWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowOutputNode
            mouseEnter={() => {}}
            mouseLeave={() => {}}
            node={canceledNode}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(wrapper.find('rect').first().prop('stroke')).toBe(
      'var(--pf-global--palette--orange-300)'
    );
  });
});
