import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { en } from 'make-plural/plurals';
import english from '../../locales/en/messages';
import MeshGraph from './MeshGraph';

// Setup i18n for tests
i18n.loadLocaleData({ en: { plurals: en } });
i18n.load({ en: english.messages });
i18n.activate('en');

// Custom render function with I18n context
const renderWithI18n = (component) => {
  return render(
    <I18nProvider i18n={i18n}>
      {component}
    </I18nProvider>
  );
};

jest.mock('util/webWorker', () => {
  return {
    __esModule: true,
    default: () => {
      return {
        postMessage: jest.fn().mockReturnValueOnce({
          data: {
            type: 'end',
            links: [],
            nodes: [
              {
                id: 1,
                hostname: 'foo',
                node_type: 'control',
                node_state: 'healthy',
                index: 0,
                vx: -1,
                vy: -5,
                x: 400,
                y: 300,
              },
              {
                id: 2,
                hostname: 'bar',
                node_type: 'control',
                node_state: 'healthy',
                index: 1,
                vx: -1,
                vy: -5,
                x: 500,
                y: 200,
              },
            ],
          },
        }),
        onmessage: jest.fn(),
      };
    },
  };
});
afterEach(() => {
  jest.clearAllMocks();
});
describe('<MeshGraph />', () => {
  test('renders correctly', async () => {
    const mockData = {
      data: {
        nodes: [
          {
            id: 1,
            hostname: 'foo',
            node_type: 'control',
            node_state: 'healthy',
          },
          {
            id: 2,
            hostname: 'bar',
            node_type: 'control',
            node_state: 'healthy',
          },
        ],
        links: [],
      },
    };
    const mockZoomFn = jest.fn();
    const mockSetZoomCtrFn = jest.fn();
    renderWithI18n(
      <MemoryRouter>
        <MeshGraph
          data={mockData}
          showLegend={true}
          zoom={mockZoomFn}
          setShowZoomControls={mockSetZoomCtrFn}
        />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByLabelText('mesh-svg'));
    expect(screen.getByLabelText('mesh-svg')).toBeVisible();
  });
});
