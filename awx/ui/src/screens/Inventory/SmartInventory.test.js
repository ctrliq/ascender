import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { InventoriesAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../testUtils/enzymeHelpers';
import mockSmartInventory from './shared/data.smart_inventory.json';
import SmartInventory from './SmartInventory';

jest.mock('../../api');

// SmartInventory uses relative routes and reads the id from useParams, so mount
// it under its v6 parent route at a concrete URL.
function renderAt(initialEntry) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return mountWithContexts(
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
  let wrapper;

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: mockSmartInventory,
    });
    await act(async () => {
      wrapper = renderAt('/inventories/smart_inventory/1/details');
    });
    wrapper.update();
    expect(wrapper.find('SmartInventory').length).toBe(1);
    expect(wrapper.find('RoutedTabs li').length).toBe(6);
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
    await act(async () => {
      wrapper = renderAt('/inventories/smart_inventory/1/details');
    });
    wrapper.update();
    wrapper.find('RoutedTabs li').forEach((tab, index) => {
      expect(tab.text()).toEqual(expectedTabs[index]);
    });
  });

  test('should show content error when api throws an error', async () => {
    const error = new Error();
    error.response = { status: 404 };
    InventoriesAPI.readDetail.mockRejectedValueOnce(error);
    await act(async () => {
      wrapper = renderAt('/inventories/smart_inventory/1/details');
    });
    expect(InventoriesAPI.readDetail).toHaveBeenCalledTimes(1);
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
    expect(wrapper.find('ContentError Title').text()).toEqual('Not Found');
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: mockSmartInventory,
    });
    await act(async () => {
      wrapper = renderAt('/inventories/smart_inventory/1/foobar');
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
  });
});
