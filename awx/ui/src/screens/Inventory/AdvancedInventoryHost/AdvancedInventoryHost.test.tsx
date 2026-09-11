import type { Host, Untyped, Inventory } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../shared/data.host.json';
import AdvancedInventoryHost from './AdvancedInventoryHost';

vi.mock('../../../api');

const mockSmartInventory = {
  id: 1234,
  name: 'Mock Smart Inventory',
} as unknown as Inventory;

// AdvancedInventoryHost reads :inventoryType/:hostId via useParams and renders
// a nested v6 route tree, so mount it under its real parent route at a concrete
// URL.
function renderAt(url: Untyped) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/:hostId/*"
        element={
          <AdvancedInventoryHost
            inventory={mockSmartInventory}
            setBreadcrumb={() => {}}
          />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<AdvancedInventoryHost />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readHostDetail).mockResolvedValue(
      mockHost as unknown as Host
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderAt('/inventories/smart_inventory/1234/hosts/2/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = ['Back to Hosts', 'Details'];
    expectedTabs.forEach((name) =>
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    );
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readHostDetail).mockRejectedValueOnce(new Error());
    renderAt('/inventories/smart_inventory/1234/hosts/2/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderAt('/inventories/smart_inventory/1234/hosts/2/foobar');
    await waitFor(() =>
      expect(
        screen.getByText(/view smart inventory host details/i)
      ).toBeInTheDocument()
    );
  });
});
