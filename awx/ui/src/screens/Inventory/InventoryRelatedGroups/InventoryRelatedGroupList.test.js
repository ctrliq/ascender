import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI, InventoriesAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import mockRelatedGroups from '../shared/data.relatedGroups.json';

jest.mock('../../../api/models/Groups');
jest.mock('../../../api/models/Inventories');
jest.mock('../../../api/models/CredentialTypes');

function renderUnder(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
        element={<InventoryRelatedGroupList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

const groupsOptions = {
  data: {
    actions: { GET: {}, POST: {} },
    related_search_fields: [
      'parents__search',
      'inventory__search',
      'inventory_sources__search',
      'created_by__search',
      'children__search',
      'modified_by__search',
      'hosts__search',
    ],
  },
};

const adHocOptions = {
  data: {
    actions: {
      GET: {
        module_name: {
          choices: [
            ['command', 'command'],
            ['shell', 'shell'],
          ],
        },
      },
      POST: {},
    },
  },
};

const mockGroups = [
  {
    id: 1,
    type: 'group',
    name: 'foo',
    inventory: 1,
    url: '/api/v2/groups/1',
    summary_fields: { user_capabilities: { delete: true, edit: true } },
  },
  {
    id: 2,
    type: 'group',
    name: 'bar',
    inventory: 1,
    url: '/api/v2/groups/2',
    summary_fields: { user_capabilities: { delete: true, edit: true } },
  },
];

describe('<InventoryRelatedGroupList />', () => {
  const url = '/inventories/inventory/2/groups/2/nested_groups';

  beforeEach(() => {
    GroupsAPI.readChildren.mockResolvedValue({
      data: { ...mockRelatedGroups },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue(groupsOptions);
    InventoriesAPI.readAdHocOptions.mockResolvedValue(adHocOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch inventory related groups from api and render them in the list', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(GroupsAPI.readChildren).toHaveBeenCalled();
    expect(InventoriesAPI.readGroupsOptions).toHaveBeenCalled();
    expect(
      screen.getAllByRole('link', { name: /Inventory 0/ })
    ).toHaveLength(3);
  });

  test('should render Run Commands Button', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(
      screen.getByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    const checkbox = screen.getByRole('checkbox', { name: 'Select row 0' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /select row/i,
    });
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readGroupsOptions.mockRejectedValueOnce(new Error());
    renderUnder(url);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should hide add dropdown button without POST permission', async () => {
    InventoriesAPI.readGroupsOptions.mockResolvedValueOnce({
      data: {
        actions: { GET: {} },
        related_search_fields: groupsOptions.data.related_search_fields,
      },
    });
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should associate existing group', async () => {
    GroupsAPI.readPotentialGroups.mockResolvedValue({
      data: { count: mockGroups.length, results: mockGroups },
    });
    GroupsAPI.associateChildGroup.mockResolvedValue({});
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Add existing group' })
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(GroupsAPI.readPotentialGroups).toHaveBeenCalledWith('2', {
        not__id: '2',
        not__parents: '2',
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
    await user.click(await within(dialog).findByText('foo'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(GroupsAPI.associateChildGroup).toHaveBeenCalledTimes(1)
    );
    await settleTooltips();
  });

  test('should not render Run Commands button', async () => {
    InventoriesAPI.readAdHocOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {
            module_name: {
              choices: [
                ['command', 'command'],
                ['shell', 'shell'],
              ],
            },
          },
        },
      },
    });
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryRelatedGroupList> for constructed inventories', () => {
  beforeEach(() => {
    GroupsAPI.readChildren.mockResolvedValue({
      data: { ...mockRelatedGroups },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue(groupsOptions);
    InventoriesAPI.readAdHocOptions.mockResolvedValue(adHocOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Should not show associate, or disassociate button', async () => {
    renderUnder('/inventories/constructed_inventory/1/groups/2/nested_groups');
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
  });
});
