import React from 'react';
import { waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { MeshData } from './constants';
import type { Zoom } from './utils/useZoom';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import MeshGraph from './MeshGraph';

vi.mock('util/webWorker', () => ({
  __esModule: true,
  default: () => ({
    postMessage: vi.fn().mockReturnValueOnce({
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
    onmessage: vi.fn(),
  }),
}));
afterEach(() => {
  vi.clearAllMocks();
});
describe('<MeshGraph />', () => {
  test('renders correctly', async () => {
    const mockData: MeshData = {
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
    };
    // The graph only calls the behaviour through svg.call(), so a spy stands in.
    const mockZoomFn = vi.fn() as unknown as Zoom['zoom'];
    const mockSetZoomCtrFn = vi.fn();
    renderWithContexts(
      <MeshGraph
        storedNodes={{ current: [] }}
        data={mockData}
        showLegend
        zoom={mockZoomFn}
        setShowZoomControls={mockSetZoomCtrFn}
      />
    );
    await waitFor(() => screen.getByLabelText('mesh-svg'));
    expect(screen.getByLabelText('mesh-svg')).toBeVisible();
  });
});
