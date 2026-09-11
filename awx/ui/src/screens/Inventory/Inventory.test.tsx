import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockInventory from './shared/data.inventory.json';
import Inventory from './Inventory';

vi.mock('../../api');

// Inventory reads the id from useParams, so mount it under its v6 parent route
// at a concrete URL rather than mocking the router.
function renderAt(initialEntry: Untyped) {
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
    } as unknown as ApiResponse<Untyped>);
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
      'Jobs',
      'Job Templates',
    ];
    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(expectedTabs.length);
    expectedTabs.forEach((label) => {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    });
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderAt('/inventories/inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
