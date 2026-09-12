import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import debounce from 'util/debounce';
import * as d3 from 'd3';
import { InstancesAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import type { Instance, InstanceGroup, Paginated } from 'types/api';
import type { MeshData, MeshLink, MeshNode } from './constants';
import Legend from './Legend';
import Tooltip from './Tooltip';
import ContentLoading from './ContentLoading';
import {
  renderStateColor,
  renderLinkStatusColor,
  renderLabelText,
  renderNodeType,
  renderNodeIcon,
  renderLinkState,
  renderLabelIcons,
  renderIconPosition,
  redirectToDetailsPage,
  getHeight,
  getWidth,
} from './utils/helpers';
import type { Zoom } from './utils/useZoom';
import webWorker from '../../util/webWorker';
import {
  DEFAULT_RADIUS,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_HIGHLIGHT_COLOR,
  DEFAULT_NODE_SYMBOL_TEXT_COLOR,
  DEFAULT_NODE_STROKE_COLOR,
  DEFAULT_FONT_SIZE,
  SELECTOR,
} from './constants';

const Loader = styled(ContentLoading)`
  height: 100%;
  position: absolute;
  width: 100%;
  background: var(--pf-v6-global--BackgroundColor--100);
`;
export interface MeshGraphProps {
  data: MeshData;
  showLegend: boolean;
  /** d3's zoom behaviour, which the toolbar's controls drive. */
  zoom: Zoom['zoom'];
  setShowZoomControls: (show: boolean) => void;
  /** The nodes as they were fetched, which the websocket updates in place. */
  storedNodes: React.MutableRefObject<MeshNode[] | null>;
  [key: string]: unknown;
}

function MeshGraph({
  data,
  showLegend,
  zoom,
  setShowZoomControls,
  storedNodes,
}: MeshGraphProps) {
  const { t } = useLingui();
  const [isNodeSelected, setIsNodeSelected] = useState(false);
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null);
  const [simulationProgress, setSimulationProgress] = useState<number | null>(
    null
  );
  const navigate = useNavigate();

  const {
    result: { instance, instanceGroups },
    error: fetchError,
    isLoading,
    request: fetchDetails,
  } = useRequest(
    useCallback(async () => {
      // Only the effect below calls this, and only once a node is selected.
      if (!selectedNode) {
        return {
          instance: {} as Partial<Instance>,
          instanceGroups: null as Paginated<InstanceGroup> | null,
        };
      }
      const { data: instanceData } = await InstancesAPI.readDetail(
        selectedNode.id
      );
      const { data: instanceGroupsData } = await InstancesAPI.readInstanceGroup(
        selectedNode.id
      );
      return {
        instance: instanceData,
        instanceGroups: instanceGroupsData,
      };
    }, [selectedNode]),
    { instance: {}, instanceGroups: null }
  );
  const { error: fetchInstanceError, dismissError } =
    useDismissableError(fetchError);

  useEffect(() => {
    if (selectedNode) {
      fetchDetails();
    }
  }, [selectedNode, fetchDetails]);

  function updateNodeSVG(nodes: MeshNode[]) {
    if (nodes) {
      d3.selectAll('[class*="id-"]')
        .data(nodes)
        .attr('stroke-dasharray', (d: MeshNode) => (d.enabled ? `1 0` : `5`));
    }
  }

  useEffect(() => {
    function handleResize() {
      d3.select('.simulation-loader').style('visibility', 'visible');
      setSelectedNode(null);
      setIsNodeSelected(false);
      draw();
    }
    window.addEventListener('resize', debounce(handleResize, 500));
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // update mesh when user toggles enabled/disabled slider
  useEffect(() => {
    if (instance?.id) {
      const updatedNodes = (storedNodes.current ?? []).map((n) =>
        n.id === instance.id ? { ...n, enabled: Boolean(instance.enabled) } : n
      );
      storedNodes.current = updatedNodes;
      updateNodeSVG(updatedNodes);
    }
  }, [instance]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = () => {
    let width: number;
    let height: number;
    setShowZoomControls(false);
    try {
      width = getWidth(SELECTOR);
      height = getHeight(SELECTOR);
    } catch (error) {
      width = 700;
      height = 600;
    }

    /* Add SVG */
    d3.selectAll(`#chart > svg`).remove();
    const svg = d3
      .select('#chart')
      .append('svg')
      .attr('aria-label', 'mesh-svg')
      .attr('class', 'mesh-svg')
      .attr('width', `${width}px`)
      .attr('height', `100%`);
    const mesh = svg.append('g').attr('class', 'mesh');

    const graph = data;
    if (storedNodes?.current) {
      graph.nodes = storedNodes.current;
    }

    /* WEB WORKER */
    const worker = webWorker();
    worker.postMessage({
      nodes: graph.nodes,
      links: graph.links,
    });

    worker.onmessage = function handleWorkerEvent(event) {
      switch (event.data.type) {
        case 'tick':
          return ticked(event.data);
        case 'end':
          return ended(event.data);
        default:
          return false;
      }
    };

    function ticked({ progress }: { progress: number }) {
      const calculatedPercent = Math.round(progress * 100);
      setSimulationProgress(calculatedPercent);
    }

    function ended({ nodes, links }: MeshData) {
      // Remove loading screen
      d3.select('.simulation-loader').style('visibility', 'hidden');
      setShowZoomControls(true);
      // Center the mesh
      const simulation = d3
        .forceSimulation(nodes)
        .force('center', d3.forceCenter(width / 2, height / 2));
      simulation.tick();
      // build the arrow.
      mesh
        .append('defs')
        .selectAll('marker')
        .data(['end', 'end-active', 'end-adding', 'end-removing'])
        .join('marker')
        .attr('id', String)
        .attr('viewBox', '0 -5 10 10')
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5');
      mesh.select('#end').attr('refX', 23).attr('fill', '#6A6E73');
      mesh.select('#end-removing').attr('refX', 23).attr('fill', '#C9190B');
      mesh.select('#end-adding').attr('refX', 23).attr('fill', '#3E8635');
      mesh.select('#end-active').attr('refX', 18).attr('fill', '#0066CC');

      // Add links
      mesh
        .append('g')
        .attr('class', `links`)
        .attr('data-cy', 'links')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('x1', (d: MeshLink) => d.source.x ?? 0)
        .attr('y1', (d: MeshLink) => d.source.y ?? 0)
        .attr('x2', (d: MeshLink) => d.target.x ?? 0)
        .attr('y2', (d: MeshLink) => d.target.y ?? 0)
        .attr('marker-end', (d: MeshLink) => {
          if (d.link_state === 'adding') {
            return 'url(#end-adding)';
          }
          if (d.link_state === 'removing') {
            return 'url(#end-removing)';
          }
          return 'url(#end)';
        })
        .attr('class', (_, i) => `link-${i}`)
        .attr(
          'data-cy',
          (d: MeshLink) => `${d.source.hostname}-${d.target.hostname}`
        )
        .style('fill', 'none')
        .style('stroke', (d: MeshLink) => renderLinkStatusColor(d.link_state))
        .style('stroke-width', '2px')
        .style('stroke-dasharray', (d: MeshLink) =>
          renderLinkState(d.link_state)
        )
        .attr('pointer-events', 'none')
        .on('mouseover', function showPointer() {
          d3.select(this).style('cursor', 'pointer');
        });
      // add nodes
      const node = mesh
        .append('g')
        .attr('class', 'nodes')
        .attr('data-cy', 'nodes')
        .selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('data-cy', (d: MeshNode) => `node-${d.id}`)
        .on('mouseenter', function handleNodeHover(_, d) {
          d3.select(this).style('cursor', 'pointer');
          highlightSiblings(d);
        })
        .on('mouseleave', (_, d) => {
          deselectSiblings(d);
        })
        .on('click', (_, d) => {
          highlightSelected(d);
        });

      // node circles
      const nodeCircles = node.append('g');
      nodeCircles
        .append('circle')
        .attr('r', DEFAULT_RADIUS)
        .attr('cx', (d: MeshNode) => d.x ?? 0)
        .attr('cy', (d: MeshNode) => d.y ?? 0)
        .attr('class', (d: MeshNode) => d.node_type)
        .attr('class', (d: MeshNode) => `id-${d.id}`)
        .attr('fill', DEFAULT_NODE_COLOR)
        .attr('stroke-dasharray', (d: MeshNode) => (d.enabled ? `1 0` : `5`))
        .attr('stroke', (d: MeshNode) => renderStateColor(d.node_state));

      // node type labels
      node
        .append('text')
        .text((d: MeshNode) => renderNodeType(d.node_type))
        .attr('x', (d: MeshNode) => d.x ?? 0)
        .attr('y', (d: MeshNode) => d.y ?? 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', DEFAULT_NODE_SYMBOL_TEXT_COLOR);

      // node hostname labels
      const hostNames = node.append('g').attr('class', 'node-state-label');
      hostNames
        .append('text')
        .attr('x', (d: MeshNode) => d.x ?? 0)
        .attr('y', (d: MeshNode) => (d.y ?? 0) + 40)
        .text((d: MeshNode) => renderLabelText(d.node_state, d.hostname))
        .attr('class', 'placeholder')
        .attr('fill', 'white')
        .attr('text-anchor', 'middle')
        .each(function calculateLabelWidth() {
          const bbox = (this as SVGGraphicsElement).getBBox();
          const padding = 10;

          d3.select((this as SVGElement).parentNode as SVGElement)
            .append('rect')
            .attr('x', bbox.x - padding / 2)
            .attr('y', bbox.y)
            .attr('width', bbox.width + padding)
            .attr('height', bbox.height)
            .style('stroke-width', 1)
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', 'white')
            .style('stroke', DEFAULT_NODE_STROKE_COLOR);
        });
      svg.selectAll('text.placeholder').remove();
      hostNames
        .append('text')
        .attr('x', (d: MeshNode) => d.x ?? 0)
        .attr('y', (d: MeshNode) => (d.y ?? 0) + 38)
        .text((d: MeshNode) => renderLabelText(d.node_state, d.hostname))
        .attr('font-size', DEFAULT_FONT_SIZE)
        .attr('fill', 'black')
        .attr('text-anchor', 'middle');

      // add badge icons
      const badges = nodeCircles.append('g').attr('class', 'node-state-badge');
      badges.each(function drawStateBadge(this: SVGGElement) {
        const bbox = (
          (this as SVGGElement).parentNode as SVGGraphicsElement
        ).getBBox();

        d3.select<SVGGElement, MeshNode>(this as SVGGElement)
          .append('circle')
          .attr('r', 9)
          .attr('cx', bbox.x)
          .attr('cy', bbox.y)
          .attr('fill', (d: MeshNode) => renderStateColor(d.node_state));
        d3.select<SVGGElement, MeshNode>(this as SVGGElement)
          .append('path')
          .attr('class', (d: MeshNode) => `icon-${d.node_state}`)
          .attr('d', (d: MeshNode) => renderLabelIcons(d.node_state))
          .attr('transform', (d: MeshNode) =>
            renderIconPosition(d.node_state, bbox)
          )
          .attr('fill', 'white');
      });
      svg.call(zoom);

      function highlightSiblings(n: MeshNode) {
        svg
          .select(`circle.id-${n.id}`)
          .attr('fill', DEFAULT_NODE_HIGHLIGHT_COLOR);
        const immediate = links.filter(
          (l: MeshLink) =>
            n.hostname === l.source.hostname || n.hostname === l.target.hostname
        );
        immediate.forEach((s: MeshLink) => {
          svg
            .selectAll(`.link-${s.index}`)
            .style('stroke', '#0066CC')
            .style('stroke-width', '3px')
            .attr('marker-end', 'url(#end-active)');
        });
      }

      function deselectSiblings(n: MeshNode) {
        svg.select(`circle.id-${n.id}`).attr('fill', DEFAULT_NODE_COLOR);
        const immediate = links.filter(
          (l: MeshLink) =>
            n.hostname === l.source.hostname || n.hostname === l.target.hostname
        );
        immediate.forEach((s: MeshLink) => {
          svg
            .selectAll<SVGLineElement, MeshLink>(`.link-${s.index}`)
            .style('stroke', (d: MeshLink) =>
              renderLinkStatusColor(d.link_state)
            )
            .style('stroke-width', '2px')
            .attr('marker-end', (d: MeshLink) => {
              if (d.link_state === 'adding') {
                return 'url(#end-adding)';
              }
              if (d.link_state === 'removing') {
                return 'url(#end-removing)';
              }
              return 'url(#end)';
            });
        });
      }

      function highlightSelected(n: MeshNode) {
        if (svg.select(`circle.id-${n.id}`).attr('stroke-width') !== null) {
          // toggle rings
          svg
            .select<SVGCircleElement>(`circle.id-${n.id}`)
            .datum<MeshNode>(n)
            .attr('stroke', (d: MeshNode) => renderStateColor(d.node_state))
            .attr('stroke-width', null);
          // show default empty state of tooltip
          setIsNodeSelected(false);
          setSelectedNode(null);
          return;
        }
        svg
          .selectAll<SVGCircleElement, MeshNode>('circle')
          .attr('stroke', (d: MeshNode) => renderStateColor(d.node_state))
          .attr('stroke-width', null);
        svg
          .select(`circle.id-${n.id}`)
          .attr('stroke-width', '5px')
          .attr('stroke', '#17b26a');
        setIsNodeSelected(true);
        setSelectedNode(n);
      }
    }
  };

  return (
    <div id="chart" style={{ position: 'relative', height: '100%' }}>
      {showLegend && <Legend />}
      {instance && (
        <Tooltip
          isNodeSelected={isNodeSelected}
          renderNodeIcon={renderNodeIcon(selectedNode)}
          selectedNode={selectedNode}
          fetchInstance={fetchDetails}
          instanceGroups={instanceGroups}
          instanceDetail={instance}
          isLoading={isLoading}
          redirectToDetailsPage={() =>
            redirectToDetailsPage(selectedNode, navigate)
          }
        />
      )}
      <Loader className="simulation-loader" progress={simulationProgress} />
      {Boolean(fetchInstanceError) && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen
          onClose={dismissError}
        >
          {t`Failed to get instance.`}
          <ErrorDetail error={fetchInstanceError} />
        </AlertModal>
      )}
    </div>
  );
}

export default MeshGraph;
