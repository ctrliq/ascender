import React, { useContext, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { PlusIcon } from '@patternfly/react-icons';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import WorkflowActionTooltip from './WorkflowActionTooltip';
import WorkflowActionTooltipItem from './WorkflowActionTooltipItem';
import type { WorkflowAction, WorkflowState } from './workflowReducer';
import './WorkflowStartNode.css';

export interface WorkflowStartNodeProps {
  onUpdateHelpText?: (helpText: React.ReactNode) => void;
  showActionTooltip: boolean;
  [key: string]: unknown;
}

function WorkflowStartNode({
  onUpdateHelpText = () => {},
  showActionTooltip,
}: WorkflowStartNodeProps) {
  const { t } = useLingui();
  const ref = useRef<SVGGraphicsElement>(null);
  const startNodeRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const { addingLink, nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState;

  if (!nodePositions || !nodePositions[1]) {
    return null;
  }

  const handleNodeMouseEnter = () => {
    if (ref.current) {
      ref.current.parentNode?.appendChild(ref.current);
    }
    setHovering(true);
  };

  return (
    <g
      id="node-1"
      className={
        addingLink ? 'ascender-workflow-start-node__start-g--inert' : undefined
      }
      onMouseEnter={handleNodeMouseEnter}
      onMouseLeave={() => setHovering(false)}
      ref={ref}
      transform={`translate(${nodePositions[1].x},0)`}
    >
      <foreignObject
        className="ascender-workflow-start-node__foreign-object"
        height="1"
        width="1"
        y="10"
        style={{ overflow: 'visible' }}
      >
        <div
          className="ascender-workflow-start-node__div"
          ref={startNodeRef as React.Ref<HTMLDivElement>}
        >
          {t`START`}
        </div>
      </foreignObject>
      {showActionTooltip && hovering && (
        <WorkflowActionTooltip
          actions={[
            <WorkflowActionTooltipItem
              label={t`Add a new node`}
              id="node-add"
              key="add"
              onMouseEnter={() => onUpdateHelpText(t`Add a new node`)}
              onMouseLeave={() => onUpdateHelpText(null)}
              onClick={() => {
                onUpdateHelpText(null);
                setHovering(false);
                dispatch({ type: 'START_ADD_NODE', sourceNodeId: 1 });
              }}
            >
              <PlusIcon />
            </WorkflowActionTooltipItem>,
          ]}
          pointX={startNodeRef.current?.offsetWidth ?? 0}
          pointY={(startNodeRef.current?.offsetHeight ?? 0) / 2 + 10}
        />
      )}
    </g>
  );
}

export default WorkflowStartNode;
