import * as d3 from 'd3';
import * as dagre from '@dagrejs/dagre';
import type { WorkflowLink, WorkflowNode } from './workflowReducer';

/** Where dagre laid one node out, keyed by the node's id. */
export type NodePositions = Record<
  number,
  { x: number; y: number; width: number; height: number }
>;

/** A point on a link's path, in the coordinates the svg draws in. */
export interface LinkPoint {
  x: number;
  y: number;
}

// The graph is drawn relative to the root node, which dagre lays out at id 1.
const normalizeY = (nodePositions: NodePositions, y: number) =>
  y - (nodePositions[1] as NodePositions[number]).y;

export const constants = {
  nodeW: 180,
  nodeH: 60,
  rootW: 72,
  rootH: 40,
};

/** A box the graph is measured against, which is all these need of a rect. */
interface Box {
  width: number;
  height: number;
}

/** How the graph is currently scaled and where it has been panned to. */
interface ScaleAndOffset {
  k: number;
  x: number;
  y: number;
}

export function getScaleAndOffsetToFit(
  gBoundingClientRect: Box,
  svgBoundingClientRect: Box,
  gBBoxDimensions: { y: number },
  currentScale: number
): [number, number] {
  gBoundingClientRect.height /= currentScale;
  gBoundingClientRect.width /= currentScale;

  // For some reason the root width needs to be added?
  gBoundingClientRect.width += constants.rootW;

  const scaleNeededForMaxHeight =
    svgBoundingClientRect.height / gBoundingClientRect.height;
  const scaleNeededForMaxWidth =
    svgBoundingClientRect.width / gBoundingClientRect.width;
  const lowerScale = Math.min(scaleNeededForMaxHeight, scaleNeededForMaxWidth);

  let scaleToFit;
  let yTranslate;
  if (lowerScale < 0.1 || lowerScale > 2) {
    scaleToFit = lowerScale < 0.1 ? 0.1 : 2;
    yTranslate =
      svgBoundingClientRect.height / 2 - (constants.nodeH * scaleToFit) / 2;
  } else {
    scaleToFit = Math.floor(lowerScale * 1000) / 1000;
    yTranslate =
      (svgBoundingClientRect.height - gBoundingClientRect.height * scaleToFit) /
        2 -
      (gBBoxDimensions.y / currentScale) * scaleToFit;
  }

  return [scaleToFit, yTranslate];
}

export function generateLine(points: LinkPoint[]) {
  const line = d3
    .line<LinkPoint>()
    .x((d) => d.x)
    .y((d) => d.y);

  return line(points);
}

// A pair rather than a list: every caller reads both ends of the line.
export function getLinePoints(
  link: WorkflowLink,
  nodePositions: NodePositions
): [LinkPoint, LinkPoint] {
  const sourceX =
    (nodePositions[link.source.id] as NodePositions[number]).x +
    (nodePositions[link.source.id] as NodePositions[number]).width +
    1;
  let sourceY =
    normalizeY(
      nodePositions,
      (nodePositions[link.source.id] as NodePositions[number]).y
    ) +
    (nodePositions[link.source.id] as NodePositions[number]).height / 2;
  const targetX =
    (nodePositions[link.target.id] as NodePositions[number]).x - 1;
  const targetY =
    normalizeY(
      nodePositions,
      (nodePositions[link.target.id] as NodePositions[number]).y
    ) +
    (nodePositions[link.target.id] as NodePositions[number]).height / 2;

  // There's something off with the math on the root node...
  if (link.source.id === 1) {
    sourceY += 10;
  }

  return [
    {
      x: sourceX,
      y: sourceY,
    },
    {
      x: targetX,
      y: targetY,
    },
  ];
}

export function getLinkOverlayPoints(
  link: WorkflowLink,
  nodePositions: NodePositions
): string {
  const sourceX =
    (nodePositions[link.source.id] as NodePositions[number]).x +
    (nodePositions[link.source.id] as NodePositions[number]).width +
    1;
  let sourceY =
    normalizeY(
      nodePositions,
      (nodePositions[link.source.id] as NodePositions[number]).y
    ) +
    (nodePositions[link.source.id] as NodePositions[number]).height / 2;
  const targetX =
    (nodePositions[link.target.id] as NodePositions[number]).x - 1;
  const targetY =
    normalizeY(
      nodePositions,
      (nodePositions[link.target.id] as NodePositions[number]).y
    ) +
    (nodePositions[link.target.id] as NodePositions[number]).height / 2;

  // There's something off with the math on the root node...
  if (link.source.id === 1) {
    sourceY += 10;
  }
  const slope = (targetY - sourceY) / (targetX - sourceX);
  const yIntercept = targetY - slope * targetX;
  const orthogonalDistance = 8;

  const pt1 = [
    targetX,
    slope * targetX +
      yIntercept +
      orthogonalDistance * Math.sqrt(1 + slope * slope),
  ].join(',');
  const pt2 = [
    sourceX,
    slope * sourceX +
      yIntercept +
      orthogonalDistance * Math.sqrt(1 + slope * slope),
  ].join(',');
  const pt3 = [
    sourceX,
    slope * sourceX +
      yIntercept -
      orthogonalDistance * Math.sqrt(1 + slope * slope),
  ].join(',');
  const pt4 = [
    targetX,
    slope * targetX +
      yIntercept -
      orthogonalDistance * Math.sqrt(1 + slope * slope),
  ].join(',');

  return [pt1, pt2, pt3, pt4].join(' ');
}

export function layoutGraph(nodes: WorkflowNode[], links: WorkflowLink[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 120 });

  // This is needed for Dagre
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node: WorkflowNode) => {
    if (node.id === 1) {
      g.setNode(String(node.id), {
        label: '',
        width: constants.rootW,
        height: constants.rootH,
      });
    } else {
      g.setNode(String(node.id), {
        label: '',
        width: constants.nodeW,
        height: constants.nodeH,
      });
    }
  });

  links.forEach((link: WorkflowLink) => {
    g.setEdge(String(link.source.id), String(link.target.id));
  });

  dagre.layout(g);

  return g;
}

export function getTranslatePointsForZoom(
  svgBoundingClientRect: Box,
  currentScaleAndOffset: ScaleAndOffset,
  newScale: number
): [number, number] {
  const origScale = currentScaleAndOffset.k;
  const unscaledOffsetX =
    (currentScaleAndOffset.x +
      (svgBoundingClientRect.width * origScale - svgBoundingClientRect.width) /
        2) /
    origScale;
  const unscaledOffsetY =
    (currentScaleAndOffset.y +
      (svgBoundingClientRect.height * origScale -
        svgBoundingClientRect.height) /
        2) /
    origScale;
  const translateX =
    unscaledOffsetX * newScale -
    (newScale * svgBoundingClientRect.width - svgBoundingClientRect.width) / 2;
  const translateY =
    unscaledOffsetY * newScale -
    (newScale * svgBoundingClientRect.height - svgBoundingClientRect.height) /
      2;
  return [translateX, translateY];
}
