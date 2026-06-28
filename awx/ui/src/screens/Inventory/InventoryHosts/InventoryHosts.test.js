import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHosts from './InventoryHosts';

jest.mock('./InventoryHostList', () => {
  const InventoryHostList = () => <div aria-label="mock-inventory-host-list" />;
  return { __esModule: true, default: InventoryHostList };
});

describe('<InventoryHosts />', () => {
  test('should render inventory host list', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/hosts'],
    });

    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/inventory/:id/hosts/*"
          element={<InventoryHosts />}
        />
      </Routes>,
      { context: { router: { history } } }
    );

    expect(
      screen.getByLabelText('mock-inventory-host-list')
    ).toBeInTheDocument();
  });
});
