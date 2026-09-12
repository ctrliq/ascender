import type { ApiResponse } from 'api/Base';
import React from 'react';
import { MeshAPI } from 'api';
import { waitFor, screen } from '@testing-library/react';
import type { MeshData } from './constants';
import '@testing-library/jest-dom';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TopologyView from './TopologyView';

vi.mock('../../api');

/** What the mesh web worker posts back on every tick and at the end. */
type WorkerMessage = MeshData & { type: 'tick' | 'end' };

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
    // The graph assigns its own handler over this one as soon as it draws.
    onmessage: vi.fn<(event: MessageEvent<WorkerMessage>) => void>(),
  }),
}));
afterEach(() => {
  vi.clearAllMocks();
});
describe('<TopologyView />', () => {
  test('should render properly', async () => {
    vi.mocked(MeshAPI.read).mockResolvedValue({
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
    } as unknown as ApiResponse<MeshData>);
    renderWithContexts(<TopologyView />);
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    expect(screen.getByLabelText('mesh-svg')).toBeVisible();
  });
  test('should render with 0 nodes', async () => {
    vi.mocked(MeshAPI.read).mockResolvedValue({
      data: {
        nodes: [],
        links: [],
      },
    } as unknown as ApiResponse<MeshData>);
    renderWithContexts(<TopologyView />);
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    expect(screen.getByLabelText('mesh-svg')).toBeVisible();
  });
  test('should handle API error', async () => {
    vi.mocked(MeshAPI.read).mockRejectedValueOnce(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'get',
            url: '/api/v2/mesh_visualizer',
          },
          data: 'An error occurred',
          status: 500,
        },
      })
    );
    renderWithContexts(<TopologyView />);
    await waitFor(() => screen.getByRole('heading', { level: 2 }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Topology View'
    );
    expect(screen.getByText(/something went wrong/i)).toBeVisible();
  });
});
