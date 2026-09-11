import React from 'react';
import { waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
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
    const mockZoomFn = vi.fn();
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
