import type { ApiResponse } from 'api/Base';
import type { Organization, Paginated, WorkflowJobTemplate } from 'types/api';
import type {
  ApiWorkflowNode,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import {
  OrganizationsAPI,
  WorkflowApprovalTemplatesAPI,
  WorkflowJobTemplateNodesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import workflowReducer from 'components/Workflow/workflowReducer';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import Visualizer from './Visualizer';

vi.mock('../../../components/Workflow/workflowReducer');

const realWorkflowReducer = (
  await vi.importActual<
    typeof import('../../../components/Workflow/workflowReducer')
  >('../../../components/Workflow/workflowReducer')
).default;

vi.mock('../../../api');

/** The svg geometry jsdom does not implement, which the graph reads. */
interface SvgGeometryStubs {
  height?: { baseVal: { value: number } };
  width?: { baseVal: { value: number } };
  getBBox?: () => { x: number; y: number; width: number; height: number };
  getBoundingClientRect?: () => DOMRect;
}

const startNode = {
  id: 1,
  fullUnifiedJobTemplate: {
    name: 'START',
  },
};

const defaultLinks = [
  {
    linkType: 'always',
    source: { id: 1 },
    target: { id: 2 },
  },
];

const template = {
  id: 1,
  name: 'Foo WFJT',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
      start: true,
      schedule: true,
      copy: true,
    },
  },
} as unknown as WorkflowJobTemplate;

const mockWorkflowNodes = [
  {
    id: 8,
    success_nodes: [10],
    failure_nodes: [],
    always_nodes: [9],
    summary_fields: {
      unified_job_template: {
        id: 14,
        name: 'A Playbook',
        type: 'job_template',
      },
    },
  },
  {
    id: 9,
    success_nodes: [],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      unified_job_template: {
        id: 14,
        name: 'A Project Update',
        type: 'project',
      },
    },
  },
  {
    id: 10,
    success_nodes: [],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      unified_job_template: {
        elapsed: 10,
        name: 'An Inventory Source Sync',
        type: 'inventory_source',
      },
    },
  },
  {
    id: 11,
    success_nodes: [9],
    failure_nodes: [],
    always_nodes: [],
    summary_fields: {
      unified_job_template: {
        id: 14,
        name: 'Pause',
        type: 'workflow_approval_template',
      },
    },
  },
];

// Renders the full Visualizer inside the app contexts. The d3/SVG graph has no
// geometry in jsdom, so assertions are made via element ids (g#node-*,
// g#link-*), ouia/aria-labelled toolbar buttons, and modal text rather than
// layout. Returns the render result (container, history, etc).
const renderVisualizer = () =>
  renderWithContexts(
    <svg>
      <Visualizer template={template} />
    </svg>
  );

