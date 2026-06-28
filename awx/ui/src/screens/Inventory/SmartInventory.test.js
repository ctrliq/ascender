import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockSmartInventory from './shared/data.smart_inventory.json';
import SmartInventory from './SmartInventory';

jest.mock('../../api');

// SmartInventory uses relative routes and reads the id from useParams, so mount
// it under its v6 parent route at a concrete URL.
function renderAt(initialEntry) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/smart_inventory/:id/*"
        element={<SmartInventory setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<SmartInventory />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: mockSmartInventory,
    });
    const expectedTabs = [
      'Back to Inventories',
      'Details',
      'Access',
      'Hosts',
      'Jobs',
      'Job Templates',
    ];
    renderAt('/inventories/smart_inventory/1/details');
    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(expectedTabs.length);
    expectedTabs.forEach((label) => {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    });
  });

  test('should show content error when api throws an error', async () => {
    const error = new Error();
    error.response = { status: 404 };
    InventoriesAPI.readDetail.mockRejectedValueOnce(error);
    renderAt('/inventories/smart_inventory/1/details');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
    expect(InventoriesAPI.readDetail).toHaveBeenCalledTimes(1);
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: mockSmartInventory,
    });
    renderAt('/inventories/smart_inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
