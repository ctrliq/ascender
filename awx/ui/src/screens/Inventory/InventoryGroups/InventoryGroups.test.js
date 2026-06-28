import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroups from './InventoryGroups';

jest.mock('../../../api');

// stub the leaf screens so route resolution can be asserted without the API
jest.mock('./InventoryGroupsList', () => {
  const InventoryGroupsList = () => <div data-testid="groups-list" />;
  return { __esModule: true, default: InventoryGroupsList };
});
jest.mock('../InventoryGroupAdd/InventoryGroupAdd', () => {
  const InventoryGroupsAdd = () => <div data-testid="groups-add" />;
  return { __esModule: true, default: InventoryGroupsAdd };
});

// InventoryGroups uses relative routes, so mount it under its v6 parent route.
function renderUnder(initialEntry, inventory) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
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
  test('initially renders successfully', () => {
    renderUnder('/inventories/inventory/1/groups', { id: 1, name: 'Foo' });
    expect(screen.getByTestId('groups-list')).toBeInTheDocument();
  });

  test('test that InventoryGroupsAdd renders', () => {
    renderUnder('/inventories/inventory/1/groups/add', { id: 1, name: 'Foo' });
    expect(screen.getByTestId('groups-add')).toBeInTheDocument();
  });
});
