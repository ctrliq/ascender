import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { WorkflowStateContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowStartNode from './WorkflowStartNode';

const nodePositions = {
  1: {
    x: 0,
    y: 0,
  },
};

describe('WorkflowStartNode', () => {
  test('mounts successfully', () => {
    const { container } = renderWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowStartNode
            nodePositions={nodePositions}
            showActionTooltip={false}
          />
        </WorkflowStateContext.Provider>
      </svg>
    );
    expect(container.querySelector('#node-1')).toBeInTheDocument();
  });
  test('tooltip shown on hover', async () => {
    const { container } = renderWithContexts(
      <svg>
        <WorkflowStateContext.Provider value={{ nodePositions }}>
          <WorkflowStartNode nodePositions={nodePositions} showActionTooltip />
        </WorkflowStateContext.Provider>
      </svg>
    );
    const startNode = container.querySelector('#node-1');
    expect(container.querySelector('#node-add')).not.toBeInTheDocument();
    fireEvent.mouseEnter(startNode);
    await waitFor(() =>
      expect(container.querySelector('#node-add')).toBeInTheDocument()
    );
    fireEvent.mouseLeave(startNode);
    await waitFor(() =>
      expect(container.querySelector('#node-add')).not.toBeInTheDocument()
    );
  });
});
