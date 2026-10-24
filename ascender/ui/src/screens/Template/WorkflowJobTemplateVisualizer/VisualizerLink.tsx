import type {
  WorkflowLink,
  WorkflowAction,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import React, { useContext, useEffect, useRef, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { PencilAltIcon, PlusIcon, TrashAltIcon } from '@patternfly/react-icons';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import {
  generateLine,
  getLinePoints,
  getLinkOverlayPoints,
} from 'components/Workflow/WorkflowUtils';
import {
  WorkflowActionTooltip,
  WorkflowActionTooltipItem,
} from 'components/Workflow';
import './VisualizerLink.css';

export interface VisualizerLinkProps {
  /**
   * Tells the graph the pointer is on this link, or has left it. The graph
   * holds which link that is, and hands it back as isHovered below.
   */
  onRaise?: (link: WorkflowLink | null) => void;
  /**
   * Draws the open menu rather than the line.
   *
   * Svg has no z-index and paints in document order, and every node is drawn
   * after every link, so a menu drawn with its line came up underneath whatever
   * node it hangs over. The graph draws the hovered link a second time after
   * the nodes, for the menu alone: drawing the whole link there put its line
   * over the nodes instead.
   */
  isMenuLayer?: boolean;
  link: WorkflowLink;
  /** Tells the visualizer which link is hovered, or null when none is. */
  updateLinkHelp: (link: WorkflowLink | null) => void;
  /**
   * Whether this is the link the pointer is on. The graph holds it, because it
   * is the same link the graph raises and there can only be one: held here, a
   * link that never saw the pointer leave kept its menu open under a neighbour
   * that had just opened its own.
   */
  isHovered?: boolean;
  readOnly: boolean;
  updateHelpText: (helpText: React.ReactNode) => void;
  [key: string]: unknown;
}

function VisualizerLink({
  link,
  updateLinkHelp,
  readOnly,
  updateHelpText,
  isHovered = false,
  isMenuLayer = false,
  onRaise = () => {},
}: VisualizerLinkProps) {
  const { t } = useLingui();
  const ref = useRef<SVGGElement>(null);
  const [pathStroke, setPathStroke] = useState(
    'var(--pf-t--global--border--color--default)'
  );
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  // A link is only drawn once the layout has placed both of its nodes,
  // which is what fills the positions in.
  const { addingLink, nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState & { nodePositions: NodePositions };

  /*
   * The line and the menu's anchor follow from the positions, so they are
   * worked out while drawing. Set from an effect they were a paint late: the
   * first frame of an opened menu stood at the corner of the graph, and the
   * line was missing, until the effect ran and drew again.
   */
  const linePoints = getLinePoints(link, nodePositions);
  const pathD = generateLine(linePoints);
  const tooltipX = (linePoints[0].x + linePoints[1].x) / 2;
  const tooltipY = (linePoints[0].y + linePoints[1].y) / 2;

  const addNodeAction = (
    <WorkflowActionTooltipItem
      label={t`Add Node Between`}
      id="link-add-node"
      key="add"
      onClick={() => {
        updateHelpText(null);
        onRaise(null);
        dispatch({
          type: 'START_ADD_NODE',
          sourceNodeId: link.source.id,
          targetNodeId: link.target.id,
        });
      }}
      onMouseEnter={() => updateHelpText(t`Add Node Between`)}
      onMouseLeave={() => updateHelpText(null)}
    >
      <PlusIcon />
    </WorkflowActionTooltipItem>
  );

  const tooltipActions =
    link.source.id === 1
      ? [addNodeAction]
      : [
          addNodeAction,
          <WorkflowActionTooltipItem
            label={t`Edit Link`}
            id="link-edit"
            key="edit"
            onClick={() => {
              updateHelpText(null);
              onRaise(null);
              dispatch({ type: 'SET_LINK_TO_EDIT', value: link });
            }}
            onMouseEnter={() => updateHelpText(t`Edit Link`)}
            onMouseLeave={() => updateHelpText(null)}
          >
            <PencilAltIcon />
          </WorkflowActionTooltipItem>,
          <WorkflowActionTooltipItem
            label={t`Delete Link`}
            id="link-delete"
            key="delete"
            onClick={() => {
              updateHelpText(null);
              onRaise(null);
              dispatch({ type: 'START_DELETE_LINK', link });
            }}
            onMouseEnter={() => updateHelpText(t`Delete Link`)}
            onMouseLeave={() => updateHelpText(null)}
          >
            <TrashAltIcon />
          </WorkflowActionTooltipItem>,
        ];

  // Raising is the graph's to do. Moving the group here went behind React's
  // back, and the render the graph schedules could put it straight back,
  // leaving this link's action menu under its neighbours. Telling the graph is
  // also what opens the menu, since the graph hands isHovered back down.
  const handleLinkMouseEnter = () => {
    onRaise(link);
  };

  const handleLinkMouseLeave = () => {
    onRaise(null);
  };

  useEffect(() => {
    if (link.linkType === 'failure') {
      setPathStroke('var(--pf-t--global--color--status--danger--default)');
    }
    if (link.linkType === 'success') {
      setPathStroke('var(--pf-t--global--color--status--success--default)');
    }
    if (link.linkType === 'always') {
      setPathStroke('var(--pf-t--global--color--brand--default)');
    }
    if (link.linkType === 'condition') {
      setPathStroke('var(--pf-t--global--color--status--warning--default)');
    }
  }, [link.linkType]);

  if (isMenuLayer) {
    return (
      <g
        id={`link-${link.source.id}-${link.target.id}-menu`}
        onMouseEnter={handleLinkMouseEnter}
        onMouseLeave={handleLinkMouseLeave}
      >
        {!readOnly && isHovered && (
          <WorkflowActionTooltip
            actions={tooltipActions}
            pointX={tooltipX}
            pointY={tooltipY}
          />
        )}
      </g>
    );
  }

  return (
    <g
      id={`link-${link.source.id}-${link.target.id}`}
      className={
        addingLink ? 'ascender-visualizer-link__link-g--inert' : undefined
      }
      onMouseEnter={handleLinkMouseEnter}
      onMouseLeave={handleLinkMouseLeave}
      ref={ref}
    >
      {/* The band that used to sit here was filled opaque and painted over
          every link crossing the hovered one, which is what cut the lines. It
          was already switched off in the dark and default themes, where the
          fill was overridden to nothing, so it had been doing nothing in half
          the product. The hover has its own feedback: the help panel, and in
          the visualizer the action menu. */}
      <path d={pathD ?? undefined} stroke={pathStroke} strokeWidth="2px" />
      <polygon
        id={`link-${link.source.id}-${link.target.id}-overlay`}
        onMouseEnter={() => updateLinkHelp(link)}
        onMouseLeave={() => updateLinkHelp(null)}
        opacity="0"
        points={getLinkOverlayPoints(link, nodePositions)}
      />
    </g>
  );
}

export default VisualizerLink;
