import { useState, useEffect, useReducer } from 'react';
import type {
  ChildrenSummary,
  ChildrenSummaryEntry,
  JobEventRecord,
} from 'types/api';

export type { ChildrenSummary, ChildrenSummaryEntry };

/** One line of a job's output. Named JobEventRecord where it is declared. */
export type JobEvent = JobEventRecord;

/** One event in the collapsible output tree, with the events nested under it. */
export interface JobEventNode {
  eventIndex: number;
  isCollapsed: boolean;
  children: JobEventNode[];
}

/**
 * Where a row sits in the tree: the node holding it, or, when that row has not
 * loaded yet, the counter the event there is expected to have.
 */
interface RowLookup {
  node: JobEventNode | null;
  expectedCounter?: number;
}

/** The output tree, as the reducer holds it between renders. */
export interface JobEventsState {
  /** The root level events, in counter order. */
  tree: JobEventNode[];
  /** Every event that has arrived, indexed by its counter. */
  events: Record<number, JobEvent>;
  /** A counter for each event uuid, so a parent can be found by uuid. */
  uuidMap: Record<string, number>;
  /** Events whose parent has not arrived yet, by the parent's uuid. */
  eventsWithoutParents: Record<string, JobEvent[]>;
  childrenSummary: Record<number, ChildrenSummaryEntry>;
  /** The parent a meta event belongs under, by the event's counter. */
  metaEventParentUuid: Record<number, string>;
  isAllCollapsed: boolean;
}

/** Something that changes the output tree. */
export type JobEventsAction =
  | { type: typeof ADD_EVENTS; events: JobEvent[] }
  | { type: typeof TOGGLE_COLLAPSE_ALL; isCollapsed: boolean }
  | { type: typeof TOGGLE_NODE_COLLAPSED; uuid: string }
  | { type: typeof CLEAR_EVENTS }
  | { type: typeof REBUILD_TREE }
  | {
      type: typeof SET_CHILDREN_SUMMARY;
      childrenSummary?: JobEventsState['childrenSummary'];
      metaEventParentUuid?: JobEventsState['metaEventParentUuid'];
    };

/** What the output screen gives the tree so it can fill its own gaps. */
export interface JobEventCallbacks {
  /** Answers null when the job has no event with that uuid. */
  fetchEventByUuid: (uuid: string) => Promise<JobEvent | null>;
  /**
   * Asks the job how many rows sit under each parent event, and whether it
   * has a tree at all: an old job, or one still being processed, has none.
   */
  fetchChildrenSummary: () => Promise<{ data: ChildrenSummary }>;
  setForceFlatMode: (isFlat: boolean) => void;
  setJobTreeReady: (isReady?: boolean) => void;
}

const initialState: JobEventsState = {
  // array of root level nodes (no parent_uuid)
  tree: [],
  // all events indexed by counter value
  events: {},
  // counter value indexed by uuid
  uuidMap: {},
  // events with parent events that aren't yet loaded.
  // arrays indexed by parent uuid
  eventsWithoutParents: {},
  // object in the form { counter: {rowNumber: n, numChildren: m}} for parent nodes
  childrenSummary: {},
  // parent_uuid's for "meta" events that need to be injected into the tree to
  // maintain tree integrity
  metaEventParentUuid: {},
  isAllCollapsed: false,
};
export const ADD_EVENTS = 'ADD_EVENTS';
export const TOGGLE_NODE_COLLAPSED = 'TOGGLE_NODE_COLLAPSED';
export const CLEAR_EVENTS = 'CLEAR_EVENTS';
export const REBUILD_TREE = 'REBUILD_TREE';
export const TOGGLE_COLLAPSE_ALL = 'TOGGLE_COLLAPSE_ALL';
export const SET_CHILDREN_SUMMARY = 'SET_CHILDREN_SUMMARY';

