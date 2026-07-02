import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import LinkAddModal from './LinkAddModal';

const dispatch = jest.fn();

const workflowContext = {
  linkToEdit: null,
};

describe('LinkAddModal', () => {
  test('Confirm button dispatches as expected', () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <LinkAddModal />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    fireEvent.click(document.querySelector('button#link-confirm'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CREATE_LINK',
      linkType: 'success',
      linkCondition: null,
    });
  });
});
