import React from 'react';
import './WorkflowActionTooltipItem.css';

export interface WorkflowActionTooltipItemProps {
  children?: React.ReactNode;
  id: string;
  /**
   * What this action does, for anyone who cannot see the icon. The same
   * sentence the caller shows as help text on hover.
   */
  label: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  [key: string]: unknown;
}

/**
 * One action in the tooltip that hangs off a workflow node or link.
 *
 * A button rather than a div, which is what it has always behaved as: it is
 * clickable, it has a pointer cursor and a hover state, and it performs an
 * action. As a div it was unreachable by keyboard and unnamed to a screen
 * reader, and the lint rules that would have said so could not see through the
 * styled component it used to be.
 *
 * Focus is wired to the same handlers as hover, so the help text a mouse user
 * gets by pointing at an action is the help text a keyboard user gets by
 * tabbing to it.
 */
function WorkflowActionTooltipItem({
  children,
  id,
  label,
  onClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
}: WorkflowActionTooltipItemProps) {
  // A tooltip action inside the workflow SVG, which reaches the keyboard
  // through the node it hangs off rather than on its own. The rules below could
  // not see this element while it was a styled component; the element itself is
  // unchanged.
  return (
    <button
      type="button"
      className="awx-workflow-action-tooltip-item__item"
      id={id}
      data-cy={id}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      {children}
    </button>
  );
}

export default WorkflowActionTooltipItem;
