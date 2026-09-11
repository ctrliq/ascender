import type {
  WorkflowAction,
  WorkflowNode,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import type { Untyped } from 'types/api';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import * as d3 from 'd3';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import {
  getScaleAndOffsetToFit,
  constants as wfConstants,
  getTranslatePointsForZoom,
} from 'components/Workflow/WorkflowUtils';
import {
  WorkflowHelp,
  WorkflowLegend,
  WorkflowLinkHelp,
  WorkflowNodeHelp,
  WorkflowStartNode,
  WorkflowTools,
} from 'components/Workflow';
import VisualizerLink from './VisualizerLink';
import VisualizerNode from './VisualizerNode';

const PotentialLink = styled.polyline`
  pointer-events: none;
`;
const WorkflowSVG = styled.svg`
  background-color: var(--ascender-workflow-graph-bg);
  border: 1px solid var(--pf-v6-global--BorderColor--100);
  border-top: none;
  display: flex;
  height: 100%;
`;
export interface VisualizerGraphProps {
  readOnly: boolean;
  [key: string]: unknown;
}

function VisualizerGraph({ readOnly }: VisualizerGraphProps) {
  const [helpText, setHelpText] = useState<Untyped>(null);
  const [linkHelp, setLinkHelp] = useState<Untyped>();
  const [nodeHelp, setNodeHelp] = useState<Untyped>();
  const [zoomPercentage, setZoomPercentage] = useState(100);
  // d3 reaches into both of these, and its selection generics fight the
  // element types react-dom gives a ref, so they stay untyped for now.
  const svgRef = useRef<Untyped>(null);
  const gRef = useRef<Untyped>(null);
  const {
    addLinkSourceNode,
    addingLink,
    links,
    nodePositions,
    nodes,
    showLegend,
    showTools,
    // The graph only draws once the layout has run, which is what fills in
    // the positions and what a link drag needs before it can start.
  } = useContext(WorkflowStateContext) as WorkflowState & {
    nodePositions: NodePositions;
    addLinkSourceNode: WorkflowNode;
  };
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;

  const drawPotentialLinkToNode = (node: WorkflowNode) => {
    if (node.id !== addLinkSourceNode.id) {
      const sourceNodeX = (
        nodePositions[addLinkSourceNode.id] as NodePositions[number]
      ).x;
      const sourceNodeY =
        (nodePositions[addLinkSourceNode.id] as NodePositions[number]).y -
        (nodePositions[1] as NodePositions[number]).y;
      const targetNodeX = (nodePositions[node.id] as NodePositions[number]).x;
      const targetNodeY =
        (nodePositions[node.id] as NodePositions[number]).y -
        (nodePositions[1] as NodePositions[number]).y;
      const startX = sourceNodeX + wfConstants.nodeW;
      const startY = sourceNodeY + wfConstants.nodeH / 2;
      const finishX = targetNodeX;
      const finishY = targetNodeY + wfConstants.nodeH / 2;
      d3.select('#workflow-potentialLink')
        .attr('points', `${startX},${startY} ${finishX},${finishY}`)
        .raise();
    }
  };
  const handleBackgroundClick = () => {
    setHelpText(null);
    dispatch({ type: 'CANCEL_LINK' });
  };

  const drawPotentialLinkToCursor = (e: Untyped) => {
    const currentTransform = d3.zoomTransform(d3.select(gRef.current).node());
    const rect = e.target.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const sourceNodeX = (
      nodePositions[addLinkSourceNode.id] as NodePositions[number]
    ).x;
    const sourceNodeY =
      (nodePositions[addLinkSourceNode.id] as NodePositions[number]).y -
      (nodePositions[1] as NodePositions[number]).y;
    const startX = sourceNodeX + wfConstants.nodeW;
    const startY = sourceNodeY + wfConstants.nodeH / 2;
    d3.select('#workflow-potentialLink')
      .attr(
        'points',
        `${startX},${startY} ${
          mouseX / currentTransform.k - currentTransform.x / currentTransform.k
        },${
          mouseY / currentTransform.k - currentTransform.y / currentTransform.k
        }`
      )
      .raise();
  };

  const zoom = (event: Untyped) => {
    if (!event.transform) return;
    const translation = [event.transform.x, event.transform.y];
    d3.select(gRef.current).attr(
      'transform',
      `translate(${translation}) scale(${event.transform.k})`
    );
    setZoomPercentage(event.transform.k * 100);
  };

  const handlePan = (direction: Untyped) => {
    const transform = d3.zoomTransform(d3.select(svgRef.current).node());
    let { x: xPos, y: yPos } = transform;
    const { k: currentScale } = transform;
    switch (direction) {
      case 'up':
        yPos -= 50;
        break;
      case 'down':
        yPos += 50;
        break;
      case 'left':
        xPos -= 50;
        break;
      case 'right':
        xPos += 50;
        break;
      default:
        break;
    }
    d3.select(svgRef.current).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(xPos, yPos).scale(currentScale)
    );
  };
  const handlePanToMiddle = () => {
    const svgBoundingClientRect = svgRef.current.getBoundingClientRect();
    d3.select(svgRef.current).call(
      zoomRef.transform,
      d3.zoomIdentity
        .translate(0, svgBoundingClientRect.height / 2 - 30)
        .scale(1)
    );
    setZoomPercentage(100);
  };

  const handleZoomChange = (newScale: Untyped) => {
    const svgBoundingClientRect = svgRef.current.getBoundingClientRect();
    const currentScaleAndOffset = d3.zoomTransform(
      d3.select(svgRef.current).node()
    );
    const [translateX, translateY] = getTranslatePointsForZoom(
      svgBoundingClientRect,
      currentScaleAndOffset,
      newScale
    );
    d3.select(svgRef.current).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(newScale)
    );
    setZoomPercentage(newScale * 100);
  };
  const handleFitGraph = () => {
    const { k: currentScale } = d3.zoomTransform(
      d3.select(svgRef.current).node()
    );
    const gBoundingClientRect = d3
      .select(gRef.current)
      .node()
      .getBoundingClientRect();

    const gBBoxDimensions = d3.select(gRef.current).node().getBBox();

    const svgBoundingClientRect = svgRef.current.getBoundingClientRect();
    const [scaleToFit, yTranslate] = getScaleAndOffsetToFit(
      gBoundingClientRect,
      svgBoundingClientRect,
      gBBoxDimensions,
      currentScale
    );
    d3.select(svgRef.current).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(0, yTranslate).scale(scaleToFit)
    );
    setZoomPercentage(scaleToFit * 100);
  };

  const zoomRef = d3.zoom().scaleExtent([0.1, 2]).on('zoom', zoom);

  useEffect(() => {
    try {
      d3.select(svgRef.current).call(zoomRef);
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') throw e;
    }
  }, [zoomRef]);

  useEffect(() => {
    try {
      handleFitGraph();
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {(helpText || nodeHelp || linkHelp) && (
        <WorkflowHelp>
          {helpText && <p>{helpText}</p>}
          {nodeHelp && <WorkflowNodeHelp node={nodeHelp} />}
          {linkHelp && <WorkflowLinkHelp link={linkHelp} />}
        </WorkflowHelp>
      )}
      <WorkflowSVG id="workflow-svg" ref={svgRef}>
        <defs>
          <marker
            className="WorkflowChart-noPointerEvents"
            id="workflow-triangle"
            markerHeight="6"
            markerUnits="strokeWidth"
            markerWidth="6"
            orient="auto"
            refX="10"
            viewBox="0 -5 10 10"
          >
            <path
              d="M0,-5L10,0L0,5"
              style={{ fill: 'var(--pf-t--global--border--color--default)' }}
            />
          </marker>
        </defs>
        <rect
          height="100%"
          id="workflow-background"
          opacity="0"
          width="100%"
          {...(addingLink && {
            onMouseMove: (e) => drawPotentialLinkToCursor(e),
            onMouseOver: () =>
              setHelpText(
                t`Click an available node to create a new link.  Click outside the graph to cancel.`
              ),
            onMouseOut: () => setHelpText(null),
            onClick: () => handleBackgroundClick(),
          })}
        />
        <g id="workflow-g" ref={gRef}>
          {nodePositions && [
            links.map((link: Untyped) => {
              if (
                nodePositions[link.source.id] &&
                nodePositions[link.target.id]
              ) {
                return (
                  <VisualizerLink
                    key={`link-${link.source.id}-${link.target.id}`}
                    link={link}
                    readOnly={readOnly}
                    updateLinkHelp={(newLinkHelp: Untyped) =>
                      setLinkHelp(newLinkHelp)
                    }
                    updateHelpText={(newHelpText: Untyped) =>
                      setHelpText(newHelpText)
                    }
                  />
                );
              }
              return null;
            }),
            nodes.map((node: WorkflowNode) => {
              if (node.id > 1 && nodePositions[node.id] && !node.isDeleted) {
                return (
                  <VisualizerNode
                    key={`node-${node.id}`}
                    node={node}
                    readOnly={readOnly}
                    updateHelpText={(newHelpText: Untyped) =>
                      setHelpText(newHelpText)
                    }
                    updateNodeHelp={(newNodeHelp: Untyped) =>
                      setNodeHelp(newNodeHelp)
                    }
                    {...(addingLink && {
                      onMouseOver: () => drawPotentialLinkToNode(node),
                    })}
                  />
                );
              }
              return null;
            }),
            <WorkflowStartNode
              key="start"
              showActionTooltip={!readOnly}
              onUpdateHelpText={setHelpText}
              readOnly={readOnly}
            />,
          ]}
          {addingLink && (
            <PotentialLink
              id="workflow-potentialLink"
              markerEnd="url(#workflow-triangle)"
              style={{ stroke: 'var(--pf-t--global--border--color--default)' }}
              strokeDasharray="5,5"
              strokeWidth="2"
            />
          )}
        </g>
      </WorkflowSVG>
      <div css="position: absolute; top: 75px;right: 20px;display: flex;">
        {showTools && (
          <WorkflowTools
            onFitGraph={handleFitGraph}
            onPan={handlePan}
            onPanToMiddle={handlePanToMiddle}
            onZoomChange={handleZoomChange}
            zoomPercentage={zoomPercentage}
          />
        )}
        {showLegend && <WorkflowLegend />}
      </div>
    </>
  );
}
export default VisualizerGraph;
