import React from 'react';
import { fireEvent } from '@testing-library/react';
import { WorkflowStateContext } from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowOutputGraph from './WorkflowOutputGraph';

const workflowContext = {
  links: [
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
      originalNodeObject: {
        identifier: 'Node identifier',
        summary_fields: {
          job: {
            name: 'Foo JT',
            type: 'job',
            status: 'successful',
            elapsed: 60,
          },
          unified_job_template: {
            name: 'Foo JT',
            type: 'job_template',
          },
        },
      },
    },
    {
      id: 3,
    },
    {
      id: 4,
    },
    {
      id: 5,
    },
  ],
  showLegend: false,
  showTools: false,
};

function renderGraph(contextOverride) {
  return renderWithContexts(
    <svg>
      <WorkflowStateContext.Provider
        value={{ ...workflowContext, ...contextOverride }}
      >
        <WorkflowOutputGraph />
      </WorkflowStateContext.Provider>
    </svg>
  );
}

describe('WorkflowOutputGraph', () => {
  beforeEach(() => {
    window.SVGElement.prototype.height = {
      baseVal: {
        value: 100,
      },
    };
    window.SVGElement.prototype.width = {
      baseVal: {
        value: 100,
      },
    };
    window.SVGElement.prototype.getBBox = () => ({
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
    });
  });

  afterEach(() => {
    delete window.SVGElement.prototype.getBBox;
    delete window.SVGElement.prototype.getBoundingClientRect;
    delete window.SVGElement.prototype.height;
    delete window.SVGElement.prototype.width;
  });

  test('mounts successfully', () => {
    const { container } = renderGraph();
    expect(container.querySelector('#workflow-svg')).toBeInTheDocument();
  });

  test('tools and legend are shown when flags are true', () => {
    const { container, getByText } = renderGraph({
      showLegend: true,
      showTools: true,
    });
    // WorkflowTools renders the zoom controls; WorkflowLegend its header.
    expect(
      container.querySelector(
        '[data-ouia-component-id="visualizer-zoom-to-fit-button"]'
      )
    ).toBeInTheDocument();
    expect(getByText('Legend')).toBeInTheDocument();
  });

  test('nodes and links are properly rendered', () => {
    const { container } = renderGraph();

    // WorkflowStartNode -> #node-1; WorkflowOutputNode -> #node-N (N > 1).
    expect(container.querySelector('#node-1')).toBeInTheDocument();
    const outputNodes = Array.from(
      container.querySelectorAll('g[id^="node-"]')
    ).filter((g) => g.id !== 'node-1' && g.id !== 'node-add');
    expect(outputNodes).toHaveLength(4);

    const links = Array.from(
      container.querySelectorAll('g[id^="link-"]')
    ).filter((g) => !g.id.endsWith('-overlay'));
    expect(links).toHaveLength(5);
    expect(container.querySelector('#link-2-4')).toBeInTheDocument();
    expect(container.querySelector('#link-2-3')).toBeInTheDocument();
    expect(container.querySelector('#link-5-3')).toBeInTheDocument();
    expect(container.querySelector('#link-1-2')).toBeInTheDocument();
    expect(container.querySelector('#link-1-5')).toBeInTheDocument();
  });

  test('proper help text is shown when hovering over links and nodes', () => {
    const { container } = renderGraph();

    expect(
      container.querySelector('#workflow-node-help-name')
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('#workflow-link-help-type')
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(container.querySelector('g#node-2'));
    expect(container.querySelector('#workflow-node-help-alias')).toHaveTextContent(
      'Node identifier'
    );
    expect(container.querySelector('#workflow-node-help-name')).toHaveTextContent(
      'Foo JT'
    );
    expect(container.querySelector('#workflow-node-help-type')).toHaveTextContent(
      'Job Template'
    );
    expect(
      container.querySelector('#workflow-node-help-status')
    ).toHaveTextContent('Successful');
    expect(
      container.querySelector('#workflow-node-help-elapsed')
    ).toHaveTextContent('00:01:00');

    fireEvent.mouseLeave(container.querySelector('g#node-2'));
    expect(
      container.querySelector('#workflow-node-help-name')
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(container.querySelector('g#link-2-3'));
    expect(container.querySelector('#workflow-link-help-type')).toHaveTextContent(
      'Always'
    );

    fireEvent.mouseLeave(container.querySelector('g#link-2-3'));
    expect(
      container.querySelector('#workflow-link-help-type')
    ).not.toBeInTheDocument();
  });
});
