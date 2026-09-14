import type { Group, Inventory, Paginated } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import type { ApiResponse } from 'api/Base';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroup from './InventoryGroup';

vi.mock('../../../api');

const groupData = {
  data: {
    id: 1,
    name: 'Foo',
    description: 'Bar',
    variables: 'bizz: buzz',
    summary_fields: {
      inventory: { id: 1 },
      created_by: { id: 1, username: 'Athena' },
      modified_by: { id: 1, username: 'Apollo' },
    },
    created: '2020-04-25T01:23:45.678901Z',
    modified: '2020-04-25T01:23:45.678901Z',
  },
};

const inventory = { id: 1, name: 'Foo' } as unknown as Inventory;

// The screen reads the group through the inventory-scoped list, so the mock
// answers like /inventories/:id/groups/?id=:groupId does.
const groupList = (...results: unknown[]) =>
  ({
    data: { count: results.length, results },
  }) as unknown as ApiResponse<Paginated<Group>>;

// InventoryGroup reads :inventoryType/:id/:groupId via useParams and renders a
// nested v6 route tree, so mount it under its real parent route at a concrete
// URL.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/*"
        element={
          <InventoryGroup setBreadcrumb={() => {}} inventory={inventory} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroup />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(
      groupList(groupData.data)
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders successfully', async () => {
    renderAt('/inventories/inventory/1/groups/1/details');
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });

  test('expect all tabs to exist, including Back to Groups', async () => {
    renderAt('/inventories/inventory/1/groups/1/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = [
      'Back to Groups',
      'Details',
      'Related Groups',
      'Hosts',
    ];
    expectedTabs.forEach((name) =>
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    );
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderAt('/inventories/inventory/1/groups/1/foobar');
    expect(
      await screen.findByText('View Inventory Details')
    ).toBeInTheDocument();
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderAt('/inventories/inventory/1/groups/1/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('reads the group through the inventory in the url', async () => {
    renderAt('/inventories/inventory/1/groups/1/details');
    await screen.findByRole('tab', { name: 'Details' });
    expect(InventoriesAPI.readGroups).toHaveBeenCalledWith('1', { id: '1' });
  });

  test('should show not found when the inventory does not present the group', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(groupList());
    renderAt('/inventories/inventory/1/groups/7/details');
    const link = await screen.findByRole('link', {
      name: 'View Inventory Groups',
    });
    expect(link).toHaveAttribute('href', '/inventories/inventory/1/groups');
    expect(
      screen.queryByRole('tab', { name: 'Details' })
    ).not.toBeInTheDocument();
  });
});

describe('constructed inventory', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(
      groupList(groupData.data)
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Constructed Inventory expect all tabs to exist, including Back to Groups', async () => {
    renderAt('/inventories/constructed_inventory/1/groups/1/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = [
      'Back to Groups',
      'Details',
      'Related Groups',
      'Hosts',
    ];
    await waitFor(() =>
      expectedTabs.forEach((name) =>
        expect(screen.getByRole('tab', { name })).toBeInTheDocument()
      )
    );
  });
});

describe('federated inventory', () => {
  // A federated inventory presents the groups of its input inventories, so the
  // group's own inventory id (1) differs from the one in the url (3).
  const federatedInventory = {
    id: 3,
    name: 'Federated',
    kind: 'federated',
  } as unknown as Inventory;

  function renderFederated(path: string) {
    const history = createMemoryHistory({ initialEntries: [path] });
    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/*"
          element={
            <InventoryGroup
              setBreadcrumb={() => {}}
              inventory={federatedInventory}
            />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
    return history;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('sends the edit url back to the details instead of mounting the form', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(
      groupList({ ...groupData.data, id: 2 })
    );
    const history = renderFederated(
      '/inventories/federated_inventory/3/groups/2/edit'
    );
    await screen.findByRole('tab', { name: 'Details' });
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/federated_inventory/3/groups/2/details'
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });

  test('renders a group that belongs to an input inventory', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(
      groupList({ ...groupData.data, id: 2 })
    );
    renderFederated('/inventories/federated_inventory/3/groups/2/details');
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenCalledWith('3', { id: '2' });
    expect(screen.getByRole('tab', { name: 'Back to Groups' })).toHaveAttribute(
      'href',
      '#/inventories/federated_inventory/3/groups'
    );
  });

  test('shows not found, linking back to the federated groups, for a group it does not present', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue(groupList());
    renderFederated('/inventories/federated_inventory/3/groups/9/details');
    expect(
      await screen.findByRole('link', { name: 'View Inventory Groups' })
    ).toHaveAttribute('href', '/inventories/federated_inventory/3/groups');
  });
});
