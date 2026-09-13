import * as d3 from 'd3';
import { truncateString } from '../../../util/strings';

import {
  NODE_STATE_COLOR_KEY,
  NODE_TYPE_SYMBOL_KEY,
  LINK_STATE_COLOR_KEY,
  LABEL_TEXT_MAX_LENGTH,
  ICONS,
} from '../constants';
import type { MeshNode } from '../constants';

export function getWidth(selector?: string) {
  const node = selector ? d3.select<Element, unknown>(selector).node() : null;
  return node ? node.clientWidth : 700;
}

export function getHeight(selector?: string) {
  const node = selector ? d3.select<Element, unknown>(selector).node() : null;
  return node ? node.clientHeight : 600;
}

export function renderStateColor(nodeState?: string | null) {
  return NODE_STATE_COLOR_KEY[nodeState as keyof typeof NODE_STATE_COLOR_KEY]
    ? NODE_STATE_COLOR_KEY[nodeState as keyof typeof NODE_STATE_COLOR_KEY]
    : '';
}

export function renderLinkStatusColor(linkState?: string | null) {
  return LINK_STATE_COLOR_KEY[linkState as keyof typeof LINK_STATE_COLOR_KEY]
    ? LINK_STATE_COLOR_KEY[linkState as keyof typeof LINK_STATE_COLOR_KEY]
    : '#ccc';
}

export function renderLabelText(nodeState?: string | null, name?: string) {
  if (typeof nodeState === 'string' && typeof name === 'string') {
    return `${truncateString(name, LABEL_TEXT_MAX_LENGTH)}`;
  }
  return ``;
}

export function renderNodeType(nodeType?: string | null) {
  return NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
    ? NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
    : ``;
}

export function renderNodeIcon(selectedNode?: MeshNode | null) {
  if (selectedNode) {
    const { node_type: nodeType } = selectedNode;
    return NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
      ? NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
      : ``;
  }
  return false;
}

export function renderLabelIcons(nodeState?: string | null) {
  if (nodeState) {
    const nodeLabelIconMapper = {
      ready: 'checkmark',
      installed: 'clock',
      unavailable: 'exclaimation',
      'deprovision-fail': 'exclaimation',
      'provision-fail': 'exclaimation',
      provisioning: 'plus',
      deprovisioning: 'minus',
    };
    const icon =
      nodeLabelIconMapper[nodeState as keyof typeof nodeLabelIconMapper];
    return ICONS[icon as keyof typeof ICONS] ?? ``;
  }
  return false;
}
export function renderIconPosition(nodeState?: string | null, box?: DOMRect) {
  if (nodeState) {
    // The icon only has a position once the label it sits beside is laid out.
    const bbox = box ?? ({ x: 0, y: 0 } as DOMRect);
    const iconPositionMapper = {
      ready: `translate(${bbox.x - 4.5}, ${bbox.y - 4.5}), scale(0.02)`,
      installed: `translate(${bbox.x - 6.5}, ${bbox.y - 6.5}), scale(0.025)`,
      unavailable: `translate(${bbox.x - 2}, ${bbox.y - 4.4}), scale(0.02)`,
      'provision-fail': `translate(${bbox.x - 2}, ${bbox.y - 4}), scale(0.02)`,
      'deprovision-fail': `translate(${bbox.x - 2}, ${
        bbox.y - 4
      }), scale(0.02)`,
      provisioning: `translate(${bbox.x - 4.5}, ${bbox.y - 4.5}), scale(0.02)`,
      deprovisioning: `translate(${bbox.x - 4.5}, ${
        bbox.y - 4.5
      }), scale(0.02)`,
    };
    return iconPositionMapper[nodeState as keyof typeof iconPositionMapper]
      ? iconPositionMapper[nodeState as keyof typeof iconPositionMapper]
      : ``;
  }
  return false;
}

export function redirectToDetailsPage(
  selectedNode: MeshNode | null,
  navigate: (to: string) => void
) {
  if (selectedNode && navigate) {
    const { id: nodeId } = selectedNode;
    const constructedURL = `/instances/${nodeId}/details`;
    navigate(constructedURL);
  }
  return false;
}

export function renderLinkState(linkState?: string | null) {
  const linkPattern = {
    established: null,
    adding: 3,
    removing: 3,
  };
  return linkPattern[linkState as keyof typeof linkPattern]
    ? linkPattern[linkState as keyof typeof linkPattern]
    : null;
}
// DEBUG TOOLS
export function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const generateRandomLinks = (n: MeshNode[], r: number) => {
  const links = [];
  function getRandomLinkState() {
    return ['established', 'adding', 'removing'][getRandomInt(0, 3)] as string;
  }
  for (let i = 0; i < r; i++) {
    const link = {
      source: n[getRandomInt(0, n.length - 1)]?.hostname,
      target: n[getRandomInt(0, n.length - 1)]?.hostname,
      link_state: getRandomLinkState() as string,
    };
    if (link.source !== link.target) {
      links.push(link);
    }
  }

  return { nodes: n, links };
};

export const generateRandomNodes = (n: number) => {
  const nodes: MeshNode[] = [];
  function getRandomType() {
    return ['hybrid', 'execution', 'control', 'hop'][
      getRandomInt(0, 3)
    ] as string;
  }
  function getRandomState() {
    return [
      'ready',
      'provisioning',
      'deprovisioning',
      'installed',
      'provision-fail',
      'deprovision-fail',
      'unavailable',
    ][getRandomInt(0, 6)] as string;
  }
  for (let i = 0; i < n; i++) {
    const id = i + 1;
    const randomType = getRandomType();
    const randomState = getRandomState();
    const node = {
      id,
      hostname: `node-${id}`,
      node_type: randomType,
      node_state: randomState,
      enabled: Math.random() < 0.9,
    };
    nodes.push(node);
  }
  return generateRandomLinks(nodes, getRandomInt(1, n - 1));
};
