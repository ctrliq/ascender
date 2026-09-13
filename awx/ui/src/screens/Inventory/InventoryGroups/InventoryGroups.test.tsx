import type { AnyInventory } from 'types/api';
import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroups from './InventoryGroups';

vi.mock('../../../api');

// stub the leaf screens so route resolution can be asserted without the API
vi.mock('./InventoryGroupsList', () => {
  const InventoryGroupsList = () => <div data-testid="groups-list" />;
  return { __esModule: true, default: InventoryGroupsList };
});
vi.mock('../InventoryGroupAdd/InventoryGroupAdd', () => {
  const InventoryGroupsAdd = () => <div data-testid="groups-add" />;
  return { __esModule: true, default: InventoryGroupsAdd };
});

const inventory = { id: 1, name: 'Foo' } as unknown as AnyInventory;

// InventoryGroups uses relative routes, so mount it under its v6 parent route.
function renderUnder(initialEntry: string, inventory: AnyInventory) {
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
    renderUnder('/inventories/inventory/1/groups', inventory);
    expect(screen.getByTestId('groups-list')).toBeInTheDocument();
  });

  test('test that InventoryGroupsAdd renders', () => {
    renderUnder('/inventories/inventory/1/groups/add', inventory);
    expect(screen.getByTestId('groups-add')).toBeInTheDocument();
  });
});
