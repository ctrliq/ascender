import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockInventory from './shared/data.inventory.json';
import Inventory from './Inventory';

vi.mock('../../api');

// Inventory reads the id from useParams, so mount it under its v6 parent route
// at a concrete URL rather than mocking the router.
function renderAt(initialEntry: string) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/*"
        element={<Inventory setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Inventory />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: mockInventory,
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderAt('/inventories/inventory/1/details');
    const expectedTabs = [
      'Back to Inventories',
      'Details',
      'Access',
      'Groups',
      'Hosts',
      'Sources',
      'Job Templates',
      'Runs',
    ];
    const tablist = await screen.findByRole('tablist');
    // In this order, Runs last as on every screen.
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.trim())
    ).toEqual(expectedTabs);
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderAt('/inventories/inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
