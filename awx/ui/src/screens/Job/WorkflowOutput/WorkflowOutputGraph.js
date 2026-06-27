import React, { useContext, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { WorkflowStateContext } from 'contexts/Workflow';
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
import WorkflowOutputLink from './WorkflowOutputLink';
import WorkflowOutputNode from './WorkflowOutputNode';

function WorkflowOutputGraph() {
  const [linkHelp, setLinkHelp] = useState();
  const [nodeHelp, setNodeHelp] = useState();
  const [zoomPercentage, setZoomPercentage] = useState(100);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const hasFitRef = useRef(false);
  const hasFocusedRunningRef = useRef(false);
  const [isPositioned, setIsPositioned] = useState(false);

  const { links, nodePositions, nodes, showLegend, showTools } =
    useContext(WorkflowStateContext);

  const zoom = (event) => {
    if (!event.transform) return;
    const translation = [event.transform.x, event.transform.y];
    d3.select(gRef.current).attr(
      'transform',
      `translate(${translation}) scale(${event.transform.k})`
    );
    setZoomPercentage(event.transform.k * 100);
  };

  const handlePan = (direction) => {
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

  const handleZoomChange = (newScale) => {
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

  const focusOnNode = (node) => {
    const nodeX = nodePositions[node.id].x;
    const nodeY = nodePositions[node.id].y - nodePositions[1].y;
    const svgRect = svgRef.current.getBoundingClientRect();
    const scale = 1;
    const tx = svgRect.width / 2 - (nodeX + wfConstants.nodeW / 2) * scale;
    const ty = svgRect.height / 2 - (nodeY + wfConstants.nodeH / 2) * scale;
    return d3.zoomIdentity.translate(tx, ty).scale(scale);
  };

  const findRunningNode = () =>
    nodes?.find(
      (n) =>
        n.id > 1 &&
        nodePositions?.[n.id] &&
        n?.originalNodeObject?.summary_fields?.job?.status === 'running'
    );

  const findFocusNode = () => {
    const running = findRunningNode();
    if (running) return { node: running, isRunning: true };

    const hasCarriedForward = nodes?.some(
      (n) => n.id > 1 && n?.originalNodeObject?.prior_run_succeeded
    );
    if (hasCarriedForward) {
      const rerunNode = nodes?.find(
        (n) =>
          n.id > 1 &&
          nodePositions?.[n.id] &&
          !n?.originalNodeObject?.prior_run_succeeded
      );
      if (rerunNode) return { node: rerunNode, isRunning: false };
    }

    return null;
  };

  // Initial positioning: center on running node if one exists, on the first
  // re-run node for a relaunch-from-failed, or fit all otherwise. The <g>
  // starts invisible and fades in after this runs so the user never sees the
  // graph at the wrong zoom level.
  useEffect(() => {
    if (hasFitRef.current || !nodePositions || !nodes || nodes.length < 2)
      return;
    try {
      const focus = findFocusNode();
      if (focus) {
        d3.select(svgRef.current).call(
          zoomRef.transform,
          focusOnNode(focus.node)
        );
        setZoomPercentage(100);
        if (focus.isRunning) hasFocusedRunningRef.current = true;
      } else {
        handleFitGraph();
      }
      hasFitRef.current = true;
      setIsPositioned(true);
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodePositions, nodes]);

  // If a node starts running after the initial positioning (e.g. via WebSocket),
  // smoothly transition to it.
  useEffect(() => {
    if (!hasFitRef.current || hasFocusedRunningRef.current) return;
    if (!nodePositions || !nodes) return;

    const runningNode = findRunningNode();
    if (!runningNode) return;
    hasFocusedRunningRef.current = true;

    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomRef.transform, focusOnNode(runningNode));
    setZoomPercentage(100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return (
    <>
      {(nodeHelp || linkHelp) && (
        <WorkflowHelp>
          {nodeHelp && <WorkflowNodeHelp node={nodeHelp} />}
          {linkHelp && <WorkflowLinkHelp link={linkHelp} />}
        </WorkflowHelp>
      )}
      <svg
        id="workflow-svg"
        ref={svgRef}
        css="flex: 1; width: 100%; background-color: var(--ascender-workflow-graph-bg); border: 1px solid var(--pf-v6-global--BorderColor--100); border-top: none;"
      >
        <rect width="100%" height="100%" opacity="0" />
        <g
          id="workflow-g"
          ref={gRef}
          style={{
            opacity: isPositioned ? 1 : 0,
            transition: 'opacity 0.3s ease-in',
          }}
        >
          {nodePositions && [
            links.map((link) => {
              if (
                nodePositions[link.source.id] &&
                nodePositions[link.target.id]
              ) {
                return (
                  <WorkflowOutputLink
                    key={`link-${link.source.id}-${link.target.id}`}
                    link={link}
                    mouseEnter={() => setLinkHelp(link)}
                    mouseLeave={() => setLinkHelp(null)}
                  />
                );
              }
              return null;
            }),
            <WorkflowStartNode key="start" showActionTooltip={false} />,
            nodes.map((node) => {
              if (node.id > 1 && nodePositions[node.id]) {
                return (
                  <WorkflowOutputNode
                    key={`node-${node.id}`}
                    mouseEnter={() => setNodeHelp(node)}
                    mouseLeave={() => setNodeHelp(null)}
                    node={node}
                  />
                );
              }
              return null;
            }),
          ]}
        </g>
      </svg>
      <div css="position: absolute; top: 75px;right: 20px;display: flex">
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
export default WorkflowOutputGraph;
