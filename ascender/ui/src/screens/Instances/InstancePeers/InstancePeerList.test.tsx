import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstancesAPI, ReceptorAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InstancePeerList from './InstancePeerList';

vi.mock('../../../api');

function renderUnder(url: string, me: { is_superuser: boolean } | null = null) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instances/:id/peers"
        element={<InstancePeerList setBreadcrumb={() => {}} />}
      />
    </Routes>,
    {
      context: {
        router: { history },
        ...(me ? { config: { me } } : {}),
      },
    }
  );
}

function mockInstance(detail: Record<string, unknown>) {
  vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
    data: { id: 1, hostname: 'awx_1', peers: [2], ...detail },
  } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
}

describe('<InstancePeerList />', () => {
  beforeEach(() => {
    vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
      data: { id: 1, hostname: 'awx_1', node_type: 'hybrid', peers: [2] },
    } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
    vi.mocked(InstancesAPI.readPeers).mockResolvedValue({
      data: {
        count: 21,
        results: [{ id: 2, instance: 2, address: 'ascender_1', port: 2222 }],
      },
    } as unknown as ResponseOf<typeof InstancesAPI.readPeers>);
    vi.mocked(InstancesAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 2, hostname: 'ascender_1', node_type: 'hybrid' }],
      },
    } as unknown as ResponseOf<typeof InstancesAPI.read>);
    vi.mocked(ReceptorAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof ReceptorAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('names each peer by reading its instance by id', async () => {
    renderUnder('/instances/1/peers');

    expect((await screen.findAllByText('ascender_1')).length).toBeGreaterThan(
      0
    );
    expect(InstancesAPI.read).toHaveBeenCalledWith({
      id__in: '2',
      page_size: 1,
    });
  });

  /*
   * The rows are receptor addresses, and the peers endpoint refuses a bare
   * hostname or node_type with a 400: both are the instance's, reached
   * through it.
   */
  test('searches and sorts on fields the peers endpoint accepts', async () => {
    renderUnder(
      '/instances/1/peers?peer.instance__hostname__icontains=asc&peer.order_by=instance__node_type'
    );

    expect((await screen.findAllByText('ascender_1')).length).toBeGreaterThan(
      0
    );
    expect(InstancesAPI.readPeers).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        instance__hostname__icontains: 'asc',
        order_by: 'instance__node_type',
      })
    );
    expect(
      screen.getByRole('button', { name: 'Instance Name' })
    ).toBeInTheDocument();
  });

  /* The rows are one page of what the api holds, so its count is the total. */
  test('pages by the count the api gives', async () => {
    renderUnder('/instances/1/peers');

    await screen.findAllByText('ascender_1');
    // Past the first page there is somewhere to go, which a count taken from
    // the one row shown would never allow.
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Go to next page' })[0]
      ).toBeEnabled()
    );
  });

  test('lets a superuser associate and disassociate peers of an execution node', async () => {
    mockInstance({ node_type: 'execution', managed: false });
    renderUnder('/instances/1/peers');

    expect(
      await screen.findByRole('button', { name: 'Associate' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disassociate' })
    ).toBeInTheDocument();
  });

  test('holds peering back from a user who is not a superuser', async () => {
    mockInstance({ node_type: 'execution', managed: false });
    renderUnder('/instances/1/peers', { is_superuser: false });

    await screen.findAllByText('ascender_1');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
  });

  test('holds peering back on an instance the install manages', async () => {
    mockInstance({ node_type: 'hop', managed: true });
    renderUnder('/instances/1/peers');

    await screen.findAllByText('ascender_1');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
  });
});
