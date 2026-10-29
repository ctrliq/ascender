import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI, InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import mockRelatedGroups from '../shared/data.relatedGroups.json';

vi.mock('../../../api/models/Groups');
vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/CredentialTypes');

function renderUnder(url: string) {
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
    vi.mocked(GroupsAPI.readChildren).mockResolvedValue({
      data: { ...mockRelatedGroups },
    } as unknown as ResponseOf<typeof GroupsAPI.readChildren>);
    vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValue(
      groupsOptions as unknown as ResponseOf<
        typeof InventoriesAPI.readGroupsOptions
      >
    );
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue(
      adHocOptions as unknown as ResponseOf<
        typeof InventoriesAPI.readAdHocOptions
      >
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should fetch inventory related groups from api and render them in the list', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(GroupsAPI.readChildren).toHaveBeenCalled();
    expect(InventoriesAPI.readGroupsOptions).toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /Inventory 0/ })).toHaveLength(
      3
    );
  });

  test('offers Add for a new group and Associate for an existing one', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute(
      'href',
      '/inventories/inventory/2/groups/2/nested_groups/add'
    );
    expect(
      screen.getByRole('button', { name: 'Associate' })
    ).toBeInTheDocument();
  });

  test('should offer a run of each kind the list can start', async () => {
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });

    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent)
    ).toEqual(['Job', 'Workflow', 'Command']);
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

  /*
   * A tick kept across a new search could sit on a group the search hides,
   * and the toolbar's Disassociate would still reach it.
   */
  test('clears the ticks when the search changes', async () => {
    const { user, history } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    const checkbox = screen.getByRole('checkbox', { name: 'Select row 0' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    act(() => history.replace(`${url}?group.name__icontains=x`));

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Select row 0' })
      ).not.toBeChecked()
    );
  });

  test('steps back a page when every group on it is disassociated', async () => {
    vi.mocked(GroupsAPI.disassociateChildGroup).mockResolvedValue(
      {} as unknown as ResponseOf<typeof GroupsAPI.disassociateChildGroup>
    );
    const { user, history } = renderUnder(`${url}?group.page=2`);
    await screen.findAllByRole('link', { name: /Inventory 0/ });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Confirm/ }));

    await waitFor(() =>
      expect(history.location.search).not.toContain('group.page=2')
    );
    expect(GroupsAPI.disassociateChildGroup).toHaveBeenCalledTimes(3);
    await settleTooltips();
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readGroupsOptions).mockRejectedValueOnce(
      new Error()
    );
    renderUnder(url);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should hide Add and Associate without POST permission', async () => {
    vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValueOnce({
      data: {
        actions: { GET: {} },
        related_search_fields: groupsOptions.data.related_search_fields,
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readGroupsOptions>);
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
  });

  test('should associate existing group', async () => {
    vi.mocked(GroupsAPI.readPotentialGroups).mockResolvedValue({
      data: { count: mockGroups.length, results: mockGroups },
    } as unknown as ResponseOf<typeof GroupsAPI.readPotentialGroups>);
    vi.mocked(GroupsAPI.associateChildGroup).mockResolvedValue(
      {} as unknown as ResponseOf<typeof GroupsAPI.associateChildGroup>
    );
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    await user.click(screen.getByRole('button', { name: 'Associate' }));
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
    await user.click(within(dialog).getByRole('button', { name: 'Associate' }));
    await waitFor(() =>
      expect(GroupsAPI.associateChildGroup).toHaveBeenCalledTimes(1)
    );
    await settleTooltips();
  });

  test('should not render Run Commands button', async () => {
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof InventoriesAPI.readAdHocOptions>);
    renderUnder(url);
    await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryRelatedGroupList> for read-only inventories', () => {
  beforeEach(() => {
    vi.mocked(GroupsAPI.readChildren).mockResolvedValue({
      data: { ...mockRelatedGroups },
    } as unknown as ResponseOf<typeof GroupsAPI.readChildren>);
    vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValue(
      groupsOptions as unknown as ResponseOf<
        typeof InventoriesAPI.readGroupsOptions
      >
    );
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue(
      adHocOptions as unknown as ResponseOf<
        typeof InventoriesAPI.readAdHocOptions
      >
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test.each(['constructed_inventory', 'federated_inventory'])(
    'Should not show associate, or disassociate button for %s',
    async (inventoryType) => {
      renderUnder(`/inventories/${inventoryType}/1/groups/2/nested_groups`);
      await screen.findAllByRole('link', { name: /Inventory 0/ });
      expect(
        screen.queryByRole('link', { name: 'Add' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Associate' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Disassociate' })
      ).not.toBeInTheDocument();
    }
  );

  test('links related groups within the inventory type in the url', async () => {
    renderUnder('/inventories/federated_inventory/1/groups/2/nested_groups');
    const links = await screen.findAllByRole('link', { name: /Inventory 0/ });
    expect(links[0]?.getAttribute('href')).toMatch(
      /^#?\/inventories\/federated_inventory\/1\/groups\/\d+\/details$/
    );
  });
});
