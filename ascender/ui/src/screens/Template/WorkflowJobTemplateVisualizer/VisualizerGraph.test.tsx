import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { WorkflowStateContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerGraph from './VisualizerGraph';
import type { WorkflowState } from '../../../components/Workflow/workflowReducer';

// jsdom implements none of the SVG geometry the graph measures, so the suite
// patches these onto the prototype and takes them off again afterwards.
const svgPrototype = window.SVGElement.prototype as unknown as Record<
  string,
  unknown
>;

const workflowContext = {
  links: [
    {
      source: {
        id: 1,
      },
      target: {
        id: 2,
      },
      linkType: 'always',
    },
    {
      source: {
        id: 1,
      },
      target: {
        id: 5,
      },
      linkType: 'always',
    },
    {
      source: {
        id: 2,
      },
      target: {
        id: 4,
      },
      linkType: 'success',
    },
    {
      source: {
        id: 2,
      },
      target: {
        id: 3,
      },
      linkType: 'always',
    },
    {
      source: {
        id: 5,
      },
      target: {
        id: 3,
      },
      linkType: 'success',
    },
  ],
  nodePositions: {
    1: { label: '', width: 72, height: 40, x: 36, y: 85 },
    2: { label: '', width: 180, height: 60, x: 282, y: 40 },
    3: { label: '', width: 180, height: 60, x: 582, y: 130 },
    4: { label: '', width: 180, height: 60, x: 582, y: 30 },
    5: { label: '', width: 180, height: 60, x: 282, y: 140 },
  },
  nodes: [
    {
      id: 1,
    },
    {
      id: 2,
      fullUnifiedJobTemplate: {
        name: 'Foo JT',
        type: 'job_template',
      },
      identifier: 'node 2',
    },
    {
      id: 3,
      identifier: 'node 3',
    },
    {
      id: 4,
      identifier: 'node 4',
    },
    {
      id: 5,
      identifier: 'node 5',
    },
  ],
  showLegend: false,
  showTools: false,
};

const renderGraph = (contextOverrides = {}) =>
  renderWithContexts(
    <svg>
      <WorkflowStateContext.Provider
        value={
          {
            ...workflowContext,
            ...contextOverrides,
          } as unknown as WorkflowState
        }
      >
        <VisualizerGraph readOnly={false} />
      </WorkflowStateContext.Provider>
    </svg>
  );

describe('VisualizerGraph', () => {
  beforeAll(() => {
    svgPrototype.height = {
      baseVal: {
        value: 100,
      },
    };
    svgPrototype.width = {
      baseVal: {
        value: 100,
      },
    };
    svgPrototype.getBBox = () => ({
      x: 0,
      y: 0,
      width: 500,
      height: 250,
    });

    window.SVGElement.prototype.getBoundingClientRect = () => ({
      x: 303,
      y: 252.359375,
      width: 1329,
      height: 259.640625,
      top: 252.359375,
      right: 1632,
      bottom: 512,
      left: 303,
      toJSON: () => ({}),
    });
  });

  afterAll(() => {
    delete svgPrototype.getBBox;
    delete svgPrototype.getBoundingClientRect;
    delete svgPrototype.height;
    delete svgPrototype.width;
  });

  test('mounts successfully', () => {
    const { container } = renderGraph();
    expect(container.querySelector('#workflow-svg')).toBeInTheDocument();
  });

  test('tools and legend are shown when flags are true', () => {
    const { container } = renderGraph({ showLegend: true, showTools: true });

    // WorkflowLegend renders a "Legend" header; WorkflowTools renders a
    // "Tools" header plus the #zoom-slider range input.
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(container.querySelector('#zoom-slider')).toBeInTheDocument();
  });

  test('nodes and links are properly rendered', () => {
    const { container } = renderGraph();

    // WorkflowStartNode -> g#node-1, VisualizerNode -> g#node-2..5
    expect(container.querySelector('g#node-1')).toBeInTheDocument();
    expect(screen.getByText('START')).toBeInTheDocument();
    ['node-2', 'node-3', 'node-4', 'node-5'].forEach((id) => {
      expect(container.querySelector(`g#${id}`)).toBeInTheDocument();
    });
    expect(container.querySelectorAll('g[id^="node-"]')).toHaveLength(5);

    // Five VisualizerLink elements, each a g#link-source-target
    ['link-2-4', 'link-2-3', 'link-5-3', 'link-1-2', 'link-1-5'].forEach(
      (id) => {
        expect(container.querySelector(`g#${id}`)).toBeInTheDocument();
      }
    );
  });

  test('proper help text is shown when hovering over nodes', () => {
    const { container } = renderGraph();

    // No node/link help shown initially
    expect(
      container.querySelector('#workflow-node-help-name')
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('#workflow-link-help-type')
    ).not.toBeInTheDocument();

    const node2 = container.querySelector('g#node-2') as SVGGElement;
    const node2ForeignObject = node2.querySelector(
      'foreignObject'
    ) as SVGForeignObjectElement;
    fireEvent.mouseEnter(node2ForeignObject);

    // WorkflowNodeHelp renders the alias/name/type for node 2
    expect(screen.getByText('Node Alias')).toBeInTheDocument();
    expect(
      container.querySelector('#workflow-node-help-alias')
    ).toHaveTextContent('node 2');
    expect(screen.getByText('Resource Name')).toBeInTheDocument();
    expect(
      container.querySelector('#workflow-node-help-name')
    ).toHaveTextContent('Foo JT');
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(
      container.querySelector('#workflow-node-help-type')
    ).toHaveTextContent('Job Template');

    fireEvent.mouseLeave(node2ForeignObject);
    expect(
      container.querySelector('#workflow-node-help-name')
    ).not.toBeInTheDocument();
  });

  test('proper help text is shown when hovering over links', () => {
    const { container } = renderGraph();

    const linkOverlay = container.querySelector(
      '#link-2-3-overlay'
    ) as HTMLElement;
    fireEvent.mouseEnter(linkOverlay);

    // WorkflowLinkHelp renders the "Run" type for the always link 2-3
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('Always');

    fireEvent.mouseLeave(linkOverlay);
    expect(
      container.querySelector('#workflow-link-help-type')
    ).not.toBeInTheDocument();
  });

  /*
   * Svg has no z-index and paints in document order, so where each piece is
   * drawn is the whole of what sits above what. Both halves of this have been
   * wrong: drawn with its line, a link's menu came up under whichever node it
   * hangs over; drawn after the nodes, the whole link went there and its line
   * painted over them.
   */
  test('draws the lines under the nodes and the open menu over them', () => {
    const { container } = renderGraph();
    const drawn = () =>
      [...(container.querySelector('#workflow-g') as Element).children].map(
        (child) => child.id
      );

    const firstNode = drawn().findIndex((id) => id.startsWith('node-'));
    const lines = drawn()
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => /^link-\d+-\d+$/.test(id));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(({ index }) => expect(index).toBeLessThan(firstNode));
    expect(drawn().some((id) => id.endsWith('-menu'))).toBe(false);

    fireEvent.mouseEnter(container.querySelector('g#link-2-3') as Element);

    // The menu is drawn last of all, and it is only the menu: the line stays
    // where it was, below the nodes.
    const after = drawn();
    expect(after[after.length - 1]).toBe('link-2-3-menu');
    expect(after.indexOf('link-2-3')).toBeLessThan(
      after.findIndex((id) => id.startsWith('node-'))
    );
    const menu = container.querySelector('g#link-2-3-menu') as Element;
    expect(menu.querySelector(':scope > path')).toBeNull();
    expect(menu.querySelector('[data-cy="link-edit"]')).toBeInTheDocument();
  });
});
