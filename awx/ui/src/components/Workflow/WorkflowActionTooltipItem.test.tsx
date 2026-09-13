import React from 'react';
import { render } from '@testing-library/react';
import WorkflowActionTooltipItem from './WorkflowActionTooltipItem';

describe('WorkflowActionTooltipItem', () => {
  test('successfully mounts', () => {
    const { container } = render(<WorkflowActionTooltipItem id="node" />);
    expect(container.querySelector('#node')).toBeInTheDocument();
  });
});
