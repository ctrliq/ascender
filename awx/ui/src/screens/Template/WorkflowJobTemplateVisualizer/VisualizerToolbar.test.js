import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerToolbar from './VisualizerToolbar';

const close = jest.fn();
const dispatch = jest.fn();
const save = jest.fn();
const template = {
  id: 1,
  name: 'Test JT',
  summary_fields: {
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

describe('VisualizerToolbar', () => {
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

  function renderToolbar() {
    return renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={{ ...workflowContext, nodes }}>
          <VisualizerToolbar
            onClose={close}
            onSave={save}
            template={template}
            hasUnsavedChanges={false}
            readOnly={false}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
  }

  test('Shows correct number of nodes', () => {
    // The start node (id=1) and deleted nodes (isDeleted=true) should be ignored
    renderToolbar();
    expect(document.querySelector('#visualizer-total-nodes-badge')).toHaveTextContent(
      '1'
    );
  });

  test('Should display action buttons', () => {
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Toggle legend' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle tools' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Workflow documentation' })
    ).toBeInTheDocument();
    expect(document.querySelector('#visualizer-launch')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete all nodes' })
    ).toBeInTheDocument();
  });

  test('Toggle Legend button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle legend' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LEGEND' });
  });

  test('Toggle Tools button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle tools' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOLS' });
  });

  test('Delete All button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all nodes' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SHOW_DELETE_ALL_NODES_MODAL',
      value: true,
    });
  });

  test('Delete All button dispatches as expected (duplicate)', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all nodes' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SHOW_DELETE_ALL_NODES_MODAL',
      value: true,
    });
  });

  test('Save button calls expected function', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalled();
  });

  test('Close button calls expected function', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalled();
  });

  test('Launch button should be hidden when user cannot start workflow', () => {
    const oneNode = [
      {
        id: 1,
      },
    ];
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{ ...workflowContext, nodes: oneNode }}
        >
          <VisualizerToolbar
            onClose={close}
            onSave={save}
            template={{
              ...template,
              summary_fields: {
                user_capabilities: {
                  start: false,
                },
              },
            }}
            hasUnsavedChanges
            readOnly={false}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    expect(document.querySelector('#visualizer-launch')).toBeNull();
  });

  test('Launch button should be disabled when there are unsaved changes', () => {
    renderToolbar();
    // totalNodes > 0 and no unsaved changes => enabled
    expect(document.querySelector('#visualizer-launch')).not.toBeDisabled();

    const oneNode = [
      {
        id: 1,
      },
    ];
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{ ...workflowContext, nodes: oneNode }}
        >
          <VisualizerToolbar
            onClose={close}
            onSave={save}
            template={template}
            hasUnsavedChanges
            readOnly={false}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    const launchButtons = document.querySelectorAll('#visualizer-launch');
    // the second render's launch button is the last one in the document
    expect(launchButtons[launchButtons.length - 1]).toBeDisabled();
  });

  test('Buttons should be hidden when user cannot edit workflow', () => {
    const oneNode = [
      {
        id: 1,
      },
    ];
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{ ...workflowContext, nodes: oneNode }}
        >
          <VisualizerToolbar
            onClose={close}
            onSave={save}
            template={template}
            hasUnsavedChanges={false}
            readOnly
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    expect(document.querySelector('#visualizer-delete-all')).toBeNull();
    expect(document.querySelector('#visualizer-save')).toBeNull();
  });
});
