import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import DeleteAllNodesModal from './DeleteAllNodesModal';

const dispatch = jest.fn();

describe('DeleteAllNodesModal', () => {
  beforeEach(() => {
    dispatch.mockClear();
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <DeleteAllNodesModal />
      </WorkflowDispatchContext.Provider>
    );
  });

  test('Delete All button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#confirm-delete-all-nodes'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DELETE_ALL_NODES',
    });
  });

  test('Cancel button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#cancel-delete-all-nodes'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_DELETE_ALL_NODES_MODAL',
    });
  });

  test('Close button dispatches as expected', () => {
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_DELETE_ALL_NODES_MODAL',
    });
  });
});
