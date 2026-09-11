import type { Untyped } from 'types/api';
import * as d3 from 'd3';
import { truncateString } from '../../../util/strings';

import {
  NODE_STATE_COLOR_KEY,
  NODE_TYPE_SYMBOL_KEY,
  LINK_STATE_COLOR_KEY,
  LABEL_TEXT_MAX_LENGTH,
  ICONS,
} from '../constants';

export function getWidth(selector: Untyped) {
  return selector ? d3.select(selector).node().clientWidth : 700;
}

export function getHeight(selector: Untyped) {
  return selector ? d3.select(selector).node().clientHeight : 600;
}

export function renderStateColor(nodeState: Untyped) {
  return NODE_STATE_COLOR_KEY[nodeState as keyof typeof NODE_STATE_COLOR_KEY]
    ? NODE_STATE_COLOR_KEY[nodeState as keyof typeof NODE_STATE_COLOR_KEY]
    : '';
}

export function renderLinkStatusColor(linkState: Untyped) {
  return LINK_STATE_COLOR_KEY[linkState as keyof typeof LINK_STATE_COLOR_KEY]
    ? LINK_STATE_COLOR_KEY[linkState as keyof typeof LINK_STATE_COLOR_KEY]
    : '#ccc';
}

export function renderLabelText(nodeState: Untyped, name: Untyped) {
  if (typeof nodeState === 'string' && typeof name === 'string') {
    return `${truncateString(name, LABEL_TEXT_MAX_LENGTH)}`;
  }
  return ``;
}

export function renderNodeType(nodeType: Untyped) {
  return NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
    ? NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
    : ``;
}

export function renderNodeIcon(selectedNode: Untyped) {
  if (selectedNode) {
    const { node_type: nodeType } = selectedNode;
    return NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
      ? NODE_TYPE_SYMBOL_KEY[nodeType as keyof typeof NODE_TYPE_SYMBOL_KEY]
      : ``;
  }
  return false;
}

export function renderLabelIcons(nodeState: Untyped) {
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
export function renderIconPosition(nodeState: Untyped, bbox?: Untyped) {
  if (nodeState) {
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
  selectedNode: Untyped,
  navigate: Untyped
) {
  if (selectedNode && navigate) {
    const { id: nodeId } = selectedNode;
    const constructedURL = `/instances/${nodeId}/details`;
    navigate(constructedURL);
  }
  return false;
}

export function renderLinkState(linkState: Untyped) {
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
export function getRandomInt(min: Untyped, max: Untyped) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const generateRandomLinks = (n: Untyped, r: Untyped) => {
  const links = [];
  function getRandomLinkState() {
    return ['established', 'adding', 'removing'][getRandomInt(0, 3)];
  }
  for (let i = 0; i < r; i++) {
    const link = {
      source: n[getRandomInt(0, n.length - 1)].hostname,
      target: n[getRandomInt(0, n.length - 1)].hostname,
      link_state: getRandomLinkState(),
    };
    if (link.source !== link.target) {
      links.push(link);
    }
  }

  return { nodes: n, links };
};

export const generateRandomNodes = (n: Untyped) => {
  const nodes = [];
  function getRandomType() {
    return ['hybrid', 'execution', 'control', 'hop'][getRandomInt(0, 3)];
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
    ][getRandomInt(0, 6)];
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
