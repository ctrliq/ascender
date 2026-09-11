import * as d3 from 'd3';
import { getWidth, getHeight } from './helpers';

/** The zoom behaviour and the controls the topology header drives. */
export interface Zoom {
  /** Applied to the parent svg with `selection.call(zoom)`. */
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  resetZoom: () => void;
}

/**
 * useZoom provides a collection of zoom behaviors/functions for D3 graphs
 * Params: string value of parent and child classnames
 * The following hierarchy should be followed:
 * <div id="chart">
 *  <svg><-- parent -->
 *    <g><-- child -->
 *  </svg>
 * </div>
 * Returns: {
 *  zoom: d3 zoom behavior/object/function to apply on selected elements
 *  zoomIn: function that zooms in
 *  zoomOut: function that zooms out
 *  zoomFit: function that scales child element to fit within parent element
 *  resetZoom: function resets the zoom level to its initial value
 * }
 */
export default function useZoom(
  parentSelector: string,
  childSelector: string
): Zoom {
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      d3.select(childSelector).attr('transform', event.transform.toString());
    });
  const parent = () => d3.select<SVGSVGElement, unknown>(parentSelector);
  const zoomIn = () => {
    parent().transition().call(zoom.scaleBy, 2);
  };
  const zoomOut = () => {
    parent().transition().call(zoom.scaleBy, 0.5);
  };
  const resetZoom = () => {
    const node = parent().node();
    if (!node) return;
    const width = node.clientWidth;
    const height = node.clientHeight;
    parent()
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity,
        d3.zoomTransform(node).invert([width / 2, height / 2])
      );
  };
  const zoomFit = () => {
    const child = d3.select<SVGGraphicsElement, unknown>(childSelector).node();
    if (!child) return;
    const bounds = child.getBBox();
    const fullWidth = getWidth(parentSelector);
    const fullHeight = getHeight(parentSelector);
    const { width, height } = bounds;
    const midX = bounds.x + width / 2;
    const midY = bounds.y + height / 2;
    if (width === 0 || height === 0) return; // nothing to fit
    const scale = 0.8 / Math.max(width / fullWidth, height / fullHeight);
    const x = fullWidth / 2 - scale * midX;
    const y = fullHeight / 2 - scale * midY;
    parent()
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  };

  return {
    zoom,
    zoomIn,
    zoomOut,
    zoomFit,
    resetZoom,
  };
}
