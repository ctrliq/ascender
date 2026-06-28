import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../shared/data.host.json';
import InventoryHost from './InventoryHost';

jest.mock('../../../api');

const mockInventory = {
  id: 3,
  name: 'Mock Inventory',
};

// InventoryHost reads :hostId via useParams and renders a nested v6 route
// tree; mount it under its real parent route at a concrete URL.
function renderUnder(url, { inventory = mockInventory } = {}) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/:hostId/*"
        element={
          <InventoryHost inventory={inventory} setBreadcrumb={() => {}} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryHost />', () => {
  beforeEach(() => {
    InventoriesAPI.readHostDetail.mockResolvedValue({ ...mockHost });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderUnder('/inventories/inventory/3/hosts/2/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = ['Back to Hosts', 'Details', 'Facts', 'Groups', 'Jobs'];
    expectedTabs.forEach((name) =>
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    );
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readHostDetail.mockRejectedValueOnce(new Error());
    renderUnder('/inventories/inventory/3/hosts/2/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderUnder('/inventories/inventory/3/hosts/2/foobar');
    await waitFor(() =>
      expect(
        screen.getByText(/view inventory host details/i)
      ).toBeInTheDocument()
    );
  });
});
