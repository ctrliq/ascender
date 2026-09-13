import React from 'react';
import { render } from '@testing-library/react';
import { WorkflowStateContext } from 'contexts/Workflow';
import WorkflowOutputLink from './WorkflowOutputLink';
import type { WorkflowState } from '../../../components/Workflow/workflowReducer';

const link = {
  source: {
    id: 1,
  },
  target: {
    id: 2,
  },
};

const nodePositions = {
  1: {
    width: 72,
    height: 40,
    x: 0,
    y: 0,
  },
  2: {
    width: 180,
    height: 60,
    x: 282,
    y: 40,
  },
};

function renderLink(linkType?: string) {
  return render(
    <svg>
      <WorkflowStateContext.Provider
        value={{ nodePositions } as unknown as WorkflowState}
      >
        <WorkflowOutputLink
          link={linkType ? { ...link, linkType } : link}
          nodePositions={nodePositions}
          mouseEnter={() => {}}
          mouseLeave={() => {}}
        />
      </WorkflowStateContext.Provider>
    </svg>
  );
}

function strokeFor(linkType: string) {
  const { container, unmount } = renderLink(linkType);
  const stroke = container
    .querySelector('#link-1-2 path[stroke]')
    ?.getAttribute('stroke');
  unmount();
  return stroke;
}

describe('WorkflowOutputLink', () => {
  test('mounts successfully', () => {
    const { container } = renderLink();
    expect(container.querySelector('#link-1-2')).toBeInTheDocument();
  });

  test('always links use their own colour, not the brand colour', () => {
    expect(strokeFor('always')).toBe('var(--ascender-workflow-link-always)');
  });

  test('each link type is drawn in a distinct colour', () => {
    const strokes = ['success', 'failure', 'always', 'condition'].map(
      strokeFor
    );
    expect(new Set(strokes).size).toBe(strokes.length);
  });
});
