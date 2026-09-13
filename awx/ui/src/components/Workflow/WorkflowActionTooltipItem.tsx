import React from 'react';
import './WorkflowActionTooltipItem.css';

export interface WorkflowActionTooltipItemProps {
  children?: React.ReactNode;
  id: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  [key: string]: unknown;
}

function WorkflowActionTooltipItem({
  children,
  id,
  onClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
}: WorkflowActionTooltipItemProps) {
  // A tooltip action inside the workflow SVG, which reaches the keyboard
  // through the node it hangs off rather than on its own. The rules below could
  // not see this element while it was a styled component; the element itself is
  // unchanged.
  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events,
       jsx-a11y/no-static-element-interactions */
    <div
      className="awx-workflow-action-tooltip-item__item"
      id={id}
      data-cy={id}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

export default WorkflowActionTooltipItem;
