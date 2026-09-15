import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkflowHelp from './WorkflowHelp';

describe('WorkflowHelp', () => {
  test('successfully mounts', () => {
    render(<WorkflowHelp>Help content</WorkflowHelp>);
    expect(screen.getByText('Help content')).toBeInTheDocument();
  });
});
