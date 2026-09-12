import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import LinkEditModal from './LinkEditModal';
import type { WorkflowState } from '../../../../../components/Workflow/workflowReducer';

const dispatch = vi.fn();

const workflowContext = {
  linkToEdit: {
    source: {
      id: 2,
    },
    target: {
      id: 3,
    },
    linkType: 'always',
  },
} as unknown as WorkflowState;

describe('LinkEditModal', () => {
  test('Confirm button dispatches as expected', () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <LinkEditModal />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    fireEvent.click(document.querySelector('button#link-confirm')!);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_LINK',
      linkType: 'always',
      linkCondition: undefined,
    });
  });
});
