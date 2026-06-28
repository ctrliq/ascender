import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupHosts from './InventoryGroupHosts';

jest.mock('../../../api');
jest.mock('./InventoryGroupHostList', () => {
  const InventoryGroupHostList = () => (
    <div aria-label="mock-group-host-list" />
  );
  return { __esModule: true, default: InventoryGroupHostList };
});

describe('<InventoryGroupHosts />', () => {
  test('initially renders successfully', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/1/nested_hosts'],
    });

    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/nested_hosts/*"
          element={<InventoryGroupHosts />}
        />
      </Routes>,
      { context: { router: { history } } }
    );

    expect(screen.getByLabelText('mock-group-host-list')).toBeInTheDocument();
  });
});
