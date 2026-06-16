import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { JobTemplatesAPI, WorkflowJobTemplateNodesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerNode from './VisualizerNode';

jest.mock('../../../api/models/JobTemplates');
jest.mock('../../../api/models/WorkflowJobTemplateNodes');

WorkflowJobTemplateNodesAPI.readCredentials.mockResolvedValue({
  data: {
    results: [],
  },
});

const nodeWithJT = {
  id: 2,
  fullUnifiedJobTemplate: {
    id: 77,
    name: 'Automation JT',
    type: 'job_template',
  },
};

const mockedContext = {
  addingLink: false,
  addLinkSourceNode: null,
  nodePositions: {
    1: {
      width: 72,
      height: 40,
      x: 0,
      y: 0,
    },
    2: {
      width: 180,
      height: 60,
      x: 282,
      y: 40,
    },
  },
  nodes: [nodeWithJT],
};

const dispatch = jest.fn();
const updateHelpText = jest.fn();
const updateNodeHelp = jest.fn();

// The NodeG container <g id="node-{id}"> drives hover/leave.
const nodeG = (id = 2) => document.querySelector(`#node-${id}`);
// The action tooltip is only rendered when hovering; its items carry the
// data-cy/id of each action (node-add, node-details, ...). Use the presence of
// an action item as the DOM proxy for "tooltip is open" and count the actions.
const tooltipItem = (id) => document.querySelector(`#${id}`);
const tooltipItemCount = () =>
  document.querySelectorAll(
    '#node-add, #node-details, #node-edit, #node-link, #node-delete'
  ).length;
const isTooltipOpen = () => tooltipItem('node-add') !== null;
// The node's content foreignObject (the one wrapping the resource name).
const nodeContentForeignObject = (id = 2) =>
  document.querySelector(`#node-${id}-name`).closest('foreignObject');

describe('VisualizerNode', () => {
  describe('Node with unified job template', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={mockedContext}>
            <svg>
              <VisualizerNode
                node={nodeWithJT}
                readOnly={false}
                updateHelpText={updateHelpText}
                updateNodeHelp={updateNodeHelp}
              />
            </svg>
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('Displays unified job template name inside node', () => {
      expect(document.querySelector('#node-2-name')).toHaveTextContent(
        'Automation JT'
      );
    });

    test('Displays action tooltip on hover and updates help text on hover', () => {
      expect(isTooltipOpen()).toBe(false);
      fireEvent.mouseEnter(nodeG());
      expect(isTooltipOpen()).toBe(true);
      expect(tooltipItemCount()).toBe(5);
      fireEvent.mouseLeave(nodeG());
      expect(isTooltipOpen()).toBe(false);
      fireEvent.mouseEnter(nodeContentForeignObject());
      expect(updateNodeHelp).toHaveBeenCalledWith(nodeWithJT);
      fireEvent.mouseLeave(nodeContentForeignObject());
      expect(updateNodeHelp).toHaveBeenCalledWith(null);
    });

    test('Add tooltip action hover/click updates help text and dispatches properly', () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.mouseEnter(tooltipItem('node-add'));
      expect(updateHelpText).toHaveBeenCalledWith('Add a new node');
      fireEvent.mouseLeave(tooltipItem('node-add'));
      expect(updateHelpText).toHaveBeenCalledWith(null);
      // RTL's mouseLeave bubbles to the node <g> (React derives onMouseLeave
      // from mouseout), closing the tooltip; re-hover to reopen before click.
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-add'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'START_ADD_NODE',
        sourceNodeId: 2,
      });
      expect(isTooltipOpen()).toBe(false);
    });

    test('Edit tooltip action hover/click updates help text and dispatches properly', async () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.mouseEnter(tooltipItem('node-edit'));
      expect(updateHelpText).toHaveBeenCalledWith('Edit this node');
      fireEvent.mouseLeave(tooltipItem('node-edit'));
      expect(updateHelpText).toHaveBeenCalledWith(null);
      // RTL's mouseLeave bubbles to the node <g> (React derives onMouseLeave
      // from mouseout), closing the tooltip; re-hover to reopen before click.
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-edit'));
      await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
      expect(dispatch.mock.calls).toEqual([
        [
          {
            type: 'SET_NODES',
            value: [nodeWithJT],
          },
        ],
        [
          {
            type: 'SET_NODE_TO_EDIT',
            value: nodeWithJT,
          },
        ],
      ]);
      expect(isTooltipOpen()).toBe(false);
    });

    test('Details tooltip action hover/click updates help text and dispatches properly', async () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.mouseEnter(tooltipItem('node-details'));
      expect(updateHelpText).toHaveBeenCalledWith('View node details');
      fireEvent.mouseLeave(tooltipItem('node-details'));
      expect(updateHelpText).toHaveBeenCalledWith(null);
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-details'));
      await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
      expect(dispatch.mock.calls).toEqual([
        [
          {
            type: 'SET_NODES',
            value: [nodeWithJT],
          },
        ],
        [
          {
            type: 'SET_NODE_TO_VIEW',
            value: nodeWithJT,
          },
        ],
      ]);
      expect(isTooltipOpen()).toBe(false);
    });

    test('Link tooltip action hover/click updates help text and dispatches properly', () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.mouseEnter(tooltipItem('node-link'));
      expect(updateHelpText).toHaveBeenCalledWith('Link to an available node');
      fireEvent.mouseLeave(tooltipItem('node-link'));
      expect(updateHelpText).toHaveBeenCalledWith(null);
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-link'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SELECT_SOURCE_FOR_LINKING',
        node: nodeWithJT,
      });
      expect(isTooltipOpen()).toBe(false);
    });

    test('Delete tooltip action hover/click updates help text and dispatches properly', () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.mouseEnter(tooltipItem('node-delete'));
      expect(updateHelpText).toHaveBeenCalledWith('Delete this node');
      fireEvent.mouseLeave(tooltipItem('node-delete'));
      expect(updateHelpText).toHaveBeenCalledWith(null);
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-delete'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_NODE_TO_DELETE',
        value: nodeWithJT,
      });
      expect(isTooltipOpen()).toBe(false);
    });
  });

  describe('Node actions while adding a new link', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={{
              ...mockedContext,
              addingLink: true,
              addLinkSourceNode: 323,
            }}
          >
            <svg>
              <VisualizerNode
                onMouseOver={() => {}}
                node={nodeWithJT}
                readOnly={false}
                updateHelpText={updateHelpText}
                updateNodeHelp={updateNodeHelp}
              />
            </svg>
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('Displays correct help text when hovering over node while adding link', () => {
      expect(isTooltipOpen()).toBe(false);
      fireEvent.mouseEnter(nodeG());
      expect(isTooltipOpen()).toBe(false);
      expect(updateHelpText).toHaveBeenCalledWith(
        'Click to create a new link to this node.'
      );
      fireEvent.mouseLeave(nodeG());
      expect(isTooltipOpen()).toBe(false);
      expect(updateHelpText).toHaveBeenCalledWith(null);
    });

    test('Dispatches properly when node is clicked', () => {
      fireEvent.click(nodeContentForeignObject());
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_ADD_LINK_TARGET_NODE',
        value: nodeWithJT,
      });
    });
  });

  describe('Node without unified job template', () => {
    test('Displays DELETED text inside node when unified job template is missing', () => {
      renderWithContexts(
        <svg>
          <WorkflowStateContext.Provider value={mockedContext}>
            <VisualizerNode
              node={{
                id: 2,
              }}
              readOnly={false}
              updateHelpText={() => {}}
              updateNodeHelp={() => {}}
            />
          </WorkflowStateContext.Provider>
        </svg>
      );
      expect(document.querySelector('#node-2-name')).toHaveTextContent(
        'DELETED'
      );
    });
  });

  describe('Node with empty string alias', () => {
    test('Displays unified job template name inside node', () => {
      renderWithContexts(
        <svg>
          <WorkflowStateContext.Provider value={mockedContext}>
            <VisualizerNode
              node={{
                id: 2,
                identifier: '',
                fullUnifiedJobTemplate: {
                  name: 'foobar',
                },
              }}
              readOnly={false}
              updateHelpText={() => {}}
              updateNodeHelp={() => {}}
            />
          </WorkflowStateContext.Provider>
        </svg>
      );
      expect(document.querySelector('#node-2-name')).toHaveTextContent(
        'foobar'
      );
    });
  });

  describe('Node should display convergence label', () => {
    test('Should display ALL convergence label', async () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={mockedContext}>
            <svg>
              <VisualizerNode
                node={{
                  id: 2,
                  originalNodeObject: {
                    all_parents_must_converge: true,
                    always_nodes: [],
                    created: '2020-11-19T21:47:55.278081Z',
                    diff_mode: null,
                    extra_data: {},
                    failure_nodes: [],
                    id: 49,
                    identifier: 'f03b62c5-40f8-49e4-97c3-5bb20c91ec91',
                    inventory: null,
                    job_tags: null,
                    job_type: null,
                    limit: null,
                    modified: '2020-11-19T21:47:55.278156Z',
                    related: {
                      credentials:
                        '/api/v2/workflow_job_template_nodes/49/credentials/',
                    },
                    scm_branch: null,
                    skip_tags: null,
                    success_nodes: [],
                    summary_fields: {
                      workflow_job_template: { id: 15 },
                      unified_job_template: {
                        id: 7,
                        description: '',
                        name: 'Example',
                        unified_job_type: 'job',
                      },
                    },
                    type: 'workflow_job_template_node',
                    unified_job_template: 7,
                    url: '/api/v2/workflow_job_template_nodes/49/',
                    verbosity: null,
                    workflowMakerNodeId: 2,
                    workflow_job_template: 15,
                  },
                }}
                readOnly={false}
                updateHelpText={updateHelpText}
                updateNodeHelp={updateNodeHelp}
              />
            </svg>
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      const label = document.querySelector('[data-cy="convergence-label"]');
      expect(label).not.toBeNull();
      expect(label).toHaveTextContent('ALL');
    });
  });

  describe('Node without full unified job template', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider value={mockedContext}>
            <svg>
              <VisualizerNode
                node={{
                  id: 2,
                  originalNodeObject: {
                    all_parents_must_converge: false,
                    always_nodes: [],
                    created: '2020-11-19T21:47:55.278081Z',
                    diff_mode: null,
                    extra_data: {},
                    failure_nodes: [],
                    id: 49,
                    identifier: 'f03b62c5-40f8-49e4-97c3-5bb20c91ec91',
                    inventory: null,
                    job_tags: null,
                    job_type: null,
                    limit: null,
                    modified: '2020-11-19T21:47:55.278156Z',
                    related: {
                      credentials:
                        '/api/v2/workflow_job_template_nodes/49/credentials/',
                    },
                    scm_branch: null,
                    skip_tags: null,
                    success_nodes: [],
                    summary_fields: {
                      workflow_job_template: { id: 15 },
                      unified_job_template: {
                        id: 7,
                        description: '',
                        name: 'Example',
                        unified_job_type: 'job',
                      },
                    },
                    type: 'workflow_job_template_node',
                    unified_job_template: 7,
                    url: '/api/v2/workflow_job_template_nodes/49/',
                    verbosity: null,
                    workflowMakerNodeId: 2,
                    workflow_job_template: 15,
                  },
                }}
                readOnly={false}
                updateHelpText={updateHelpText}
                updateNodeHelp={updateNodeHelp}
              />
            </svg>
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('Attempts to fetch full unified job template on view', async () => {
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-details'));
      await waitFor(() =>
        expect(JobTemplatesAPI.readDetail).toHaveBeenCalledWith(7)
      );
      expect(
        document.querySelector('[data-cy="convergence-label"]')
      ).toBeNull();
    });

    test('Displays error fetching full unified job template', async () => {
      JobTemplatesAPI.readDetail.mockRejectedValueOnce(
        new Error({
          response: {
            config: {
              method: 'get',
              url: '/api/v2/job_templates/7',
            },
            data: 'An error occurred',
            status: 403,
          },
        })
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-details'));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      );
    });

    test('Attempts to fetch credentials on view', async () => {
      JobTemplatesAPI.readDetail.mockResolvedValueOnce({
        data: {
          id: 7,
          name: 'Example',
        },
      });
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-details'));
      await waitFor(() =>
        expect(
          WorkflowJobTemplateNodesAPI.readCredentials
        ).toHaveBeenCalledWith(49)
      );
    });

    test('Displays error fetching credentials', async () => {
      JobTemplatesAPI.readDetail.mockResolvedValueOnce({
        data: {
          id: 7,
          name: 'Example',
        },
      });
      WorkflowJobTemplateNodesAPI.readCredentials.mockRejectedValueOnce(
        new Error({
          response: {
            config: {
              method: 'get',
              url: '/api/v2/workflow_job_template_nodes/49/credentials',
            },
            data: 'An error occurred',
            status: 403,
          },
        })
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.mouseEnter(nodeG());
      fireEvent.click(tooltipItem('node-details'));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      );
    });
  });
});
