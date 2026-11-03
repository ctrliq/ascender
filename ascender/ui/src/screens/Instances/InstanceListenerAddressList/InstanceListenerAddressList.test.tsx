import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstancesAPI, ReceptorAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InstanceListenerAddressList from './InstanceListenerAddressList';

vi.mock('../../../api');

function renderUnder(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instances/:id/listener_addresses"
        element={<InstanceListenerAddressList setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InstanceListenerAddressList />', () => {
  beforeEach(() => {
    vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
      data: { id: 1, hostname: 'awx_1', node_type: 'hybrid' },
    } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
    vi.mocked(InstancesAPI.readReceptorAddresses).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            instance: 1,
            address: 'awx_1',
            port: 2222,
            protocol: 'tcp',
          },
        ],
      },
    } as unknown as ResponseOf<typeof InstancesAPI.readReceptorAddresses>);
    vi.mocked(ReceptorAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof ReceptorAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * The instance's own addresses, asked for with the list's search, sort and
   * page, rather than the first page of every address filtered here.
   */
  test('reads the instance addresses with the query the list holds', async () => {
    renderUnder(
      '/instances/1/listener_addresses?address.address__icontains=awx&address.order_by=-port&address.page=2'
    );

    expect(await screen.findByText('awx_1')).toBeInTheDocument();
    expect(InstancesAPI.readReceptorAddresses).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        address__icontains: 'awx',
        order_by: '-port',
        page: 2,
      })
    );
    expect(ReceptorAPI.read).not.toHaveBeenCalled();
  });

  test('reads again when the search changes', async () => {
    const { history } = renderUnder('/instances/1/listener_addresses');
    await screen.findByText('awx_1');

    act(() =>
      history.push(
        '/instances/1/listener_addresses?address.address__icontains=zzz'
      )
    );

    await waitFor(() =>
      expect(InstancesAPI.readReceptorAddresses).toHaveBeenLastCalledWith(
        '1',
        expect.objectContaining({ address__icontains: 'zzz' })
      )
    );
  });
});
