import React from 'react';
import type {
  WorkflowAction,
  WorkflowState,
} from 'components/Workflow/workflowReducer';

/**
 * The visualiser's reducer, shared with every node, link and control it draws.
 *
 * Both default to null rather than to a state: nothing outside the visualiser
 * renders these components, so a consumer that finds null is a component
 * mounted outside the provider, and the null is what says so.
 */
export const WorkflowDispatchContext =
  React.createContext<React.Dispatch<WorkflowAction> | null>(null);

export const WorkflowStateContext = React.createContext<WorkflowState | null>(
  null
);
