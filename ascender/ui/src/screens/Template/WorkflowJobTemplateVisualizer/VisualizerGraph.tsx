import type {
  WorkflowAction,
  WorkflowLink,
  WorkflowNode,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
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
import './VisualizerGraph.css';

export interface VisualizerGraphProps {
  readOnly: boolean;
  [key: string]: unknown;
}

/**
 * What names a link, since a link carries no id of its own.
 *
 * The graph raises the hovered link so its menu is not painted over, and hands
 * the same link back down as the one that is hovered: both ask this, so a link
 * cannot be raised and closed, or open and behind.
 */
const linkId = (link: WorkflowLink) => `${link.source.id}-${link.target.id}`;

function VisualizerGraph({ readOnly }: VisualizerGraphProps) {
  const [helpText, setHelpText] = useState<React.ReactNode>(null);
  const [linkHelp, setLinkHelp] = useState<WorkflowLink | null>();
  const [nodeHelp, setNodeHelp] = useState<WorkflowNode | null>();
  /**
   * The node to draw last. Svg paints in document order and has no z-index, so
   * the action menu a node opens on hover is covered by every node rendered
   * after it. Ordering the list is the declarative way to lift it: React moves
   * the one group, and a later render cannot put it back the way it undid the
   * appendChild this replaced.
   */
  const [raisedNode, setRaisedNode] = useState<WorkflowNode | null>(null);
  /** The same, for links: the one the pointer is on is drawn last. */
  const [raisedLink, setRaisedLink] = useState<WorkflowLink | null>(null);
  const [zoomPercentage, setZoomPercentage] = useState(100);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  // Both elements exist for the whole life of the graph, so d3 reaches them
  // through these rather than each call guarding the ref again.
  const svgEl = () => svgRef.current as SVGSVGElement;
  const gEl = () => gRef.current as SVGGElement;
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

  const drawPotentialLinkToCursor = (e: React.MouseEvent) => {
    const currentTransform = d3.zoomTransform(gEl());
    const rect = (e.target as SVGElement).getBoundingClientRect();
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

  const zoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    if (!event.transform) return;
    const translation = [event.transform.x, event.transform.y];
    d3.select(gEl()).attr(
      'transform',
      `translate(${translation}) scale(${event.transform.k})`
    );
    setZoomPercentage(event.transform.k * 100);
  };

  const handlePan = (direction: string) => {
    const transform = d3.zoomTransform(svgEl());
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
    d3.select(svgEl()).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(xPos, yPos).scale(currentScale)
    );
  };
  const handlePanToMiddle = () => {
    const svgBoundingClientRect = svgEl().getBoundingClientRect();
    d3.select(svgEl()).call(
      zoomRef.transform,
      d3.zoomIdentity
        .translate(0, svgBoundingClientRect.height / 2 - 30)
        .scale(1)
    );
    setZoomPercentage(100);
  };

  const handleZoomChange = (newScale: number) => {
    const svgBoundingClientRect = svgEl().getBoundingClientRect();
    const currentScaleAndOffset = d3.zoomTransform(svgEl());
    const [translateX, translateY] = getTranslatePointsForZoom(
      svgBoundingClientRect,
      currentScaleAndOffset,
      newScale
    );
    d3.select(svgEl()).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(newScale)
    );
    setZoomPercentage(newScale * 100);
  };
  const handleFitGraph = () => {
    const { k: currentScale } = d3.zoomTransform(svgEl());
    const gBoundingClientRect = gEl().getBoundingClientRect();

    const gBBoxDimensions = gEl().getBBox();

    const svgBoundingClientRect = svgEl().getBoundingClientRect();
    const [scaleToFit, yTranslate] = getScaleAndOffsetToFit(
      gBoundingClientRect,
      svgBoundingClientRect,
      gBBoxDimensions,
      currentScale
    );
    d3.select(svgEl()).call(
      zoomRef.transform,
      d3.zoomIdentity.translate(0, yTranslate).scale(scaleToFit)
    );
    setZoomPercentage(scaleToFit * 100);
  };

  const zoomRef = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 2])
    .on('zoom', zoom);

  useEffect(() => {
    try {
      d3.select(svgEl()).call(zoomRef);
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

  /*
   * The link the pointer is on, taken from the current links rather than from
   * what was raised: a re-read hands back new link objects, and this has to be
   * the one being rendered.
   */
  const hoveredLink = raisedLink
    ? links.find((link: WorkflowLink) => linkId(link) === linkId(raisedLink))
    : null;

  /**
   * Draws one link, or nothing when the layout has not placed both its nodes.
   *
   * Args:
   *     link: The link to draw.
   *     isMenuLayer: Whether this is the pass that draws the open menu, which
   *         the graph makes after the nodes, rather than the line.
   *
   * Returns:
   *     The link element, or null while either end is unplaced.
   */
  function renderLink(link: WorkflowLink, isMenuLayer = false) {
    if (!nodePositions[link.source.id] || !nodePositions[link.target.id]) {
      return null;
    }
    const id = `link-${link.source.id}-${link.target.id}`;
    return (
      <VisualizerLink
        key={isMenuLayer ? `${id}-menu` : id}
        link={link}
        isHovered={isMenuLayer}
        isMenuLayer={isMenuLayer}
        readOnly={readOnly}
        updateLinkHelp={(newLinkHelp) => setLinkHelp(newLinkHelp)}
        updateHelpText={(newHelpText) => setHelpText(newHelpText)}
        onRaise={setRaisedLink}
      />
    );
  }

  return (
    <>
      {(helpText || nodeHelp || linkHelp) && (
        <WorkflowHelp>
          {helpText && <p>{helpText}</p>}
          {nodeHelp && <WorkflowNodeHelp node={nodeHelp} />}
          {linkHelp && <WorkflowLinkHelp link={linkHelp} />}
        </WorkflowHelp>
      )}
      <svg
        className="ascender-visualizer-graph__workflow-svg"
        id="workflow-svg"
        ref={svgRef}
      >
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
            links.map((link: WorkflowLink) => renderLink(link)),
            [...nodes]
              .sort((a: WorkflowNode, b: WorkflowNode) => {
                if (a.id === raisedNode?.id) return 1;
                if (b.id === raisedNode?.id) return -1;
                return 0;
              })
              .map((node: WorkflowNode) => {
                if (node.id > 1 && nodePositions[node.id] && !node.isDeleted) {
                  return (
                    <VisualizerNode
                      key={`node-${node.id}`}
                      node={node}
                      readOnly={readOnly}
                      updateHelpText={(newHelpText) => setHelpText(newHelpText)}
                      updateNodeHelp={(newNodeHelp) => setNodeHelp(newNodeHelp)}
                      onRaise={setRaisedNode}
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
            /*
             * The open menu last of all, and only the menu. Svg paints in
             * document order and every node is drawn after every link, so a
             * menu drawn with its line came up underneath whichever node it
             * hangs over; drawing the whole link here instead put its line over
             * the nodes, which is just as wrong the other way round.
             */
            hoveredLink ? renderLink(hoveredLink, true) : null,
          ]}
          {addingLink && (
            <polyline
              className="ascender-visualizer-graph__potential-link"
              id="workflow-potentialLink"
              markerEnd="url(#workflow-triangle)"
              style={{ stroke: 'var(--pf-t--global--border--color--default)' }}
              strokeDasharray="5,5"
              strokeWidth="2"
            />
          )}
        </g>
      </svg>
      <div className="ascender-visualizer-graph__position-top">
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
