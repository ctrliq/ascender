import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowLegend from './WorkflowLegend';

describe('WorkflowLegend', () => {
  test('renders the expected content', () => {
    renderWithContexts(<WorkflowLegend onClose={() => {}} />);
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Job Template')).toBeInTheDocument();
    expect(screen.getByText('Always')).toBeInTheDocument();
  });
});
