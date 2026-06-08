import React from 'react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import WorkflowOutputToolbar from './WorkflowOutputToolbar';

let wrapper;
const dispatch = jest.fn();
const job = {
  id: 1,
  name: 'Workflow Job',
  status: 'running',
  summary_fields: {
    workflow_job_template: {
      id: 7,
      name: 'Workflow Job Template',
    },
    user_capabilities: {
      start: true,
    },
  },
};
const workflowContext = {
  nodes: [],
  showLegend: false,
  showTools: false,
};

function shouldFind(element) {
  expect(wrapper.find(element)).toHaveLength(1);
}
describe('WorkflowOutputToolbar', () => {
  beforeAll(() => {
    const nodes = [
      {
        id: 1,
      },
      {
        id: 2,
      },
      {
        id: 3,
        isDeleted: true,
      },
    ];
    wrapper = mountWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={{ ...workflowContext, nodes }}>
          <WorkflowOutputToolbar job={job} />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
  });

  test('should render correct toolbar item', () => {
    shouldFind(`Button[ouiaId="edit-workflow"]`);
    shouldFind('Button#workflow-output-toggle-legend');
    shouldFind('Badge');
    shouldFind('Button#workflow-output-toggle-tools');
    shouldFind('JobCancelButton');
  });

  test('Shows correct number of nodes', () => {
    // The start node (id=1) and deleted nodes (isDeleted=true) should be ignored
    expect(wrapper.find('Badge').text()).toBe('1');
  });

  test('Toggle Legend button dispatches as expected', () => {
    wrapper.find('CompassIcon').simulate('click');
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LEGEND' });
  });

  test('Toggle Tools button dispatches as expected', () => {
    wrapper.find('WrenchIcon').simulate('click');
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOLS' });
  });

  test('does not render the visualizer button when no workflow template exists', () => {
    const nodes = [
      {
        id: 1,
      },
      {
        id: 2,
      },
      {
        id: 3,
        isDeleted: true,
      },
    ];
    const slicedJob = {
      ...job,
      summary_fields: {
        ...job.summary_fields,
        workflow_job_template: null,
      },
    };
    const slicedWrapper = mountWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={{ ...workflowContext, nodes }}>
          <WorkflowOutputToolbar job={slicedJob} />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );

    expect(slicedWrapper.find('Button[ouiaId="edit-workflow"]')).toHaveLength(
      0
    );
  });
});