describe('Visualizer', () => {
  beforeEach(() => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 1, name: 'Default' }],
      },
    } as unknown as ApiResponse<Paginated<Organization>>);
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: mockWorkflowNodes.length,
        results: mockWorkflowNodes,
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    (window.SVGElement.prototype as unknown as SvgGeometryStubs).height = {
      baseVal: {
        value: 100,
      },
    };
    (window.SVGElement.prototype as unknown as SvgGeometryStubs).width = {
      baseVal: {
        value: 100,
      },
    };
    (window.SVGElement.prototype as unknown as SvgGeometryStubs).getBBox =
      () => ({
        x: 0,
        y: 0,
        width: 500,
        height: 250,
      });

    window.SVGElement.prototype.getBoundingClientRect = () => ({
      x: 303,
      y: 252.359375,
      width: 1329,
      height: 259.640625,
      top: 252.359375,
      right: 1632,
      bottom: 512,
      left: 303,
      toJSON: () => ({}),
    });
  });

  afterAll(() => {
    delete (window.SVGElement.prototype as unknown as SvgGeometryStubs).getBBox;
    delete (window.SVGElement.prototype as unknown as SvgGeometryStubs)
      .getBoundingClientRect;
    delete (window.SVGElement.prototype as unknown as SvgGeometryStubs).height;
    delete (window.SVGElement.prototype as unknown as SvgGeometryStubs).width;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mocked(workflowReducer).mockImplementation(realWorkflowReducer);
  });

  test('Renders successfully', async () => {
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(container.querySelector('g#node-1')).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Something went wrong...')
    ).not.toBeInTheDocument();
    // WorkflowStartNode -> g#node-1, 4 VisualizerNodes -> g#node-2..5
    expect(container.querySelectorAll('g[id^="node-"]')).toHaveLength(5);
    // 5 VisualizerLinks -> g#link-*
    expect(container.querySelectorAll('g[id^="link-"]')).toHaveLength(5);
  });

  test('Successfully deletes all nodes', async () => {
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(container.querySelector('g#node-1')).toBeInTheDocument()
    );
    expect(screen.queryByText('Remove All Nodes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all nodes' }));
    expect(screen.getByText('Remove All Nodes')).toBeInTheDocument();
    // PF Modal portals into document.body, outside the render container
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm removal of all nodes' })
    );
    // With no nodes left, the start screen prompts the user to begin again
    expect(
      screen.getByText('Please click the Start button to begin.')
    ).toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(WorkflowJobTemplateNodesAPI.destroy).toHaveBeenCalledWith(8)
    );
    expect(WorkflowJobTemplateNodesAPI.destroy).toHaveBeenCalledWith(9);
    expect(WorkflowJobTemplateNodesAPI.destroy).toHaveBeenCalledWith(10);
    expect(WorkflowJobTemplateNodesAPI.destroy).toHaveBeenCalledWith(11);
  });

  test('Successfully changes link type', async () => {
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(container.querySelector('g#link-2-3')).toBeInTheDocument()
    );
    expect(screen.queryByText('Edit Link')).not.toBeInTheDocument();
    fireEvent.mouseEnter(container.querySelector('g#link-2-3')!);
    fireEvent.click(container.querySelector('[data-cy="link-edit"]')!);
    expect(screen.getByText('Edit Link')).toBeInTheDocument();
    // PF Modal (LinkEditModal) portals into document.body, outside container
    fireEvent.change(document.querySelector('#link-select')!, {
      target: { value: 'success' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save link changes' }));
    expect(screen.queryByText('Edit Link')).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(
        WorkflowJobTemplateNodesAPI.disassociateAlwaysNode
      ).toHaveBeenCalledWith(8, 9)
    );
    expect(
      WorkflowJobTemplateNodesAPI.associateSuccessNode
    ).toHaveBeenCalledWith(8, 9);
  });

  test('Start Screen shown when no nodes are present', async () => {
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        screen.getByText('Please click the Start button to begin.')
      ).toBeInTheDocument()
    );
    expect(container.querySelector('#visualizer-toggle-tools')).toBeDisabled();
    expect(container.querySelector('#visualizer-toggle-legend')).toBeDisabled();
  });

  test('Error shown when saving fails due to node add error', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'PING',
              type: 'job_template',
            },
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplatesAPI.createNode).mockRejectedValue(
      new Error()
    );
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.createNode).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to node edit error', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            isEdited: true,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'PING',
              type: 'job_template',
            },
            originalNodeObject: {
              id: 9000,
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
            },
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplateNodesAPI.update).mockRejectedValue(
      new Error()
    );
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(WorkflowJobTemplateNodesAPI.update).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to approval template add error', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Approval',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplatesAPI.createNode).mockResolvedValue({
      data: {
        id: 9001,
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(
      WorkflowJobTemplateNodesAPI.createApprovalTemplate
    ).mockRejectedValue(new Error());
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.createNode).toHaveBeenCalledTimes(1)
    );
    expect(
      WorkflowJobTemplateNodesAPI.createApprovalTemplate
    ).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to approval template edit error', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            isEdited: true,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Approval',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
            originalNodeObject: {
              id: 9000,
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
              summary_fields: {
                unified_job_template: {
                  unified_job_type: 'workflow_approval',
                },
              },
            },
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplateNodesAPI.update).mockResolvedValue({
      data: {
        id: 9000,
        summary_fields: {
          unified_job_template: {
            unified_job_type: 'workflow_approval',
            id: 1,
          },
        },
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowApprovalTemplatesAPI.update).mockRejectedValue(
      new Error()
    );
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(WorkflowJobTemplateNodesAPI.update).toHaveBeenCalledTimes(1)
    );
    expect(WorkflowApprovalTemplatesAPI.update).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to node disassociate failure', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Approval',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
            originalNodeObject: {
              id: 9000,
              summary_fields: {
                unified_job_template: {
                  unified_job_type: 'workflow_approval',
                },
              },
              success_nodes: [],
              failure_nodes: [3],
              always_nodes: [],
            },
            success_nodes: [3],
            failure_nodes: [],
            always_nodes: [],
          },
          {
            id: 3,
            fullUnifiedJobTemplate: {
              id: 4,
              name: 'Approval 2',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
            originalNodeObject: {
              id: 9001,
              summary_fields: {
                unified_job_template: {
                  unified_job_type: 'workflow_approval',
                },
              },
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
            },
            success_nodes: [],
            failure_nodes: [],
            always_nodes: [],
          },
        ];
        newState.links = [
          {
            linkType: 'always',
            source: { id: 1 },
            target: { id: 2 },
          },
          {
            linkType: 'success',
            source: { id: 2 },
            target: { id: 3 },
          },
        ];
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(
      WorkflowJobTemplateNodesAPI.disassociateFailuresNode
    ).mockRejectedValue(new Error());
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(
        WorkflowJobTemplateNodesAPI.disassociateFailuresNode
      ).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to node associate failure', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Approval',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
            originalNodeObject: {
              id: 9000,
              summary_fields: {
                unified_job_template: {
                  unified_job_type: 'workflow_approval',
                },
              },
              success_nodes: [],
              failure_nodes: [3],
              always_nodes: [],
            },
            success_nodes: [3],
            failure_nodes: [],
            always_nodes: [],
          },
          {
            id: 3,
            fullUnifiedJobTemplate: {
              id: 4,
              name: 'Approval 2',
              timeout: 1000,
              type: 'workflow_approval_template',
            },
            originalNodeObject: {
              id: 9001,
              summary_fields: {
                unified_job_template: {
                  unified_job_type: 'workflow_approval',
                },
              },
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
            },
            success_nodes: [],
            failure_nodes: [],
            always_nodes: [],
          },
        ];
        newState.links = [
          {
            linkType: 'always',
            source: { id: 1 },
            target: { id: 2 },
          },
          {
            linkType: 'success',
            source: { id: 2 },
            target: { id: 3 },
          },
        ];
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(
      WorkflowJobTemplateNodesAPI.disassociateFailuresNode
    ).mockResolvedValue(undefined as unknown as ApiResponse<any>);
    vi.mocked(
      WorkflowJobTemplateNodesAPI.associateSuccessNode
    ).mockRejectedValue(new Error());
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(
        WorkflowJobTemplateNodesAPI.associateSuccessNode
      ).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to credential disassociate failure', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            isEdited: true,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Ping',
              type: 'job_template',
            },
            originalNodeObject: {
              id: 9000,
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
            },
            originalNodeCredentials: [
              {
                id: 456,
                credential_type: 1,
              },
            ],
            promptValues: {
              credentials: [
                {
                  id: 123,
                  credential_type: 1,
                },
              ],
            },
            launchConfig: {
              defaults: {
                credentials: [
                  {
                    id: 456,
                    credential_type: 1,
                  },
                ],
              },
            },
            success_nodes: [],
            failure_nodes: [],
            always_nodes: [],
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplateNodesAPI.update).mockResolvedValue(
      undefined as unknown as ApiResponse<unknown>
    );
    vi.mocked(
      WorkflowJobTemplateNodesAPI.disassociateCredentials
    ).mockRejectedValue(new Error());
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(
        WorkflowJobTemplateNodesAPI.disassociateCredentials
      ).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown when saving fails due to credential associate failure', async () => {
    vi.mocked(workflowReducer).mockImplementation((state: WorkflowState) => {
      const newState = {
        ...state,
        isLoading: false,
      };

      if (newState.nodes.length === 0) {
        newState.nodes = [
          startNode,
          {
            id: 2,
            isEdited: true,
            fullUnifiedJobTemplate: {
              id: 3,
              name: 'Ping',
              type: 'job_template',
            },
            originalNodeObject: {
              id: 9000,
              success_nodes: [],
              failure_nodes: [],
              always_nodes: [],
            },
            originalNodeCredentials: [
              {
                id: 456,
                credential_type: 1,
              },
            ],
            promptValues: {
              credentials: [
                {
                  id: 123,
                  credential_type: 1,
                },
              ],
            },
            launchConfig: {
              defaults: {
                credentials: [
                  {
                    id: 456,
                    credential_type: 1,
                  },
                ],
              },
            },
            success_nodes: [],
            failure_nodes: [],
            always_nodes: [],
          },
        ];
        newState.links = defaultLinks;
      }

      return newState;
    });
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockResolvedValue({
      data: {
        count: 0,
        results: [],
      },
    } as unknown as ApiResponse<Paginated<ApiWorkflowNode>>);
    vi.mocked(WorkflowJobTemplateNodesAPI.update).mockResolvedValue(
      undefined as unknown as ApiResponse<unknown>
    );
    vi.mocked(
      WorkflowJobTemplateNodesAPI.disassociateCredentials
    ).mockResolvedValue(undefined as unknown as ApiResponse<any>);
    vi.mocked(
      WorkflowJobTemplateNodesAPI.associateCredentials
    ).mockRejectedValue(new Error());
    const { container } = renderVisualizer();
    await waitFor(() =>
      expect(
        container.querySelector('button#visualizer-save')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Error saving the workflow!')
    ).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button#visualizer-save')!);
    await waitFor(() =>
      expect(
        WorkflowJobTemplateNodesAPI.associateCredentials
      ).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Error saving the workflow!')
    ).toBeInTheDocument();
  });

  test('Error shown to user when error thrown fetching workflow nodes', async () => {
    vi.mocked(WorkflowJobTemplatesAPI.readNodes).mockRejectedValue(new Error());
    renderVisualizer();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
