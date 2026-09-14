import React from 'react';
import './WorkflowActionTooltip.css';

export interface WorkflowActionTooltipProps {
  /** One element per action; the tooltip sizes itself from how many. */
  actions: React.ReactNode[];
  pointX: number;
  pointY: number;
  [key: string]: unknown;
}

function WorkflowActionTooltip({
  actions,
  pointX,
  pointY,
}: WorkflowActionTooltipProps) {
  const tipHeight = 25 * actions.length + 5 * actions.length - 1 + 10;
  return (
    <foreignObject
      x={pointX}
      y={Number(pointY) - tipHeight / 2}
      width="52"
      height={tipHeight}
    >
      <div className="ascender-workflow-action-tooltip__contents">
        <div className="ascender-workflow-action-tooltip__arrow">
          <div className="ascender-workflow-action-tooltip__arrow-outer" />
          <div className="ascender-workflow-action-tooltip__arrow-inner" />
        </div>
        <div className="ascender-workflow-action-tooltip__actions">{actions}</div>
      </div>
    </foreignObject>
  );
}

export default WorkflowActionTooltip;
