import React, { useContext, useEffect, useRef, useState } from 'react';
import { WorkflowStateContext } from 'contexts/Workflow';
import {
  generateLine,
  getLinePoints,
  getLinkOverlayPoints,
} from 'components/Workflow/WorkflowUtils';

function WorkflowOutputLink({ link, mouseEnter, mouseLeave }) {
  const ref = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [pathD, setPathD] = useState();
  const [pathStroke, setPathStroke] = useState("var(--pf-t--global--border--color--default)");
  const { nodePositions } = useContext(WorkflowStateContext);

  const handleLinkMouseEnter = () => {
    ref.current.parentNode.appendChild(ref.current);
    setHovering(true);
    mouseEnter();
  };

  const handleLinkMouseLeave = () => {
    ref.current.parentNode.prepend(ref.current);
    setHovering(null);
    mouseLeave();
  };

  useEffect(() => {
    if (link.linkType === 'failure') {
      setPathStroke("var(--pf-t--global--color--status--danger--default)");
    }
    if (link.linkType === 'success') {
      setPathStroke("var(--pf-t--global--color--status--success--default)");
    }
    if (link.linkType === 'always') {
      setPathStroke("var(--pf-t--global--color--brand--default)");
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
        style={{ fill: "var(--pf-t--global--background--color--200)" }}
        id={`link-${link.source.id}-${link.target.id}-overlay`}
        opacity={hovering ? '1' : '0'}
        points={getLinkOverlayPoints(link, nodePositions)}
      />
      <path d={pathD} stroke={pathStroke} strokeWidth="2px" />
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