export default function useJobEvents(
  callbacks: JobEventCallbacks,
  jobId: number | string,
  isFlatMode: boolean
) {
  const [actionQueue, setActionQueue] = useState<JobEventsAction[]>([]);
  const enqueueAction = (action: JobEventsAction) => {
    setActionQueue((queue) => queue.concat(action));
  };
  const reducer = jobEventsReducer(callbacks, isFlatMode, enqueueAction);
  const [state, dispatch] = useReducer(reducer, initialState);
  useEffect(() => {
    setActionQueue((queue) => {
      const action = queue[0];
      if (!action) {
        return queue;
      }
      try {
        dispatch(action);
      } catch (e) {
        console.error(e); // eslint-disable-line no-console
      }
      return queue.slice(1);
    });
  }, [actionQueue]);

  useEffect(() => {
    if (isFlatMode) {
      callbacks.setJobTreeReady();
      return;
    }

    callbacks
      .fetchChildrenSummary()
      .then((result) => {
        const { event_processing_finished, is_tree } = result.data;
        if (event_processing_finished === false || is_tree === false) {
          callbacks.setForceFlatMode(true);
          callbacks.setJobTreeReady();
          return;
        }
        enqueueAction({
          type: SET_CHILDREN_SUMMARY,
          childrenSummary: result.data.children_summary,
          metaEventParentUuid: result.data.meta_event_nested_uuid,
        });
      })
      .catch(() => {
        callbacks.setForceFlatMode(true);
        callbacks.setJobTreeReady();
      });
  }, [jobId, isFlatMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    addEvents: (events: JobEvent[]) => dispatch({ type: ADD_EVENTS, events }),
    getNodeByUuid: (uuid: string) => getNodeByUuid(state, uuid),
    toggleNodeIsCollapsed: (uuid: string) =>
      dispatch({ type: TOGGLE_NODE_COLLAPSED, uuid }),
    toggleCollapseAll: (isCollapsed: boolean) =>
      dispatch({ type: TOGGLE_COLLAPSE_ALL, isCollapsed }),
    getEventForRow: (rowIndex: number) => getEventForRow(state, rowIndex),
    getNodeForRow: (rowIndex: number) => getNodeForRow(state, rowIndex),
    getTotalNumChildren: (uuid: string) => {
      const node = getNodeByUuid(state, uuid);
      return node ? getTotalNumChildren(node, state.childrenSummary) : 0;
    },
    getNumCollapsedEvents: () =>
      state.tree.reduce(
        (sum: number, node: JobEventNode) =>
          sum + getNumCollapsedChildren(node, state.childrenSummary),
        0
      ),
    getCounterForRow: (rowIndex: number) => getCounterForRow(state, rowIndex),
    getEvent: (eventIndex: number) => getEvent(state, eventIndex),
    clearLoadedEvents: () => dispatch({ type: CLEAR_EVENTS }),
    rebuildEventsTree: () => dispatch({ type: REBUILD_TREE }),
    isAllCollapsed: state.isAllCollapsed,
  };
}

export function jobEventsReducer(
  callbacks: JobEventCallbacks,
  isFlatMode: boolean,
  enqueueAction: (action: JobEventsAction) => void
) {
  return (state: JobEventsState, action: JobEventsAction): JobEventsState => {
    switch (action.type) {
      case ADD_EVENTS:
        return addEvents(state, action.events);
      case TOGGLE_COLLAPSE_ALL:
        return toggleCollapseAll(state, action.isCollapsed);
      case TOGGLE_NODE_COLLAPSED:
        return toggleNodeIsCollapsed(state, action.uuid);
      case CLEAR_EVENTS:
        return initialState;
      case REBUILD_TREE:
        return rebuildTree(state);
      case SET_CHILDREN_SUMMARY:
        callbacks.setJobTreeReady();
        return {
          ...state,
          childrenSummary: action.childrenSummary || {},
          metaEventParentUuid: action.metaEventParentUuid || {},
        };
      default:
        throw new Error(
          `Unrecognized action: ${(action as { type: string }).type}`
        );
    }
  };

  function addEvents(origState: JobEventsState, newEvents: JobEvent[]) {
    let state = {
      ...origState,
      events: { ...origState.events },
      tree: [...origState.tree],
    };
    const parentsToFetch: Record<string, boolean> = {};
    newEvents.forEach((event: JobEvent) => {
      if (
        typeof event.rowNumber !== 'number' ||
        Number.isNaN(event.rowNumber)
      ) {
        throw new Error('Cannot add event; missing rowNumber');
      }
      const eventIndex = event.counter;
      if (!event.parent_uuid && state.metaEventParentUuid[eventIndex]) {
        event.parent_uuid = state.metaEventParentUuid[eventIndex];
      }
      if (state.events[eventIndex]) {
        state.events[eventIndex] = event;
        state = _gatherEventsForNewParent(state, event.uuid);
        return;
      }
      if (!event.parent_uuid || isFlatMode) {
        state = _addRootLevelEvent(state, event);
        return;
      }

      const parentUuid = event.parent_uuid as string;
      const [nextState, isParentFound] = _addNestedLevelEvent(state, event);
      state = nextState;
      if (!isParentFound) {
        parentsToFetch[parentUuid] = true;
        state = _addEventWithoutParent(state, event);
      }
    });

    Object.keys(parentsToFetch).forEach(async (uuid) => {
      const parent = await callbacks.fetchEventByUuid(uuid);
      if (!parent) {
        return;
      }

      if (!state.childrenSummary || !state.childrenSummary[parent.counter]) {
        // eslint-disable-next-line no-console
        console.error('No row number found for ', parent.counter);
        return;
      }
      parent.rowNumber = state.childrenSummary[parent.counter]!.rowNumber;

      enqueueAction({
        type: ADD_EVENTS,
        events: [parent],
      });
    });

    return state;
  }

  function _addRootLevelEvent(state: JobEventsState, event: JobEvent) {
    const eventIndex = event.counter;
    const newNode = {
      eventIndex,
      isCollapsed: state.isAllCollapsed,
      children: [],
    };
    const index = state.tree.findIndex(
      (node: JobEventNode) => node.eventIndex > eventIndex
    );
    const updatedTree = [...state.tree];
    if (index === -1) {
      updatedTree.push(newNode);
    } else {
      updatedTree.splice(index, 0, newNode);
    }
    return _gatherEventsForNewParent(
      {
        ...state,
        events: { ...state.events, [eventIndex]: event },
        tree: updatedTree,
        uuidMap: {
          ...state.uuidMap,
          [event.uuid]: eventIndex,
        },
      },
      event.uuid
    );
  }

  function _addNestedLevelEvent(
    state: JobEventsState,
    event: JobEvent
  ): [JobEventsState, boolean] {
    const eventIndex = event.counter;
    const parent = getNodeByUuid(state, event.parent_uuid);
    if (!parent) {
      return [state, false];
    }
    const newNode = {
      eventIndex,
      isCollapsed: state.isAllCollapsed,
      children: [],
    };
    const index = parent.children.findIndex(
      (node: JobEventNode) => node.eventIndex >= eventIndex
    );
    if (index === -1) {
      state = updateNodeByUuid(
        state,
        event.parent_uuid as string,
        (node: JobEventNode) => {
          node.children.push(newNode);
          return node;
        }
      );
    } else {
      state = updateNodeByUuid(
        state,
        event.parent_uuid as string,
        (node: JobEventNode) => {
          node.children.splice(index, 0, newNode);
          return node;
        }
      );
    }
    state = _gatherEventsForNewParent(
      {
        ...state,
        events: {
          ...state.events,
          [eventIndex]: event,
        },
        uuidMap: {
          ...state.uuidMap,
          [event.uuid]: eventIndex,
        },
      },
      event.uuid
    );

    return [state, true];
  }

  function _addEventWithoutParent(state: JobEventsState, event: JobEvent) {
    // Only an event whose parent is missing reaches this.
    const parentUuid = event.parent_uuid as string;
    let eventsList;
    if (!state.eventsWithoutParents[parentUuid]) {
      eventsList = [event];
    } else {
      eventsList = state.eventsWithoutParents[parentUuid].concat(event);
    }

    return {
      ...state,
      eventsWithoutParents: {
        ...state.eventsWithoutParents,
        [parentUuid]: eventsList,
      },
    };
  }

  function _gatherEventsForNewParent(state: JobEventsState, uuid?: string) {
    const parentUuid = uuid as string;
    if (!state.eventsWithoutParents[parentUuid]) {
      return state;
    }

    const { [parentUuid]: newEvents, ...remaining } =
      state.eventsWithoutParents;
    return addEvents(
      {
        ...state,
        eventsWithoutParents: remaining,
      },
      newEvents ?? []
    );
  }

  function rebuildTree(state: JobEventsState) {
    const events = Object.values(state.events);
    return addEvents(initialState, events);
  }
}

function getEventForRow(state: JobEventsState, rowIndex: number) {
  const { node } = _getNodeForRow(state, rowIndex, state.tree);
  if (node) {
    return {
      node,
      event: state.events[node.eventIndex],
    };
  }
  return null;
}

// The children summary used to be threaded through here and dropped by the
// helper below, which takes the nodes to walk rather than a summary.
function getNodeForRow(state: JobEventsState, rowToFind: number) {
  const { node } = _getNodeForRow(state, rowToFind, state.tree);
  return node;
}

function getCounterForRow(state: JobEventsState, rowToFind: number) {
  const { node, expectedCounter } = _getNodeForRow(
    state,
    rowToFind,
    state.tree
  );

  if (node) {
    const event = state.events[node.eventIndex] as JobEvent;
    return event.counter;
  }
  return expectedCounter;
}

function _getNodeForRow(
  state: JobEventsState,
  rowToFind: number,
  nodes: JobEventNode[]
): RowLookup {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as JobEventNode;
    const event = state.events[node.eventIndex] as JobEvent;
    if (event.rowNumber === rowToFind) {
      return { node };
    }
    const totalNodeDescendants = getTotalNumChildren(
      node,
      state.childrenSummary
    );
    const numCollapsedChildren = getNumCollapsedChildren(
      node,
      state.childrenSummary
    );
    const nodeChildren = totalNodeDescendants - numCollapsedChildren;
    if ((event.rowNumber ?? 0) + nodeChildren >= rowToFind) {
      // requested row is in children/descendants
      return _getNodeInChildren(state, node, rowToFind);
    }
    rowToFind += numCollapsedChildren;

    const nextNode = nodes[i + 1];
    if (!nextNode) {
      continue;
    }
    const nextEvent = state.events[nextNode.eventIndex] as JobEvent;
    const lastChild = _getLastDescendantNode([node]) as JobEventNode;
    if ((nextEvent.rowNumber ?? 0) > rowToFind) {
      // requested row is not loaded; return best guess at counter number
      const lastChildEvent = state.events[lastChild.eventIndex] as JobEvent;
      const rowDiff = rowToFind - (lastChildEvent.rowNumber ?? 0);
      return {
        node: null,
        expectedCounter: lastChild.eventIndex + rowDiff,
      };
    }
  }

  const lastDescendant = _getLastDescendantNode(nodes);
  if (!lastDescendant) {
    return { node: null, expectedCounter: rowToFind };
  }

  const lastDescendantEvent = state.events[
    lastDescendant.eventIndex
  ] as JobEvent;
  const rowDiff = rowToFind - (lastDescendantEvent.rowNumber ?? 0);
  return {
    node: null,
    expectedCounter: lastDescendant.eventIndex + rowDiff,
  };
}

