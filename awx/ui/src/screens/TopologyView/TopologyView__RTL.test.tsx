import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { MeshAPI } from 'api';
import { waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TopologyView from './TopologyView';

vi.mock('../../api');
vi.mock('util/webWorker', () => {
  return {
    __esModule: true,
    default: () => {
      return {
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
        onmessage: function handleWorkerEvent(event: Untyped) {
          switch (event.data.type) {
            case 'tick':
              return vi.fn(event.data);
            case 'end':
              return vi.fn(event.data);
            default:
              return false;
          }
        },
      };
    },
  };
});
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
    } as unknown as ApiResponse<Untyped>);
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
    } as unknown as ApiResponse<Untyped>);
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
