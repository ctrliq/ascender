import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InventoryGroupHosts from './InventoryGroupHosts';

jest.mock('../../../api');

describe('<InventoryGroupHosts />', () => {
  let wrapper;

  test('initially renders successfully', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/1/nested_hosts'],
    });

    await act(async () => {
      wrapper = mountWithContexts(
        <Routes>
          <Route
            path="/inventories/:inventoryType/:id/groups/:groupId/nested_hosts/*"
            element={<InventoryGroupHosts />}
          />
        </Routes>,
        { context: { router: { history } } }
      );
    });
    expect(wrapper.length).toBe(1);
    expect(wrapper.find('InventoryGroupHostList').length).toBe(1);
  });
});