function _getNodeInChildren(
  state: JobEventsState,
  node: JobEventNode,
  rowToFind: number
): RowLookup {
  const event = state.events[node.eventIndex] as JobEvent;
  const firstChildNode = node.children[0];
  const firstChild = firstChildNode
    ? state.events[firstChildNode.eventIndex]
    : undefined;
  if (!firstChild || rowToFind < (firstChild.rowNumber ?? 0)) {
    const rowDiff = rowToFind - (event.rowNumber ?? 0);
    return {
      node: null,
      expectedCounter: event.counter + rowDiff,
    };
  }
  return _getNodeForRow(state, rowToFind, node.children);
}

function _getLastDescendantNode(nodes: JobEventNode[]): JobEventNode | null {
  let lastDescendant = nodes[nodes.length - 1] ?? null;
  let children = lastDescendant?.children ?? [];
  while (children.length) {
    lastDescendant = children[children.length - 1] as JobEventNode;
    children = lastDescendant.children;
  }
  return lastDescendant;
}

function getTotalNumChildren(
  node: JobEventNode,
  childrenSummary: JobEventsState['childrenSummary']
) {
  const summary = childrenSummary[node.eventIndex];
  if (summary) {
    return summary.numChildren;
  }

  let estimatedNumChildren = node.children.length;
  node.children.forEach((child: JobEventNode) => {
    estimatedNumChildren += getTotalNumChildren(child, childrenSummary);
  });
  return estimatedNumChildren;
}

