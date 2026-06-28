import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroup from './InventoryGroup';

jest.mock('../../../api');

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

const inventory = { id: 1, name: 'Foo' };

// InventoryGroup reads :inventoryType/:id/:groupId via useParams and renders a
// nested v6 route tree, so mount it under its real parent route at a concrete
// URL.
function renderAt(path) {
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
    GroupsAPI.readDetail.mockResolvedValue(groupData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders successfully', async () => {
    renderAt('/inventories/inventory/1/groups/1/details');
    expect(await screen.findByRole('tab', { name: 'Details' })).toBeInTheDocument();
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
    GroupsAPI.readDetail.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderAt('/inventories/inventory/1/groups/1/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});

describe('constructed inventory', () => {
  beforeEach(() => {
    GroupsAPI.readDetail.mockResolvedValue(groupData);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
