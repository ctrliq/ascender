import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { ConstructedInventoriesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockInventory from './shared/data.inventory.json';
import ConstructedInventory from './ConstructedInventory';

jest.mock('../../api');

// ConstructedInventory reads the id from useParams, so mount it under its v6
// parent route at a concrete URL rather than mocking the router.
function renderAt(initialEntry) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/*"
        element={<ConstructedInventory setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<ConstructedInventory />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    ConstructedInventoriesAPI.readDetail.mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    });
    const expectedTabs = [
      'Back to Inventories',
      'Details',
      'Access',
      'Hosts',
      'Groups',
      'Jobs',
      'Job Templates',
    ];
    renderAt('/inventories/constructed_inventory/1/details');
    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(expectedTabs.length);
    expectedTabs.forEach((label) => {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    });
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    ConstructedInventoriesAPI.readDetail.mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    });
    renderAt('/inventories/constructed_inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
