import React from 'react';
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
      container.querySelector('[data-ouia-component-id="visualizer-zoom-in-button"]')
    ).toBeInTheDocument();
  });
  test('clicking zoom/pan buttons passes callback correct values', async () => {
    const pan = jest.fn();
    const zoomChange = jest.fn();
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
    const byOuia = (id) =>
      container.querySelector(`[data-ouia-component-id="${id}"]`);
    await user.click(byOuia('visualizer-zoom-in-button'));
    expect(zoomChange).toHaveBeenCalledWith(1.1);
    await user.click(byOuia('visualizer-zoom-out-button'));
    expect(zoomChange).toHaveBeenCalledWith(0.8);
    await user.click(byOuia('visualizer-pan-left-button'));
    expect(pan).toHaveBeenCalledWith('left');
    await user.click(byOuia('visualizer-pan-up-button'));
    expect(pan).toHaveBeenCalledWith('up');
    await user.click(byOuia('visualizer-pan-right-button'));
    expect(pan).toHaveBeenCalledWith('right');
    await user.click(byOuia('visualizer-pan-down-button'));
    expect(pan).toHaveBeenCalledWith('down');
  });
});
