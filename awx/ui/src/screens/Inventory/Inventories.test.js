import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { InventoriesAPI, OrganizationsAPI } from 'api';

import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Inventories from './Inventories';

jest.mock('../../api');
// stub the list so the /inventories route renders without hitting the API
jest.mock('./InventoryList', () => ({
  __esModule: true,
  InventoryList: () => null,
}));
// stub the detail so this suite asserts route resolution, not detail rendering
jest.mock('./InventoryDetail', () => {
  const InventoryDetail = () => <div data-testid="inventory-detail" />;
  return { __esModule: true, default: InventoryDetail };
});

describe('<Inventories />', () => {
  test('initially renders without crashing', () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    const { container } = renderWithContexts(
      <Routes>
        <Route path="/inventories/*" element={<Inventories />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );
    expect(container).toBeInTheDocument();
  });

  // Guards against the absolute-vs-relative regression: a detail tab URL must
  // resolve to that tab through the dispatcher, not fall through to not-found.
  test('resolves a detail tab through the dispatcher', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: {
        id: 1,
        name: 'Foo',
        kind: '',
        summary_fields: { user_capabilities: {} },
      },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/details'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/inventories/*" element={<Inventories />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );

    expect(await screen.findByTestId('inventory-detail')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText('Something went wrong...')
      ).not.toBeInTheDocument()
    );
  });
});
