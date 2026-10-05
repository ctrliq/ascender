import type {
  WorkflowLink,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { WorkflowStateContext } from 'contexts/Workflow';
import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import {
  generateLine,
  getLinePoints,
  getLinkOverlayPoints,
} from 'components/Workflow/WorkflowUtils';

export interface WorkflowOutputLinkProps {
  link: WorkflowLink;
  mouseEnter: () => void;
  mouseLeave: () => void;
  [key: string]: unknown;
}

function WorkflowOutputLink({
  link,
  mouseEnter,
  mouseLeave,
}: WorkflowOutputLinkProps) {
  const ref = useRef<SVGPolygonElement>(null);
  const [pathD, setPathD] = useState<string | null>();
  const [pathStroke, setPathStroke] = useState(
    'var(--pf-t--global--border--color--default)'
  );
  // Asserted because a link is only rendered once the graph has laid itself
  // out, which is what fills the positions in.
  const { nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState & { nodePositions: NodePositions };

  // Nothing is drawn on hover here any more, so there is nothing to raise: the
  // group used to be moved to the end of its parent to put an opaque band over
  // its neighbours, and that band is what cut the lines it covered.
  const handleLinkMouseEnter = () => {
    mouseEnter();
  };

  const handleLinkMouseLeave = () => {
    mouseLeave();
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

  useEffect(() => {
    const linePoints = getLinePoints(link, nodePositions);
    setPathD(generateLine(linePoints));
  }, [link, nodePositions]);

  return (
    <g
      ref={ref}
      id={`link-${link.source.id}-${link.target.id}`}
      onMouseEnter={handleLinkMouseEnter}
      onMouseLeave={handleLinkMouseLeave}
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
        onMouseEnter={() => mouseEnter()}
        onMouseLeave={() => mouseLeave()}
        opacity="0"
        points={getLinkOverlayPoints(link, nodePositions)}
      />
    </g>
  );
}

export default WorkflowOutputLink;
