import type { WorkflowJobTemplate } from 'types/api';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerToolbar from './VisualizerToolbar';
import type { WorkflowState } from '../../../components/Workflow/workflowReducer';

const close = vi.fn();
const dispatch = vi.fn();
const save = vi.fn();
const template = {
  id: 1,
  name: 'Test JT',
  summary_fields: {
    user_capabilities: {
      start: true,
    },
  },
} as unknown as WorkflowJobTemplate;
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
        <WorkflowStateContext.Provider
          value={{ ...workflowContext, nodes } as unknown as WorkflowState}
        >
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
    expect(
      document.querySelector('#visualizer-total-nodes-badge')
    ).toHaveTextContent('1');
  });

  test('Should display action buttons', () => {
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Toggle Legend' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle Tools' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Workflow Documentation' })
    ).toBeInTheDocument();
    expect(document.querySelector('#visualizer-launch')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete All Nodes' })
    ).toBeInTheDocument();
  });

  test('Toggle Legend button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Legend' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LEGEND' });
  });

  test('Toggle Tools button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tools' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOLS' });
  });

  test('Delete All button dispatches as expected', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Nodes' }));
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
          value={
            { ...workflowContext, nodes: oneNode } as unknown as WorkflowState
          }
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
    expect(document.querySelector('#visualizer-launch')).not.toHaveAttribute(
      'aria-disabled'
    );

    const oneNode = [
      {
        id: 1,
      },
    ];
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={
            { ...workflowContext, nodes: oneNode } as unknown as WorkflowState
          }
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
    // Aria-disabled, so the tooltip can still say why.
    expect(launchButtons[launchButtons.length - 1]).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('Launch tooltip says to save first when there are unsaved changes', async () => {
    const user = userEvent.setup();
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{ ...workflowContext, nodes } as unknown as WorkflowState}
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
    await user.hover(screen.getByRole('button', { name: 'Launch Workflow' }));
    expect(
      await screen.findByText('Save the Workflow to Launch It')
    ).toBeInTheDocument();
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
          value={
            { ...workflowContext, nodes: oneNode } as unknown as WorkflowState
          }
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
