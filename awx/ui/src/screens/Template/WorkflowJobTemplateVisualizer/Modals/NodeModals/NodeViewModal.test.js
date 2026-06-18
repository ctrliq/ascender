import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeViewModal from './NodeViewModal';

jest.mock('../../../../../api');

// The modal renders into a body portal and finishes loading once the launch /
// related-data requests resolve; wait for the spinner (role progressbar) to go
// away before asserting on content.
const waitForLoaded = async () =>
  waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );

describe('NodeViewModal', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
    WorkflowJobTemplatesAPI.readLaunch.mockResolvedValue({});
    WorkflowJobTemplatesAPI.readDetail.mockResolvedValue({
      data: {
        id: 1,
        type: 'workflow_job_template',
        related: {
          webhook_receiver: '/api/v2/job_templates/7/gitlab/',
        },
      },
    });
    WorkflowJobTemplatesAPI.readWebhookKey.mockResolvedValue({
      data: {
        webhook_key: 'Pim3mRXT0',
      },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue({});
    JobTemplatesAPI.readInstanceGroups.mockResolvedValue({});
    JobTemplatesAPI.readWebhookKey.mockResolvedValue({});
    JobTemplatesAPI.readDetail.mockResolvedValue({
      data: {
        id: 1,
        type: 'job_template',
      },
    });
  });

  describe('Workflow job template node', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          unified_job_type: 'workflow_job',
          created: '2019-08-08T19:24:05.344276Z',
          modified: '2019-08-08T19:24:18.162949Z',
          related: {
            webhook_receiver: '/api/v2/workflow_job_templates/2/github/',
          },
        },
      },
    };

    afterAll(() => {
      jest.resetAllMocks();
    });

    const renderModal = () =>
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );

    test('should render prompt detail', async () => {
      renderModal();
      await waitForLoaded();
      // PromptDetail renders the node name and a Convergence detail for a
      // workflow node; assert both as a proxy for the component being present.
      // ("Mock Node" also appears in the modal title, so target the detail.)
      expect(
        document.querySelector('[data-cy="prompt-detail-name-value"]')
      ).toHaveTextContent('Mock Node');
      expect(
        document.querySelector('[data-cy="prompt-detail-convergence-value"]')
      ).toBeInTheDocument();
    });

    test('should fetch workflow template launch data', async () => {
      renderModal();
      await waitForLoaded();
      expect(JobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readInstanceGroups).not.toHaveBeenCalled();
      expect(WorkflowJobTemplatesAPI.readLaunch).toHaveBeenCalledWith(1);
      expect(WorkflowJobTemplatesAPI.readWebhookKey).toHaveBeenCalledWith(1);
    });

    test('Close button dispatches as expected', async () => {
      renderModal();
      await waitForLoaded();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_VIEW',
        value: null,
      });
    });

    test('Edit button dispatches as expected', async () => {
      renderModal();
      await waitForLoaded();
      fireEvent.click(screen.getByRole('button', { name: 'Edit Node' }));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_VIEW',
        value: null,
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_EDIT',
        value: workflowContext.nodeToView,
      });
    });
  });

  describe('Job template node', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          unified_job_type: 'job',
          created: '2019-08-08T19:24:05.344276Z',
          modified: '2019-08-08T19:24:18.162949Z',
        },
      },
    };

    test('should fetch job template launch data', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(WorkflowJobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readWebhookKey).not.toHaveBeenCalledWith();
      expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(1);
      expect(JobTemplatesAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
      jest.clearAllMocks();
    });

    test('should show content error when read call unsuccessful', async () => {
      JobTemplatesAPI.readLaunch.mockRejectedValue(new Error({}));
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(
        await screen.findByText('Something went wrong...')
      ).toBeInTheDocument();
      jest.clearAllMocks();
    });

    test('edit button should be shown when readOnly prop is false', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(
        document.querySelector('button#node-view-edit-button')
      ).toBeInTheDocument();
      jest.clearAllMocks();
    });

    test('edit button should be hidden when readOnly prop is true', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal readOnly />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(
        document.querySelector('button#node-view-edit-button')
      ).not.toBeInTheDocument();
      jest.clearAllMocks();
    });
  });

  describe('Project node', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          type: 'project_update',
          created: '2019-08-08T19:24:05.344276Z',
          modified: '2019-08-08T19:24:18.162949Z',
        },
      },
    };

    test('should not fetch launch data', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(WorkflowJobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readInstanceGroups).not.toHaveBeenCalled();
      jest.clearAllMocks();
    });
  });

  describe('Inventory Source node', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          type: 'inventory_source',
          created: '2019-08-08T19:24:05.344276Z',
          modified: '2019-08-08T19:24:18.162949Z',
        },
      },
    };

    test('should not fetch launch data', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(WorkflowJobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readInstanceGroups).not.toHaveBeenCalled();
      jest.clearAllMocks();
    });
  });

  describe('Approval node', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          type: 'workflow_approval_template',
          timeout: 0,
          all_parents_must_converge: false,
        },
      },
    };

    test('should not fetch launch data', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(WorkflowJobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readLaunch).not.toHaveBeenCalled();
      expect(JobTemplatesAPI.readInstanceGroups).not.toHaveBeenCalled();
      jest.clearAllMocks();
    });
  });

  describe('Convergence label', () => {
    const workflowContext = {
      nodeToView: {
        fullUnifiedJobTemplate: {
          id: 1,
          name: 'Mock Node',
          description: '',
          type: 'workflow_approval_template',
          timeout: 0,
          all_parents_must_converge: false,
        },
      },
    };

    test('should display "Any" Convergence label', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={workflowContext}>
            <NodeViewModal />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      await waitForLoaded();
      expect(
        document.querySelector('[data-cy="prompt-detail-convergence-value"]')
      ).toHaveTextContent('Any');
      jest.clearAllMocks();
    });
  });
});
