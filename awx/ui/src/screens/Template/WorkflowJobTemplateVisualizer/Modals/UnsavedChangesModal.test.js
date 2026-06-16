import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import UnsavedChangesModal from './UnsavedChangesModal';

const dispatch = jest.fn();
const onSaveAndExit = jest.fn();
const onExit = jest.fn();

describe('UnsavedChangesModal', () => {
  beforeEach(() => {
    dispatch.mockClear();
    onSaveAndExit.mockClear();
    onExit.mockClear();
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <UnsavedChangesModal onSaveAndExit={onSaveAndExit} onExit={onExit} />
      </WorkflowDispatchContext.Provider>
    );
  });

  test('Exit Without Saving button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#confirm-exit-without-saving'));
    expect(onExit).toHaveBeenCalled();
  });

  test('Save and Exit button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#confirm-save-and-exit'));
    expect(onSaveAndExit).toHaveBeenCalled();
  });

  test('Close button dispatches as expected', () => {
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_UNSAVED_CHANGES_MODAL',
    });
  });
});
