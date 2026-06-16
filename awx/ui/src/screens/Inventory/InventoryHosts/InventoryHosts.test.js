import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InventoryHosts from './InventoryHosts';

jest.mock('./InventoryHostList', () => {
  const InventoryHostList = () => <div />;
  return {
    __esModule: true,
    default: InventoryHostList,
  };
});

describe('<InventoryHosts />', () => {
  test('should render inventory host list', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/hosts'],
    });

    const wrapper = mountWithContexts(
      <Routes>
        <Route
          path="/inventories/inventory/:id/hosts/*"
          element={<InventoryHosts />}
        />
      </Routes>,
      { context: { router: { history } } }
    );

    expect(wrapper.find('InventoryHostList').length).toBe(1);
  });
});
