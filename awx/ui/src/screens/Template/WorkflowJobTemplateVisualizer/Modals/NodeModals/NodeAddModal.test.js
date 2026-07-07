import React from 'react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeAddModal from './NodeAddModal';

const dispatch = jest.fn();

// Capture the onSave prop NodeAddModal hands to NodeModal so the test can
// invoke it directly. The real NodeModal wizard is not exercised here.
let capturedOnSave;
jest.mock('./NodeModal', () => (props) => {
  capturedOnSave = props.onSave;
  return null;
});

const nodeResource = {
  id: 448,
  type: 'job_template',
  name: 'Test JT',
  summary_fields: {
    credentials: [],
  },
};

const workflowContext = {
  addNodeSource: 2,
};

describe('NodeAddModal', () => {
  test('Node modal confirmation dispatches as expected', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <NodeAddModal onSave={() => {}} askLinkType title="Add Node" />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );

    capturedOnSave({ linkType: 'success', nodeResource }, {});

    expect(dispatch).toHaveBeenCalledWith({
      node: {
        all_parents_must_converge: false,
        max_retries: 0,
        linkType: 'success',
        nodeResource: {
          id: 448,
          name: 'Test JT',
          summary_fields: { credentials: [] },
          type: 'job_template',
        },
      },
      type: 'CREATE_NODE',
    });
  });
});
