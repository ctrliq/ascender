import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';

// AdvancedInventoryHosts uses relative routes; mount it under its v6 parent.
function renderUnder(initialEntry, props) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return mountWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/*"
        element={<AdvancedInventoryHosts {...props} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

jest.mock('../../../api');
jest.mock('./AdvancedInventoryHostList', () => {
  const AdvancedInventoryHostList = () => <div />;
  return {
    __esModule: true,
    default: AdvancedInventoryHostList,
  };
});

describe('<AdvancedInventoryHosts />', () => {
  test('should render smart inventory host list', () => {
    const wrapper = renderUnder('/inventories/smart_inventory/1/hosts', {
      inventory: { id: 1 },
    });
    expect(wrapper.find('AdvancedInventoryHostList').length).toBe(1);
    expect(wrapper.find('AdvancedInventoryHostList').prop('inventory')).toEqual(
      {
        id: 1,
      }
    );
    jest.clearAllMocks();
  });

  test('should render smart inventory host details', async () => {
    let wrapper;
    await act(async () => {
      wrapper = renderUnder('/inventories/smart_inventory/1/hosts/2', {
        inventory: { id: 1 },
        setBreadcrumb: () => {},
      });
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('AdvancedInventoryHost').length).toBe(1);
    jest.clearAllMocks();
  });
});
