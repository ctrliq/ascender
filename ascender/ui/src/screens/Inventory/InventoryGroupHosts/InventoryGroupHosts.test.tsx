import type { Group } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupHosts from './InventoryGroupHosts';

vi.mock('../../../api');
vi.mock('../InventoryGroupHostAdd', () => {
  const InventoryGroupHostAdd = () => <div aria-label="mock-group-host-add" />;
  return { __esModule: true, default: InventoryGroupHostAdd };
});
vi.mock('./InventoryGroupHostList', () => {
  const InventoryGroupHostList = () => (
    <div aria-label="mock-group-host-list" />
  );
  return { __esModule: true, default: InventoryGroupHostList };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_hosts/*"
        element={<InventoryGroupHosts inventoryGroup={{ id: 1 } as Group} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return history;
}

describe('<InventoryGroupHosts />', () => {
  test('initially renders successfully', () => {
    renderAt('/inventories/inventory/1/groups/1/nested_hosts');
    expect(screen.getByLabelText('mock-group-host-list')).toBeInTheDocument();
  });

  test('mounts the add form for a regular inventory', () => {
    renderAt('/inventories/inventory/1/groups/1/nested_hosts/add');
    expect(screen.getByLabelText('mock-group-host-add')).toBeInTheDocument();
  });

  test.each(['constructed_inventory', 'federated_inventory'])(
    'sends the add url of a %s back to the host list',
    (inventoryType) => {
      const history = renderAt(
        `/inventories/${inventoryType}/1/groups/1/nested_hosts/add`
      );
      expect(screen.getByLabelText('mock-group-host-list')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('mock-group-host-add')
      ).not.toBeInTheDocument();
      expect(history.location.pathname).toBe(
        `/inventories/${inventoryType}/1/groups/1/nested_hosts`
      );
    }
  );
});
