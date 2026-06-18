import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeDeleteModal from './NodeDeleteModal';

const dispatch = jest.fn();

describe('NodeDeleteModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Node with unified job template', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={{
              nodeToDelete: {
                id: 2,
                unifiedJobTemplate: {
                  id: 4000,
                  name: 'Test JT',
                  type: 'job_template',
                },
                fullUnifiedJobTemplate: {
                  name: 'Bar',
                },
                originalNodeObject: {
                  identifier: '654160ef-4013-4b90-8e4b-87dee0cb6783',
                  summary_fields: { unified_job_template: { name: 'Bar' } },
                },
              },
            }}
          >
            <NodeDeleteModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });

    test('Mounts successfully', () => {
      // Modal renders into a body portal; query via screen/document.
      expect(screen.getByText('Remove Node Bar')).toBeInTheDocument();
    });

    test('Confirm button dispatches as expected', () => {
      expect(screen.getByText('Remove Node Bar')).toBeInTheDocument();
      fireEvent.click(document.querySelector('button#confirm-node-removal'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'DELETE_NODE',
      });
    });

    test('Cancel button dispatches as expected', () => {
      fireEvent.click(document.querySelector('button#cancel-node-removal'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_DELETE',
        value: null,
      });
    });

    test('Close button dispatches as expected', () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_DELETE',
        value: null,
      });
    });
  });

  describe('Node without unified job template', () => {
    test('Mounts successfully', () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={{
              nodeToDelete: {
                id: 2,
              },
            }}
          >
            <NodeDeleteModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      expect(
        screen.getByText('Are you sure you want to remove this node?')
      ).toBeInTheDocument();
    });
  });
});