function getNumCollapsedChildren(
  node: JobEventNode,
  childrenSummary: JobEventsState['childrenSummary']
) {
  if (node.isCollapsed) {
    return getTotalNumChildren(node, childrenSummary);
  }
  let sum = 0;
  node.children.forEach((child: JobEventNode) => {
    sum += getNumCollapsedChildren(child, childrenSummary);
  });
  return sum;
}

function toggleNodeIsCollapsed(state: JobEventsState, eventUuid: string) {
  return {
    ...updateNodeByUuid(state, eventUuid, (node: JobEventNode) => ({
      ...node,
      isCollapsed: !node.isCollapsed,
    })),
    isAllCollapsed: false,
  };
}

function toggleCollapseAll(state: JobEventsState, isAllCollapsed: boolean) {
  const newTree = state.tree.map((node: JobEventNode) =>
    _toggleNestedNodes(state.events, node, isAllCollapsed)
  );
  return { ...state, tree: newTree, isAllCollapsed };
}

function _toggleNestedNodes(
  events: JobEventsState['events'],
  node: JobEventNode,
  isCollapsed: boolean
): JobEventNode {
  const { parent_uuid, event_data, uuid } = events[node.eventIndex] as JobEvent;
  const { playbook_uuid } = (event_data ?? {}) as { playbook_uuid?: string };

  const eventShouldNotCollapse = uuid === playbook_uuid || !parent_uuid?.length;

  const children = node.children?.map((nestedNode: JobEventNode) =>
    _toggleNestedNodes(events, nestedNode, isCollapsed)
  );

  return {
    ...node,
    isCollapsed: eventShouldNotCollapse ? false : isCollapsed,
    children,
  };
}

