import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroups from './InventoryRelatedGroups';

vi.mock('../../../api');
// stub the leaf screens so route resolution can be asserted without the API
vi.mock('./InventoryRelatedGroupList', () => {
  const InventoryRelatedGroupList = () => (
    <div aria-label="mock-related-group-list" />
  );
  return { __esModule: true, default: InventoryRelatedGroupList };
});
vi.mock('../InventoryRelatedGroupAdd', () => {
  const InventoryRelatedGroupAdd = () => (
    <div aria-label="mock-related-group-add" />
  );
  return { __esModule: true, default: InventoryRelatedGroupAdd };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
        element={<InventoryRelatedGroups />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return history;
}

describe('<InventoryRelatedGroups />', () => {
  test('renders the list', () => {
    renderAt('/inventories/inventory/1/groups/1/nested_groups');
    expect(
      screen.getByLabelText('mock-related-group-list')
    ).toBeInTheDocument();
  });

  test('mounts the add form for a regular inventory', () => {
    renderAt('/inventories/inventory/1/groups/1/nested_groups/add');
    expect(screen.getByLabelText('mock-related-group-add')).toBeInTheDocument();
  });

  test.each(['constructed_inventory', 'federated_inventory'])(
    'sends the add url of a %s back to the related groups list',
    (inventoryType) => {
      const history = renderAt(
        `/inventories/${inventoryType}/1/groups/1/nested_groups/add`
      );
      expect(
        screen.getByLabelText('mock-related-group-list')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('mock-related-group-add')
      ).not.toBeInTheDocument();
      expect(history.location.pathname).toBe(
        `/inventories/${inventoryType}/1/groups/1/nested_groups`
      );
    }
  );
});
