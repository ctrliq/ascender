import React from 'react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { useUserProfile } from 'contexts/Config';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeEditModal from './NodeEditModal';

const dispatch = jest.fn();

jest.mock('../../../../../api/models/InventorySources');
jest.mock('../../../../../api/models/JobTemplates');
jest.mock('../../../../../api/models/Projects');
jest.mock('../../../../../api/models/WorkflowJobTemplates');

// Capture the onSave prop NodeEditModal hands to NodeModal so the test can
// invoke it directly. The real NodeModal wizard is not exercised here.
let capturedOnSave;
jest.mock('./NodeModal', () => (props) => {
  capturedOnSave = props.onSave;
  return null;
});

const values = {
  inventory: undefined,
  nodeResource: {
    id: 448,
    name: 'Test JT',
    type: 'job_template',
  },
};

const workflowContext = {
  nodeToEdit: {
    id: 4,
    unifiedJobTemplate: {
      id: 30,
      name: 'Foo JT',
      type: 'job_template',
      unified_job_type: 'job',
    },
    originalNodeObject: {
      summary_fields: { unified_job_template: { id: 1, name: 'Job Template' } },
    },
  },
};

describe('NodeEditModal', () => {
  beforeEach(() => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
  });

  test('Node modal confirmation dispatches as expected', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <NodeEditModal
            onSave={() => {}}
            askLinkType={false}
            title="Edit Node"
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );

    capturedOnSave(values, {});

    expect(dispatch).toHaveBeenCalledWith({
      node: {
        all_parents_must_converge: false,
        max_retries: 0,
        nodeResource: { id: 448, name: 'Test JT', type: 'job_template' },
      },
      type: 'UPDATE_NODE',
    });
  });
});
