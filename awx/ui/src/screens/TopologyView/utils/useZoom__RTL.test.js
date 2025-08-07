import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { en } from 'make-plural/plurals';
import useZoom from './useZoom';
import Header from '../Header';

// Initialize i18n for tests
i18n.loadLocaleData('en', { plurals: en });
i18n.load('en', {});
i18n.activate('en');

// Helper function to render components with I18n context
function renderWithI18n(component) {
  return render(
    <I18nProvider i18n={i18n}>
      {component}
    </I18nProvider>
  );
}

afterEach(() => {
  jest.clearAllMocks();
});
describe('useZoom', () => {
  test('hook returns a set of zoom functions', async () => {
    render(
      <svg className="parent" width="700" height="500">
        <g className="child"></g>
      </svg>
    );
    const hook = useZoom('.parent', '.child');
    expect(hook).toMatchObject({
      zoom: expect.any(Function),
      zoomFit: expect.any(Function),
      zoomIn: expect.any(Function),
      zoomOut: expect.any(Function),
      resetZoom: expect.any(Function),
    });
  });
  test('user can zoom in', async () => {
    const hook = useZoom('.parent', '.child');
    jest.spyOn(hook, 'zoomIn').mockReturnValueOnce(jest.fn());
    renderWithI18n(
      <>
        <Header
          title={`Topology View`}
          handleSwitchToggle={jest.fn()}
          toggleState={true}
          zoomIn={hook.zoomIn}
          zoomOut={hook.zoomOut}
          zoomFit={hook.zoomFit}
          resetZoom={hook.resetZoom}
          showZoomControls={true}
        />
        <svg className="parent" width="700" height="500">
          <g className="child"></g>
        </svg>
      </>
    );
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    expect(hook.zoomIn).toBeCalledTimes(1);
  });
  test('user can zoom out', async () => {
    const hook = useZoom('.parent', '.child');
    jest.spyOn(hook, 'zoomOut').mockReturnValueOnce(jest.fn());
    renderWithI18n(
      <>
        <Header
          title={`Topology View`}
          handleSwitchToggle={jest.fn()}
          toggleState={true}
          zoomIn={hook.zoomIn}
          zoomOut={hook.zoomOut}
          zoomFit={hook.zoomFit}
          resetZoom={hook.resetZoom}
          showZoomControls={true}
        />
        <svg className="parent" width="700" height="500">
          <g className="child"></g>
        </svg>
      </>
    );
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    fireEvent.click(screen.getByLabelText(/zoom out/i));
    expect(hook.zoomOut).toBeCalledTimes(1);
  });
  test('user can zoom fit', async () => {
    const hook = useZoom('.parent', '.child');
    jest.spyOn(hook, 'zoomFit').mockReturnValueOnce(jest.fn());
    renderWithI18n(
      <>
        <Header
          title={`Topology View`}
          handleSwitchToggle={jest.fn()}
          toggleState={true}
          zoomIn={hook.zoomIn}
          zoomOut={hook.zoomOut}
          zoomFit={hook.zoomFit}
          resetZoom={hook.resetZoom}
          showZoomControls={true}
        />
        <svg className="parent" width="700" height="500">
          <g className="child"></g>
        </svg>
      </>
    );
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    fireEvent.click(screen.getByLabelText(/fit to screen/i));
    expect(hook.zoomFit).toBeCalledTimes(1);
  });
  test('user can reset zoom', async () => {
    const hook = useZoom('.parent', '.child');
    jest.spyOn(hook, 'resetZoom').mockReturnValueOnce(jest.fn());
    renderWithI18n(
      <>
        <Header
          title={`Topology View`}
          handleSwitchToggle={jest.fn()}
          toggleState={true}
          zoomIn={hook.zoomIn}
          zoomOut={hook.zoomOut}
          zoomFit={hook.zoomFit}
          resetZoom={hook.resetZoom}
          showZoomControls={true}
        />
        <svg className="parent" width="700" height="500">
          <g className="child"></g>
        </svg>
      </>
    );
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    fireEvent.click(screen.getByLabelText(/reset zoom/i));
    expect(hook.resetZoom).toBeCalledTimes(1);
  });
});
