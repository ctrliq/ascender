import type {
  WorkflowLink,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type { Untyped } from 'types/api';
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
  mouseEnter: Untyped;
  mouseLeave: Untyped;
  [key: string]: unknown;
}

function WorkflowOutputLink({
  link,
  mouseEnter,
  mouseLeave,
}: WorkflowOutputLinkProps) {
  const ref = useRef<Untyped>(null);
  const [hovering, setHovering] = useState<boolean>(false);
  const [pathD, setPathD] = useState<string | null>();
  const [pathStroke, setPathStroke] = useState(
    'var(--pf-t--global--border--color--default)'
  );
  // Asserted because a link is only rendered once the graph has laid itself
  // out, which is what fills the positions in.
  const { nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState & { nodePositions: NodePositions };

  const handleLinkMouseEnter = () => {
    ref.current.parentNode.appendChild(ref.current);
    setHovering(true);
    mouseEnter();
  };

  const handleLinkMouseLeave = () => {
    ref.current.parentNode.prepend(ref.current);
    setHovering(false);
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
      <polygon
        style={{ fill: 'var(--pf-t--global--background--color--200)' }}
        id={`link-${link.source.id}-${link.target.id}-overlay`}
        opacity={hovering ? '1' : '0'}
        points={getLinkOverlayPoints(link, nodePositions)}
      />
      <path d={pathD ?? undefined} stroke={pathStroke} strokeWidth="2px" />
      <polygon
        onMouseEnter={() => mouseEnter()}
        onMouseLeave={() => mouseLeave()}
        opacity="0"
        points={getLinkOverlayPoints(link, nodePositions)}
      />
    </g>
  );
}

export default WorkflowOutputLink;
