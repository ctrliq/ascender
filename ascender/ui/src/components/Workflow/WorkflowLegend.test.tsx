import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowLegend from './WorkflowLegend';

describe('WorkflowLegend', () => {
  test('renders the expected content', () => {
    renderWithContexts(<WorkflowLegend />);
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Job Template')).toBeInTheDocument();
    expect(screen.getByText('Always')).toBeInTheDocument();
  });

  /*
   * The legend is what tells someone which letter means what, so it says the
   * same letters the nodes draw. WorkflowNodeTypeLetter is what draws them, and
   * its own tests hold it to these.
   */
  test('names the letters the nodes are drawn with', () => {
    const { container } = renderWithContexts(<WorkflowLegend />);
    const letters = [
      ...container.querySelectorAll(
        '.ascender-workflow-legend__node-type-letter'
      ),
    ].map((el) => el.textContent?.trim());

    expect(letters).toContain('J');
    expect(letters).toContain('W');
    expect(letters).not.toContain('JT');
  });

  // A cleanup job is C for Cleanup, the word the legend names it by.
  test('marks a cleanup job with C', () => {
    renderWithContexts(<WorkflowLegend />);
    const cleanup = screen.getByText('Cleanup Job').closest('li');
    expect(
      cleanup?.querySelector('.ascender-workflow-legend__node-type-letter')
    ).toHaveTextContent(/^C$/);
  });
});
