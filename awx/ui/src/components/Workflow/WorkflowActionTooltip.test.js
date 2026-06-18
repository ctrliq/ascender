import React from 'react';
import { render } from '@testing-library/react';
import WorkflowActionTooltip from './WorkflowActionTooltip';

describe('WorkflowActionTooltip', () => {
  test('successfully mounts', () => {
    const { container } = render(
      <svg>
        <WorkflowActionTooltip actions={[]} pointX={0} pointY={0} />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toBeInTheDocument();
  });
});
