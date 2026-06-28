import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI, OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockInventorySource from '../shared/data.inventory_source.json';
import InventorySource from './InventorySource';

jest.mock('../../../api/models/Inventories');
jest.mock('../../../api/models/Organizations');
jest.mock('../../../api/models/InventorySources');

const mockInventory = {
  id: 2,
  name: 'Mock Inventory',
};

// InventorySource reads :sourceId via useParams and uses relative routes, so
// mount it under its real ".../sources/:sourceId/*" parent route at a concrete
// URL.
function renderInventorySource(initialEntry, props = {}) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/sources/:sourceId/*"
        element={
          <InventorySource
            inventory={mockInventory}
            me={{ is_system_auditor: false }}
            setBreadcrumb={() => {}}
            {...props}
          />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventorySource />', () => {
  beforeEach(() => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      ...mockInventorySource,
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = [
      'Back to Sources',
      'Details',
      'Schedules',
      'Notifications',
    ];
    expectedTabs.forEach((name) =>
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    );
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readSourceDetail.mockRejectedValueOnce(new Error());
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderInventorySource('/inventories/inventory/2/sources/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });

  test('should call api', async () => {
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await waitFor(() =>
      expect(InventoriesAPI.readSourceDetail).toHaveBeenCalledWith(2, '123')
    );
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });

  test('should not render notifications tab', async () => {
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [] },
    });
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await screen.findByRole('tab', { name: 'Details' });
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });
});
