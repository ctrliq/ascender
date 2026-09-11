import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import type {
  WorkflowAction,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type { Untyped } from 'types/api';
import React, { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

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

const LinkG = styled.g<{ $ignorePointerEvents?: Untyped }>`
  pointer-events: ${(props) => (props.$ignorePointerEvents ? 'none' : 'auto')};
`;

export interface VisualizerLinkProps {
  link: Untyped;
  updateLinkHelp: Untyped;
  readOnly: boolean;
  updateHelpText: Untyped;
  [key: string]: unknown;
}

function VisualizerLink({
  link,
  updateLinkHelp,
  readOnly,
  updateHelpText,
}: VisualizerLinkProps) {
  const { t } = useLingui();
  const ref = useRef<Untyped>(null);
  const [hovering, setHovering] = useState<boolean>(false);
  const [pathD, setPathD] = useState<string | null>();
  const [pathStroke, setPathStroke] = useState(
    'var(--pf-t--global--border--color--default)'
  );
  const [tooltipX, setTooltipX] = useState<number | undefined>();
  const [tooltipY, setTooltipY] = useState<number | undefined>();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  // A link is only drawn once the layout has placed both of its nodes,
  // which is what fills the positions in.
  const { addingLink, nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState & { nodePositions: NodePositions };

  const addNodeAction = (
    <WorkflowActionTooltipItem
      id="link-add-node"
      key="add"
      onClick={() => {
        updateHelpText(null);
        setHovering(false);
        dispatch({
          type: 'START_ADD_NODE',
          sourceNodeId: link.source.id,
          targetNodeId: link.target.id,
        });
      }}
      onMouseEnter={() =>
        updateHelpText(t`Add a new node between these two nodes`)
      }
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
            id="link-edit"
            key="edit"
            onClick={() => {
              updateHelpText(null);
              setHovering(false);
              dispatch({ type: 'SET_LINK_TO_EDIT', value: link });
            }}
            onMouseEnter={() => updateHelpText(t`Edit this link`)}
            onMouseLeave={() => updateHelpText(null)}
          >
            <PencilAltIcon />
          </WorkflowActionTooltipItem>,
          <WorkflowActionTooltipItem
            id="link-delete"
            key="delete"
            onClick={() => {
              updateHelpText(null);
              setHovering(false);
              dispatch({ type: 'START_DELETE_LINK', link });
            }}
            onMouseEnter={() => updateHelpText(t`Delete this link`)}
            onMouseLeave={() => updateHelpText(null)}
          >
            <TrashAltIcon />
          </WorkflowActionTooltipItem>,
        ];

  const handleLinkMouseEnter = () => {
    const startNode = document.getElementById('node-1');
    ref.current.parentNode.insertBefore(ref.current, startNode);
    setHovering(true);
  };

  const handleLinkMouseLeave = () => {
    ref.current.parentNode.prepend(ref.current);
    setHovering(false);
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
    setTooltipX((linePoints[0].x + linePoints[1].x) / 2);
    setTooltipY((linePoints[0].y + linePoints[1].y) / 2);
  }, [link, nodePositions]);

  return (
    <LinkG
      id={`link-${link.source.id}-${link.target.id}`}
      $ignorePointerEvents={addingLink}
      onMouseEnter={handleLinkMouseEnter}
      onMouseLeave={handleLinkMouseLeave}
      ref={ref}
    >
      <polygon
        style={{ fill: 'var(--pf-t--global--background--color--200)' }}
        id={`link-${link.source.id}-${link.target.id}-background`}
        opacity={hovering ? '1' : '0'}
        points={getLinkOverlayPoints(link, nodePositions)}
      />
      <path d={pathD ?? undefined} stroke={pathStroke} strokeWidth="2px" />
      <polygon
        id={`link-${link.source.id}-${link.target.id}-overlay`}
        onMouseEnter={() => updateLinkHelp(link)}
        onMouseLeave={() => updateLinkHelp(null)}
        opacity="0"
        points={getLinkOverlayPoints(link, nodePositions)}
      />
      {!readOnly && hovering && (
        <WorkflowActionTooltip
          actions={tooltipActions}
          pointX={tooltipX}
          pointY={tooltipY}
        />
      )}
    </LinkG>
  );
}

export default VisualizerLink;
