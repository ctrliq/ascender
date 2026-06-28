import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostGroups from './InventoryHostGroups';

// stub the leaf list so the index route renders without hitting the API
jest.mock('./InventoryHostGroupsList', () => {
  const InventoryHostGroupsList = () => <div data-testid="host-groups-list" />;
  return { __esModule: true, default: InventoryHostGroupsList };
});

describe('<InventoryHostGroups />', () => {
  test('initially renders successfully', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/hosts/1/groups'],
    });

    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/inventory/:id/hosts/:hostId/groups/*"
          element={<InventoryHostGroups />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(screen.getByTestId('host-groups-list')).toBeInTheDocument();
  });
});
