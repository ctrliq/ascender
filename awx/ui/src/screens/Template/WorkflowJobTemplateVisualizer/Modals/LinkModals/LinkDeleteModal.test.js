import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import LinkDeleteModal from './LinkDeleteModal';

const dispatch = jest.fn();

const workflowContext = {
  linkToDelete: {
    source: {
      id: 2,
    },
    target: {
      id: 3,
    },
    linkType: 'always',
  },
};

describe('LinkDeleteModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={workflowContext}>
          <LinkDeleteModal />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
  });

  test('Confirm button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#confirm-link-removal'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DELETE_LINK',
    });
  });

  test('Cancel button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#cancel-link-removal'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_LINK_TO_DELETE',
      value: null,
    });
  });

  test('Close button dispatches as expected', () => {
    // AlertModal renders into a body portal; the PF Modal close button is
    // labeled "Close".
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_LINK_TO_DELETE',
      value: null,
    });
  });
});