function updateNodeByUuid(
  state: JobEventsState,
  uuid: string,
  update: (node: JobEventNode) => JobEventNode
) {
  if (!state.uuidMap[uuid]) {
    throw new Error(`Cannot update node; Event UUID not found ${uuid}`);
  }
  const index = state.uuidMap[uuid] as number;
  return {
    ...state,
    tree: _updateNodeByIndex(index, state.tree, update),
  };
}

function _updateNodeByIndex(
  target: number,
  nodeArray: JobEventNode[],
  update: (node: JobEventNode) => JobEventNode
): JobEventNode[] {
  const nextIndex = nodeArray.findIndex(
    (node: JobEventNode) => node.eventIndex > target
  );
  const targetIndex = nextIndex === -1 ? nodeArray.length - 1 : nextIndex - 1;
  // The caller has already found the uuid in the map, so the target is here.
  const targetNode = nodeArray[targetIndex] as JobEventNode;
  let updatedNode: JobEventNode;
  if (targetNode.eventIndex === target) {
    updatedNode = update({
      ...targetNode,
      children: [...targetNode.children],
    });
  } else {
    updatedNode = {
      ...targetNode,
      children: _updateNodeByIndex(target, targetNode.children, update),
    };
  }
  return [
    ...nodeArray.slice(0, targetIndex),
    updatedNode,
    ...nodeArray.slice(targetIndex + 1),
  ];
}

function getNodeByUuid(state: JobEventsState, uuid?: string) {
  if (!uuid || !state.uuidMap[uuid]) {
    return null;
  }

  const index = state.uuidMap[uuid] as number;
  return _getNodeByIndex(state.tree, index);
}

function _getNodeByIndex(
  arr: JobEventNode[],
  index: number
): JobEventNode | null {
  if (!arr.length) {
    return null;
  }
  const i = arr.findIndex((node: JobEventNode) => node.eventIndex >= index);
  if (i === -1) {
    const last = arr[arr.length - 1] as JobEventNode;
    return _getNodeByIndex(last.children, index);
  }
  const found = arr[i] as JobEventNode;
  if (found.eventIndex === index) {
    return found;
  }
  const previous = arr[i - 1];
  if (!previous) {
    return null;
  }
  return _getNodeByIndex(previous.children, index);
}

function getEvent(state: JobEventsState, eventIndex: number) {
  const event = state.events[eventIndex];
  if (event) {
    return event;
  }

  return null;
}
