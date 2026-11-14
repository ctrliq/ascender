import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowTools from './WorkflowTools';

describe('WorkflowTools', () => {
  test('renders the expected content', () => {
    const { container } = renderWithContexts(
      <WorkflowTools
        onClose={() => {}}
        onFitGraph={() => {}}
        onPan={() => {}}
        onPanToMiddle={() => {}}
        onZoomChange={() => {}}
        zoomPercentage={100}
      />
    );
    expect(
      container.querySelector(
        '[data-ouia-component-id="visualizer-zoom-in-button"]'
      )
    ).toBeInTheDocument();
  });
  test('clicking zoom/pan buttons passes callback correct values', async () => {
    const pan = vi.fn();
    const zoomChange = vi.fn();
    const { container, user } = renderWithContexts(
      <WorkflowTools
        onClose={() => {}}
        onFitGraph={() => {}}
        onPan={pan}
        onPanToMiddle={() => {}}
        onZoomChange={zoomChange}
        zoomPercentage={95.7}
      />
    );
    const byOuia = (id: string) =>
      container.querySelector(`[data-ouia-component-id="${id}"]`);
    await user.click(byOuia('visualizer-zoom-in-button')!);
    expect(zoomChange).toHaveBeenCalledWith(1.1);
    await user.click(byOuia('visualizer-zoom-out-button')!);
    expect(zoomChange).toHaveBeenCalledWith(0.8);
    await user.click(byOuia('visualizer-pan-left-button')!);
    expect(pan).toHaveBeenCalledWith('left');
    await user.click(byOuia('visualizer-pan-up-button')!);
    expect(pan).toHaveBeenCalledWith('up');
    await user.click(byOuia('visualizer-pan-right-button')!);
    expect(pan).toHaveBeenCalledWith('right');
    await user.click(byOuia('visualizer-pan-down-button')!);
    expect(pan).toHaveBeenCalledWith('down');
  });

  // Short Title Case names, as the zoom and pan buttons beside them have.
  test.each([
    ['visualizer-zoom-to-fit-button', 'Fit to Screen'],
    ['visualizer-pan-middle-button', 'Reset Zoom'],
  ])('names %s %s in its tooltip', async (ouiaId, tooltip) => {
    const { container, user } = renderWithContexts(
      <WorkflowTools
        onClose={() => {}}
        onFitGraph={() => {}}
        onPan={() => {}}
        onPanToMiddle={() => {}}
        onZoomChange={() => {}}
        zoomPercentage={100}
      />
    );
    await user.hover(
      container.querySelector(`[data-ouia-component-id="${ouiaId}"]`)!
    );
    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  });

  /*
   * The pan buttons are a cross, so a label above each would cover the one
   * beside or above it: each opens away from the others instead, and the
   * zoom row, with nothing above it, opens below.
   */
  test.each([
    ['visualizer-zoom-to-fit-button', 'bottom'],
    ['visualizer-zoom-out-button', 'bottom'],
    ['visualizer-zoom-in-button', 'bottom'],
    ['visualizer-pan-left-button', 'left'],
    ['visualizer-pan-up-button', 'top'],
    ['visualizer-pan-down-button', 'bottom'],
    ['visualizer-pan-right-button', 'right'],
  ])('opens the tooltip of %s to the %s', async (ouiaId, side) => {
    const { container, user } = renderWithContexts(
      <WorkflowTools
        onClose={() => {}}
        onFitGraph={() => {}}
        onPan={() => {}}
        onPanToMiddle={() => {}}
        onZoomChange={() => {}}
        zoomPercentage={100}
      />
    );
    await user.hover(
      container.querySelector(
        `[data-ouia-component-id="${ouiaId}"]`
      ) as HTMLElement
    );
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveClass(`pf-m-${side}`);
  });
});
