import React from 'react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { useUserProfile } from 'contexts/Config';
import type { NodeModalProps } from './NodeModal';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeEditModal from './NodeEditModal';
import type { WorkflowState } from '../../../../../components/Workflow/workflowReducer';

const dispatch = vi.fn();

vi.mock('../../../../../api/models/InventorySources');
vi.mock('../../../../../api/models/JobTemplates');
vi.mock('../../../../../api/models/Projects');
vi.mock('../../../../../api/models/WorkflowJobTemplates');

// Capture the onSave prop NodeEditModal hands to NodeModal so the test can
// invoke it directly. The real NodeModal wizard is not exercised here.
let capturedOnSave: NodeModalProps['onSave'] | undefined;
vi.mock('./NodeModal', () => ({
  default: (props: NodeModalProps) => {
    capturedOnSave = props.onSave;
    return null;
  },
}));

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
} as unknown as WorkflowState;

describe('NodeEditModal', () => {
  beforeEach(() => {
    vi.mocked(useUserProfile).mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: 0,
      isNotificationAdmin: 0,
      isExecEnvAdmin: 0,
    }));
  });

  test('Node modal confirmation dispatches as expected', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <NodeEditModal />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );

    capturedOnSave!(values, {});

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
