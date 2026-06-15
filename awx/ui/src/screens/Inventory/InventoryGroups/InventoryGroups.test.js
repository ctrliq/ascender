import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InventoryGroups from './InventoryGroups';

jest.mock('../../../api');

// InventoryGroups uses relative routes, so mount it under its v6 parent route.
function renderUnder(initialEntry, inventory) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return mountWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/*"
        element={
          <InventoryGroups setBreadcrumb={() => {}} inventory={inventory} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroups />', () => {
  test('initially renders successfully', async () => {
    let wrapper;
    await act(async () => {
      wrapper = renderUnder('/inventories/inventory/1/groups', {
        id: 1,
        name: 'Foo',
      });
    });
    expect(wrapper.length).toBe(1);
    expect(wrapper.find('InventoryGroupsList').length).toBe(1);
  });
  test('test that InventoryGroupsAdd renders', async () => {
    let wrapper;
    await act(async () => {
      wrapper = renderUnder('/inventories/inventory/1/groups/add', {
        id: 1,
        name: 'Foo',
      });
    });
    expect(wrapper.find('InventoryGroupsAdd').length).toBe(1);
  });
});
