import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { InventoriesAPI, OrganizationsAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
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
// mount it under its ".../sources/:sourceId/*" parent route.
function mountInventorySource(initialEntry, props = {}) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const wrapper = mountWithContexts(
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
  return { wrapper, history };
}

describe('<InventorySource />', () => {
  let wrapper;
  let history;

  beforeEach(async () => {
    await act(async () => {
      ({ wrapper } = mountInventorySource(
        '/inventories/inventory/2/sources/123/details'
      ));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render expected tabs', () => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      data: { ...mockInventorySource },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    });
    const expectedTabs = [
      'Back to Sources',
      'Details',
      'Schedules',
      'Notifications',
    ];
    wrapper.find('RoutedTabs li').forEach((tab, index) => {
      expect(tab.text()).toEqual(expectedTabs[index]);
    });
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      data: { ...mockInventorySource },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    });
    InventoriesAPI.readSourceDetail.mockRejectedValueOnce(new Error());
    await act(async () => {
      ({ wrapper } = mountInventorySource(
        '/inventories/inventory/2/sources/123/details'
      ));
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
    expect(wrapper.find('ContentError Title').text()).toEqual(
      'Something went wrong...'
    );
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      data: { ...mockInventorySource },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    });
    await act(async () => {
      ({ wrapper, history } = mountInventorySource(
        '/inventories/inventory/2/sources/1/foobar'
      ));
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
    expect(wrapper.find('ContentError Title').text()).toEqual('Not Found');
  });

  test('should call api', () => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      data: { ...mockInventorySource },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    });
    expect(InventoriesAPI.readSourceDetail).toHaveBeenCalledWith(2, '123');
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });

  test('should not render notifications tab', () => {
    InventoriesAPI.readSourceDetail.mockResolvedValue({
      data: { ...mockInventorySource },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [] },
    });
    expect(wrapper.find('button[aria-label="Notifications"]').length).toBe(0);
  });
});
