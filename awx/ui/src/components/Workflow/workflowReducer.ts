import type {
  Label,
  NodeTemplate,
  SummaryFieldRef,
  UnifiedJob,
  WorkflowJobTemplateNode,
} from 'types/api';
import type { NodePositions } from './WorkflowUtils';

export type { NodeTemplate };

/**
 * The prompt overrides a node carries into its run.
 *
 * Which of them a node has is decided by what its template asks for, so every
 * field is optional, and the index signature keeps the rest reachable.
 */
export interface PromptValues {
  credentials?: SummaryFieldRef[];
  /** What the node modal added to and removed from the template's defaults. */
  addedCredentials?: SummaryFieldRef[];
  removedCredentials?: SummaryFieldRef[];
  labels?: Label[];
  instance_groups?: SummaryFieldRef[];
  inventory?: SummaryFieldRef | null;
  execution_environment?: SummaryFieldRef | null;
  /** The survey answers and extra variables, as the prompt collected them. */
  extra_data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * What a template prompts for when it is launched, as far as a node reads it.
 *
 * Every ask_* flag says whether the launch form offers that field; defaults
 * holds what the template would use when the prompt leaves it alone.
 */
export interface LaunchConfig {
  defaults?: {
    credentials?: SummaryFieldRef[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * The condition a link can carry, which the api holds on the edge rather than
 * on either node: the parent outcome to evaluate on, the artifact the parent
 * produced with set_stats, and the comparison to make against it.
 */
export interface LinkCondition {
  trigger?: string;
  artifact_key?: string;
  operator?: string;
  expected_value?: string;
}

/** Which nodes each node is reached from, keyed by node id. */
export type LinkParentMapping = Record<number, number[]>;

/**
 * A node in the visualizer graph, as the reducer moves them about. Only the
 * fields the reducer itself reads or writes are named; the visualizer and the
 * node modals hang more off the same objects, which the index signature keeps
 * reachable.
 */
export interface WorkflowNode {
  id: number;
  originalNodeObject?: ApiWorkflowNode;
  /**
   * The template this node runs, which the visualiser attaches. It is partial
   * because the start node carries only a name and an approval node carries
   * the summary its parent node was listed with.
   */
  fullUnifiedJobTemplate?: NodeTemplate;
  isInvalidLinkTarget?: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  linkType?: string;
  linkCondition?: LinkCondition;
  /** The prompt overrides a node carries, shaped by the template it runs. */
  promptValues?: PromptValues;
  all_parents_must_converge?: boolean;
  max_retries?: number;
  identifier?: string;
  /** What the node's template prompts for, as its launch endpoint says. */
  launchConfig?: LaunchConfig;
  /** What the node already had, which a prompt's values are compared to. */
  originalNodeCredentials?: SummaryFieldRef[];
  originalNodeInstanceGroups?: SummaryFieldRef[];
  originalNodeLabels?: Label[];
  /** The node modal and the visualizer hang more off the same object. */
  [key: string]: unknown;
}

/**
 * The state as a modal sees it. A modal only renders while the thing it acts
 * on is set, which is what opening it means.
 */
export type WorkflowStateWith<K extends keyof WorkflowState> = WorkflowState & {
  [P in K]: NonNullable<WorkflowState[P]>;
};

/**
 * A workflow node as the API returns it, which is what GENERATE_NODES_AND_LINKS
 * is handed. It is a different shape from the chart node above: the reducer
 * builds the latter out of the former.
 */
export interface ApiWorkflowNode extends Partial<
  Omit<WorkflowJobTemplateNode, 'summary_fields' | 'all_parents_must_converge'>
> {
  id: number;
  /**
   * Every node the api sends lists what it leads to, empty where it leads
   * nowhere, which is what the reducer walks to build the chart's links.
   */
  success_nodes: number[];
  failure_nodes: number[];
  always_nodes: number[];
  all_parents_must_converge?: boolean | null;
  summary_fields?: {
    unified_job_template?: NodeTemplate;
    inventory?: SummaryFieldRef;
    execution_environment?: SummaryFieldRef;
    /**
     * The run this node produced, once the workflow has been launched. Its
     * status is wider than a job's: a project or inventory update answers
     * with never updated, ok, missing, none or updating as well.
     */
    job?: Omit<Partial<UnifiedJob>, 'status'> & { status?: string };
    [key: string]: unknown;
  };
  workflowMakerNodeId?: number;
  [key: string]: unknown;
}

/** What UPDATE_NODE carries: the values the node edit modal collected. */
export interface EditedWorkflowNode {
  nodeResource?: NodeTemplate;
  launchConfig?: LaunchConfig;
  promptValues?: PromptValues;
  all_parents_must_converge?: boolean;
  max_retries?: number;
  identifier?: string;
}

/**
 * What CREATE_NODE carries: the same values the node modal collects for an
 * edit, plus how the new node is linked to the one it was added from.
 */
export interface NewWorkflowNode extends EditedWorkflowNode {
  linkType?: string;
  linkCondition?: LinkCondition;
}

/** What REFRESH_NODE carries: the fields a re-read of the node can replace. */
export interface RefreshedWorkflowNode {
  /** The template this node runs, refreshed with what it was missing. */
  fullUnifiedJobTemplate?: NodeTemplate;
  originalNodeCredentials?: SummaryFieldRef[];
}

/** An edge between two nodes. */
export interface WorkflowLink {
  source: { id: number };
  target: { id: number };
  linkType?: string;
  linkCondition?: LinkCondition;
  isConvergenceLink?: boolean;
  [key: string]: unknown;
}

/** Everything initReducer sets up, which is the whole of the visualizer state. */
export interface WorkflowState {
  addLinkSourceNode: WorkflowNode | null;
  addLinkTargetNode: WorkflowNode | null;
  addNodeSource: number | null;
  addNodeTarget: number | null;
  addingLink: boolean;
  contentError: Error | null;
  defaultOrganization: number | null;
  isLoading: boolean;
  linkToDelete: WorkflowLink | null;
  linkToEdit: WorkflowLink | null;
  links: WorkflowLink[];
  nextNodeId: number;
  nodePositions: NodePositions | null;
  nodes: WorkflowNode[];
  nodeToDelete: WorkflowNode | null;
  nodeToEdit: WorkflowNode | null;
  nodeToView: WorkflowNode | null;
  showDeleteAllNodesModal: boolean;
  showLegend: boolean;
  showTools: boolean;
  showUnsavedChangesModal: boolean;
  unsavedChanges: boolean;
  [key: string]: unknown;
}

/**
 * Every action the visualizer dispatches, as a union discriminated on `type`.
 * A single flat shape would make every payload optional, which would then have
 * to be re-checked inside each case even though the dispatcher always supplies
 * it, so the payloads are declared per action instead.
 */
export type WorkflowAction =
  | {
      type: 'CREATE_LINK';
      linkType?: string;
      linkCondition?: LinkCondition;
    }
  | {
      type: 'UPDATE_LINK';
      linkType?: string;
      linkCondition?: LinkCondition;
    }
  | { type: 'CREATE_NODE'; node: NewWorkflowNode }
  | { type: 'UPDATE_NODE'; node: EditedWorkflowNode }
  | { type: 'REFRESH_NODE'; node: RefreshedWorkflowNode }
  | { type: 'SELECT_SOURCE_FOR_LINKING'; node: WorkflowNode }
  | { type: 'START_DELETE_LINK'; link: WorkflowLink }
  | { type: 'START_ADD_NODE'; sourceNodeId: number; targetNodeId?: number }
  | {
      type: 'GENERATE_NODES_AND_LINKS';
      nodes: ApiWorkflowNode[];
      startLabel?: string;
    }
  | { type: 'SET_ADD_LINK_TARGET_NODE'; value: WorkflowNode | null }
  | { type: 'SET_CONTENT_ERROR'; value: Error | null }
  | { type: 'SET_DEFAULT_ORGANIZATION'; value: number | null }
  | { type: 'SET_IS_LOADING'; value: boolean }
  | { type: 'SET_LINK_TO_DELETE'; value: WorkflowLink | null }
  | { type: 'SET_LINK_TO_EDIT'; value: WorkflowLink | null }
  | { type: 'SET_NODES'; value: WorkflowNode[] }
  | {
      type: 'SET_NODE_POSITIONS';
      value: NodePositions | null;
    }
  | { type: 'SET_NODE_TO_DELETE'; value: WorkflowNode | null }
  | { type: 'SET_NODE_TO_EDIT'; value: WorkflowNode | null }
  | { type: 'SET_NODE_TO_VIEW'; value: WorkflowNode | null }
  | { type: 'SET_SHOW_DELETE_ALL_NODES_MODAL'; value: boolean }
  | {
      type:
        | 'CANCEL_LINK'
        | 'CANCEL_LINK_MODAL'
        | 'CANCEL_NODE_MODAL'
        | 'DELETE_ALL_NODES'
        | 'DELETE_LINK'
        | 'DELETE_NODE'
        | 'RESET'
        | 'TOGGLE_DELETE_ALL_NODES_MODAL'
        | 'TOGGLE_LEGEND'
        | 'TOGGLE_TOOLS'
        | 'TOGGLE_UNSAVED_CHANGES_MODAL';
    };

export function initReducer(): WorkflowState {
  return {
    addLinkSourceNode: null,
    addLinkTargetNode: null,
    addNodeSource: null,
    addNodeTarget: null,
    addingLink: false,
    contentError: null,
    defaultOrganization: null,
    isLoading: true,
    linkToDelete: null,
    linkToEdit: null,
    links: [],
    nextNodeId: 0,
    nodePositions: null,
    nodes: [],
    nodeToDelete: null,
    nodeToEdit: null,
    nodeToView: null,
    showDeleteAllNodesModal: false,
    showLegend: false,
    showTools: false,
    showUnsavedChangesModal: false,
    unsavedChanges: false,
  };
}

export default function visualizerReducer(
  state: WorkflowState,
  action: WorkflowAction
): WorkflowState {
  switch (action.type) {
    case 'CREATE_LINK':
      return createLink(state, action.linkType, action.linkCondition);
    case 'CREATE_NODE':
      return createNode(state, action.node);
    case 'CANCEL_LINK':
    case 'CANCEL_LINK_MODAL':
      return cancelLink(state);
    case 'CANCEL_NODE_MODAL':
      return {
        ...state,
        addNodeSource: null,
        addNodeTarget: null,
        nodeToEdit: null,
      };
    case 'DELETE_ALL_NODES':
      return deleteAllNodes(state);
    case 'DELETE_LINK':
      return deleteLink(state);
    case 'DELETE_NODE':
      return deleteNode(state);
    case 'GENERATE_NODES_AND_LINKS':
      return generateNodesAndLinks(state, action.nodes, action.startLabel);
    case 'RESET':
      return initReducer();
    case 'SELECT_SOURCE_FOR_LINKING':
      return selectSourceForLinking(state, action.node);
    case 'SET_ADD_LINK_TARGET_NODE':
      return {
        ...state,
        addLinkTargetNode: action.value,
      };
    case 'SET_CONTENT_ERROR':
      return {
        ...state,
        contentError: action.value,
      };
    case 'SET_DEFAULT_ORGANIZATION':
      return {
        ...state,
        defaultOrganization: action.value,
      };
    case 'SET_IS_LOADING':
      return {
        ...state,
        isLoading: action.value,
      };
    case 'SET_LINK_TO_DELETE':
      return {
        ...state,
        linkToDelete: action.value,
      };
    case 'SET_LINK_TO_EDIT':
      return {
        ...state,
        linkToEdit: action.value,
      };
    case 'SET_NODES':
      return {
        ...state,
        nodes: action.value,
      };
    case 'SET_NODE_POSITIONS':
      return {
        ...state,
        nodePositions: action.value,
      };
    case 'SET_NODE_TO_DELETE':
      return {
        ...state,
        nodeToDelete: action.value,
      };
    case 'SET_NODE_TO_EDIT':
      return {
        ...state,
        nodeToEdit: action.value,
      };
    case 'SET_NODE_TO_VIEW':
      return {
        ...state,
        nodeToView: action.value,
      };
    case 'SET_SHOW_DELETE_ALL_NODES_MODAL':
      return {
        ...state,
        showDeleteAllNodesModal: action.value,
      };
    case 'START_ADD_NODE':
      return {
        ...state,
        addNodeSource: action.sourceNodeId,
        addNodeTarget: action.targetNodeId || null,
      };
    case 'START_DELETE_LINK':
      return startDeleteLink(state, action.link);
    case 'TOGGLE_DELETE_ALL_NODES_MODAL':
      return toggleDeleteAllNodesModal(state);
    case 'TOGGLE_LEGEND':
      return toggleLegend(state);
    case 'TOGGLE_TOOLS':
      return toggleTools(state);
    case 'TOGGLE_UNSAVED_CHANGES_MODAL':
      return toggleUnsavedChangesModal(state);
    case 'UPDATE_LINK':
      return updateLink(state, action.linkType, action.linkCondition);
    case 'UPDATE_NODE':
      return updateNode(state, action.node);
    case 'REFRESH_NODE':
      return refreshNode(state, action.node);
    default:
      // The union above covers every case, so this is only reachable from a
      // dispatch the type checker did not see, such as one out of a .js file.
      throw new Error(
        `Unrecognized action type: ${(action as WorkflowAction).type}`
      );
  }
}

function createLink(
  state: WorkflowState,
  linkType?: string,
  linkCondition?: LinkCondition
) {
  const { addLinkSourceNode, addLinkTargetNode, links, nodes } = state;

  // Both ends are picked before the link modal can be saved, so this only
  // guards against a stray dispatch rather than a reachable state.
  if (!addLinkSourceNode || !addLinkTargetNode) {
    return state;
  }

  const newLinks = [...links];
  const newNodes = [...nodes];

  newNodes.forEach((node) => {
    node.isInvalidLinkTarget = false;
  });

  newLinks.push({
    source: {
      id: addLinkSourceNode.id,
    },
    target: {
      id: addLinkTargetNode.id,
    },
    linkType,
    ...(linkType === 'condition' && { linkCondition }),
  });

  newLinks.forEach((link, index) => {
    if (link.source.id === 1 && link.target.id === addLinkTargetNode.id) {
      newLinks.splice(index, 1);
    }
  });

  return {
    ...state,
    addLinkSourceNode: null,
    addLinkTargetNode: null,
    addingLink: false,
    linkToEdit: null,
    links: newLinks,
    nodes: newNodes,
    unsavedChanges: true,
  };
}

function createNode(state: WorkflowState, node: NewWorkflowNode) {
  const { addNodeSource, addNodeTarget, links, nodes, nextNodeId } = state;

  // START_ADD_NODE sets the source before the add modal opens.
  if (addNodeSource === null) {
    return state;
  }

  const newNodes = [...nodes];
  const newLinks = [...links];

  newNodes.push({
    id: nextNodeId,
    fullUnifiedJobTemplate: node.nodeResource,
    isInvalidLinkTarget: false,
    promptValues: node.promptValues,
    all_parents_must_converge: node.all_parents_must_converge,
    max_retries: node.max_retries,
    identifier: node.identifier,
  });

  // Ensures that root nodes appear to always run
  // after "START"
  if (addNodeSource === 1) {
    node.linkType = 'always';
  }

  newLinks.push({
    source: {
      id: addNodeSource,
    },
    target: {
      id: nextNodeId,
    },
    linkType: node.linkType,
    ...(node.linkType === 'condition' && { linkCondition: node.linkCondition }),
  });

  if (addNodeTarget) {
    newLinks.forEach((linkToCompare) => {
      if (
        linkToCompare.source.id === addNodeSource &&
        linkToCompare.target.id === addNodeTarget
      ) {
        linkToCompare.source = {
          id: nextNodeId,
        };
      }
    });
  }

  return {
    ...state,
    addNodeSource: null,
    addNodeTarget: null,
    links: newLinks,
    nextNodeId: nextNodeId + 1,
    nodes: newNodes,
    unsavedChanges: true,
  };
}

function cancelLink(state: WorkflowState) {
  const { nodes } = state;
  const newNodes = [...nodes];

  newNodes.forEach((node) => {
    node.isInvalidLinkTarget = false;
  });

  return {
    ...state,
    addLinkSourceNode: null,
    addLinkTargetNode: null,
    addingLink: false,
    linkToEdit: null,
    nodes: newNodes,
  };
}

function deleteAllNodes(state: WorkflowState) {
  const { nodes } = state;
  return {
    ...state,
    addLinkSourceNode: null,
    addLinkTargetNode: null,
    addingLink: false,
    links: [],
    nodes: nodes.map((node: WorkflowNode) => {
      if (node.id !== 1) {
        node.isDeleted = true;
      }

      return node;
    }),
    showDeleteAllNodesModal: false,
    unsavedChanges: true,
  };
}

function deleteLink(state: WorkflowState) {
  const { links, linkToDelete } = state;

  // Set by START_DELETE_LINK, which is what opens the confirmation modal.
  if (!linkToDelete) {
    return state;
  }

  const newLinks = [...links];

  for (let i = newLinks.length; i--;) {
    const link = newLinks[i];

    if (
      link?.source.id === linkToDelete.source.id &&
      link?.target.id === linkToDelete.target.id
    ) {
      newLinks.splice(i, 1);
    }
  }

  if (!linkToDelete.isConvergenceLink) {
    // Add a new link from the start node to the orphaned node
    newLinks.push({
      source: {
        id: 1,
      },
      target: {
        id: linkToDelete.target.id,
      },
      linkType: 'always',
    });
  }

  return {
    ...state,
    links: newLinks,
    linkToDelete: null,
    unsavedChanges: true,
  };
}

function addLinksFromParentsToChildren(
  parents: number[],
  children: WorkflowNode[],
  newLinks: WorkflowLink[],
  linkParentMapping: LinkParentMapping
) {
  parents.forEach((parentId: number) => {
    children.forEach((child: WorkflowNode) => {
      if (parentId === 1) {
        // We only want to create a link from the start node to this node if it
        // doesn't have any other parents
        if (linkParentMapping[child.id]?.length === 1) {
          newLinks.push({
            source: {
              id: parentId,
            },
            target: {
              id: child.id,
            },
            linkType: 'always',
          });
        }
      } else if (!linkParentMapping[child.id]?.includes(parentId)) {
        newLinks.push({
          source: {
            id: parentId,
          },
          target: {
            id: child.id,
          },
          linkType: child.linkType,
          ...(child.linkType === 'condition' && {
            linkCondition: child.linkCondition,
          }),
        });
      }
    });
  });
}

function removeLinksFromDeletedNode(
  nodeId: number,
  newLinks: WorkflowLink[],
  linkParentMapping: LinkParentMapping,
  children: WorkflowNode[],
  nodeParents: number[]
) {
  for (let i = newLinks.length; i--;) {
    const link = newLinks[i];

    if (!link) {
      continue;
    }

    const parents = linkParentMapping[link.target.id] ?? [];
    parents.push(link.source.id);
    linkParentMapping[link.target.id] = parents;

    if (link.source.id === nodeId || link.target.id === nodeId) {
      if (link.source.id === nodeId) {
        children.push({
          id: link.target.id,
          linkType: link.linkType,
          linkCondition: link.linkCondition,
        });
      } else if (link.target.id === nodeId) {
        nodeParents.push(link.source.id);
      }
      newLinks.splice(i, 1);
    }
  }
}

function deleteNode(state: WorkflowState) {
  const { links, nodes, nodeToDelete } = state;

  // Set by SET_NODE_TO_DELETE, which is what opens the confirmation modal.
  if (!nodeToDelete) {
    return state;
  }

  const nodeId = nodeToDelete.id;
  const newNodes = [...nodes];
  const newLinks = [...links];

  const doomedNode = newNodes.find((node) => node.id === nodeToDelete.id);
  if (doomedNode) {
    doomedNode.isDeleted = true;
  }

  // Update the links
  const parents: number[] = [];
  const children: WorkflowNode[] = [];
  const linkParentMapping: LinkParentMapping = {};

  removeLinksFromDeletedNode(
    nodeId,
    newLinks,
    linkParentMapping,
    children,
    parents
  );

  addLinksFromParentsToChildren(parents, children, newLinks, linkParentMapping);

  return {
    ...state,
    links: newLinks,
    nodeToDelete: null,
    nodes: newNodes,
    unsavedChanges: true,
  };
}

/** Maps an id to another id, or to an index into the chart node array. */
type IdMapping = Record<number, number>;

/** What generateNodes hands generateNodesAndLinks, in the order it unpacks. */
type GeneratedNodes = [
  arrayOfNodesForChart: WorkflowNode[],
  allNodeIds: number[],
  nodeIdToChartNodeIdMapping: IdMapping,
  chartNodeIdToIndexMapping: IdMapping,
  nodeIdCounter: number,
];

function generateNodes(
  workflowNodes: ApiWorkflowNode[],
  startLabel = 'START'
): GeneratedNodes {
  const allNodeIds: number[] = [];
  const chartNodeIdToIndexMapping: IdMapping = {};
  const nodeIdToChartNodeIdMapping: IdMapping = {};
  let nodeIdCounter = 2;
  const arrayOfNodesForChart: WorkflowNode[] = [
    {
      id: 1,
      fullUnifiedJobTemplate: {
        name: startLabel,
      },
    },
  ];
  workflowNodes.forEach((node: ApiWorkflowNode) => {
    node.workflowMakerNodeId = nodeIdCounter;

    const nodeObj: WorkflowNode = {
      id: nodeIdCounter,
      originalNodeObject: node,
    };

    if (
      node.summary_fields?.unified_job_template?.unified_job_type ===
      'workflow_approval'
    ) {
      nodeObj.fullUnifiedJobTemplate = {
        ...node.summary_fields.unified_job_template,
        type: 'workflow_approval_template',
      };
    }

    arrayOfNodesForChart.push(nodeObj);
    allNodeIds.push(node.id);
    nodeIdToChartNodeIdMapping[node.id] = nodeIdCounter;
    chartNodeIdToIndexMapping[nodeIdCounter] = nodeIdCounter - 1;
    nodeIdCounter++;
  });

  return [
    arrayOfNodesForChart,
    allNodeIds,
    nodeIdToChartNodeIdMapping,
    chartNodeIdToIndexMapping,
    nodeIdCounter,
  ];
}

function generateLinks(
  workflowNodes: ApiWorkflowNode[],
  chartNodeIdToIndexMapping: IdMapping,
  nodeIdToChartNodeIdMapping: IdMapping,
  arrayOfNodesForChart: WorkflowNode[]
): [arrayOfLinksForChart: WorkflowLink[], nonRootNodeIds: number[]] {
  const arrayOfLinksForChart: WorkflowLink[] = [];
  const nonRootNodeIds: number[] = [];

  // generateNodes stamped workflowMakerNodeId on every node it walked, and
  // both functions walk the same array.
  const chartIndexOf = (nodeId?: number) =>
    chartNodeIdToIndexMapping[nodeId as number] as number;

  workflowNodes.forEach((node: ApiWorkflowNode) => {
    const sourceIndex = chartIndexOf(node.workflowMakerNodeId);
    node.success_nodes.forEach((nodeId: number) => {
      const targetIndex = chartIndexOf(nodeIdToChartNodeIdMapping[nodeId]);
      arrayOfLinksForChart.push({
        source: arrayOfNodesForChart[sourceIndex] as WorkflowNode,
        target: arrayOfNodesForChart[targetIndex] as WorkflowNode,
        linkType: 'success',
      });
      nonRootNodeIds.push(nodeId);
    });
    node.failure_nodes.forEach((nodeId: number) => {
      const targetIndex = chartIndexOf(nodeIdToChartNodeIdMapping[nodeId]);
      arrayOfLinksForChart.push({
        source: arrayOfNodesForChart[sourceIndex] as WorkflowNode,
        target: arrayOfNodesForChart[targetIndex] as WorkflowNode,
        linkType: 'failure',
      });
      nonRootNodeIds.push(nodeId);
    });
    node.always_nodes.forEach((nodeId: number) => {
      const targetIndex = chartIndexOf(nodeIdToChartNodeIdMapping[nodeId]);
      arrayOfLinksForChart.push({
        source: arrayOfNodesForChart[sourceIndex] as WorkflowNode,
        target: arrayOfNodesForChart[targetIndex] as WorkflowNode,
        linkType: 'always',
      });
      nonRootNodeIds.push(nodeId);
    });
    (node.condition_nodes || []).forEach((nodeId: number) => {
      const targetIndex = chartIndexOf(nodeIdToChartNodeIdMapping[nodeId]);
      const conditionEdge = (node.condition_edges || []).find(
        (edge) => edge.id === nodeId
      );
      arrayOfLinksForChart.push({
        source: arrayOfNodesForChart[sourceIndex] as WorkflowNode,
        target: arrayOfNodesForChart[targetIndex] as WorkflowNode,
        linkType: 'condition',
        linkCondition: conditionEdge && {
          trigger: conditionEdge.trigger,
          artifact_key: conditionEdge.artifact_key,
          operator: conditionEdge.operator,
          expected_value: conditionEdge.expected_value,
        },
      });
      nonRootNodeIds.push(nodeId);
    });
  });

  return [arrayOfLinksForChart, nonRootNodeIds];
}

function generateNodesAndLinks(
  state: WorkflowState,
  workflowNodes: ApiWorkflowNode[],
  startLabel = 'START'
) {
  const [
    arrayOfNodesForChart,
    allNodeIds,
    nodeIdToChartNodeIdMapping,
    chartNodeIdToIndexMapping,
    nodeIdCounter,
  ] = generateNodes(workflowNodes, startLabel);
  const [arrayOfLinksForChart, nonRootNodeIds] = generateLinks(
    workflowNodes,
    chartNodeIdToIndexMapping,
    nodeIdToChartNodeIdMapping,
    arrayOfNodesForChart
  );

  const uniqueNonRootNodeIds = Array.from(new Set(nonRootNodeIds));

  const rootNodes = allNodeIds.filter(
    (nodeId: number) => !uniqueNonRootNodeIds.includes(nodeId)
  );

  rootNodes.forEach((rootNodeId: number) => {
    const targetIndex = chartNodeIdToIndexMapping[
      nodeIdToChartNodeIdMapping[rootNodeId] as number
    ] as number;
    arrayOfLinksForChart.push({
      source: arrayOfNodesForChart[0] as WorkflowNode,
      target: arrayOfNodesForChart[targetIndex] as WorkflowNode,
      linkType: 'always',
    });
  });

  return {
    ...state,
    links: arrayOfLinksForChart,
    nodes: arrayOfNodesForChart,
    nextNodeId: nodeIdCounter,
  };
}

function selectSourceForLinking(
  state: WorkflowState,
  sourceNode: WorkflowNode
) {
  const { links, nodes } = state;
  const newNodes = [...nodes];
  const parentMap: Record<number, { parents: number[]; traversed: boolean }> =
    {};
  const invalidLinkTargetIds: number[] = [];
  // Find and mark any ancestors as disabled to prevent cycles
  links.forEach((link: WorkflowLink) => {
    // id=1 is our artificial root node so we don't care about that
    if (link.source.id === 1) {
      return;
    }
    if (link.source.id === sourceNode.id) {
      // Disables direct children from the add link process
      invalidLinkTargetIds.push(link.target.id);
    }
    if (!parentMap[link.target.id]) {
      parentMap[link.target.id] = {
        parents: [],
        traversed: false,
      };
    }
    parentMap[link.target.id]?.parents.push(link.source.id);
  });

  const getAncestors = (id: number) => {
    const entry = parentMap[id];
    if (entry && !entry.traversed) {
      entry.parents.forEach((parentId: number) => {
        invalidLinkTargetIds.push(parentId);
        getAncestors(parentId);
      });
      entry.traversed = true;
    }
  };

  getAncestors(sourceNode.id);

  // Filter out the duplicates
  invalidLinkTargetIds
    .filter((element, index, array) => index === array.indexOf(element))
    .forEach((ancestorId) => {
      newNodes.forEach((node) => {
        if (node.id === ancestorId) {
          node.isInvalidLinkTarget = true;
        }
      });
    });

  return {
    ...state,
    addLinkSourceNode: sourceNode,
    addingLink: true,
    nodes: newNodes,
  };
}

function startDeleteLink(state: WorkflowState, link: WorkflowLink) {
  const { links } = state;
  const parentMap: LinkParentMapping = {};
  links.forEach((existingLink: WorkflowLink) => {
    const parents = parentMap[existingLink.target.id] ?? [];
    parents.push(existingLink.source.id);
    parentMap[existingLink.target.id] = parents;
  });

  // The link being deleted is one of the links just walked, so its target is
  // always in the map.
  link.isConvergenceLink = (parentMap[link.target.id] as number[]).length > 1;

  return {
    ...state,
    linkToDelete: link,
  };
}

function toggleDeleteAllNodesModal(state: WorkflowState) {
  const { showDeleteAllNodesModal } = state;
  return {
    ...state,
    showDeleteAllNodesModal: !showDeleteAllNodesModal,
  };
}

function toggleLegend(state: WorkflowState) {
  const { showLegend } = state;
  return {
    ...state,
    showLegend: !showLegend,
  };
}

function toggleTools(state: WorkflowState) {
  const { showTools } = state;
  return {
    ...state,
    showTools: !showTools,
  };
}

function toggleUnsavedChangesModal(state: WorkflowState) {
  const { showUnsavedChangesModal } = state;
  return {
    ...state,
    showUnsavedChangesModal: !showUnsavedChangesModal,
  };
}

function updateLink(
  state: WorkflowState,
  linkType?: string,
  linkCondition?: LinkCondition
) {
  const { linkToEdit, links } = state;

  // Set by SET_LINK_TO_EDIT, which is what opens the link edit modal.
  if (!linkToEdit) {
    return state;
  }

  const newLinks = [...links];

  newLinks.forEach((link) => {
    if (
      link.source.id === linkToEdit.source.id &&
      link.target.id === linkToEdit.target.id
    ) {
      link.linkType = linkType;
      if (linkType === 'condition') {
        link.linkCondition = linkCondition;
      } else {
        delete link.linkCondition;
      }
    }
  });

  return {
    ...state,
    linkToEdit: null,
    links: newLinks,
    unsavedChanges: true,
  };
}

function updateNode(state: WorkflowState, editedNode: EditedWorkflowNode) {
  const { nodeToEdit, nodes } = state;
  const {
    nodeResource,
    launchConfig,
    promptValues,
    all_parents_must_converge,
    max_retries,
    identifier,
  } = editedNode;

  // Set by SET_NODE_TO_EDIT, which is what opens the node edit modal.
  if (!nodeToEdit) {
    return state;
  }

  const newNodes = [...nodes];

  const matchingNode = newNodes.find((node) => node.id === nodeToEdit.id);
  if (!matchingNode) {
    return state;
  }

  matchingNode.all_parents_must_converge = all_parents_must_converge;
  matchingNode.max_retries = max_retries;
  matchingNode.fullUnifiedJobTemplate = nodeResource;
  matchingNode.isEdited = true;
  matchingNode.launchConfig = launchConfig;
  matchingNode.identifier = identifier;

  if (promptValues) {
    matchingNode.promptValues = promptValues;
  } else {
    delete matchingNode.promptValues;
  }

  return {
    ...state,
    nodeToEdit: null,
    nodes: newNodes,
    unsavedChanges: true,
  };
}

function refreshNode(
  state: WorkflowState,
  refreshedNode: RefreshedWorkflowNode
) {
  const { nodeToView, nodes } = state;

  // Set by SET_NODE_TO_VIEW, which is what opens the node detail panel.
  if (!nodeToView) {
    return state;
  }

  const newNodes = [...nodes];

  const matchingNode = newNodes.find((node) => node.id === nodeToView.id);
  if (!matchingNode) {
    return state;
  }

  if (refreshedNode.fullUnifiedJobTemplate) {
    matchingNode.fullUnifiedJobTemplate = refreshedNode.fullUnifiedJobTemplate;
  }

  if (refreshedNode.originalNodeCredentials) {
    matchingNode.originalNodeCredentials =
      refreshedNode.originalNodeCredentials;
  }

  return {
    ...state,
    nodes: newNodes,
    nodeToView: matchingNode,
  };
}
