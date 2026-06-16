import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerStartScreen from './VisualizerStartScreen';

const dispatch = jest.fn();

describe('VisualizerStartScreen', () => {
  test('dispatches properly when start button clicked', () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <VisualizerStartScreen />
      </WorkflowDispatchContext.Provider>
    );
    const button = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_ADD_NODE',
      sourceNodeId: 1,
    });
  });
  test('start button hidden in read-only mode', () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <VisualizerStartScreen readOnly />
      </WorkflowDispatchContext.Provider>
    );
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
