import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { act, screen, within } from '@testing-library/react';
import { InventoriesAPI, GroupsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryGroupsList from './InventoryGroupsList';

vi.mock('../../../api');

function renderUnder(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const result = renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/*"
        element={<InventoryGroupsList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...result, history };
}

const mockGroups = [
  {
    id: 1,
    type: 'group',
    name: 'foo',
    inventory: 1,
    url: '/api/v2/groups/1',
    summary_fields: {
      user_capabilities: { delete: true, edit: true },
    },
  },
  {
    id: 2,
    type: 'group',
    name: 'bar',
    inventory: 1,
    url: '/api/v2/groups/2',
    summary_fields: {
      user_capabilities: { delete: true, edit: true },
    },
  },
  {
    id: 3,
    type: 'group',
    name: 'baz',
    inventory: 1,
    url: '/api/v2/groups/3',
    summary_fields: {
      user_capabilities: { delete: false, edit: false },
    },
  },
];

function mockSuccessfulApis() {
  vi.mocked(InventoriesAPI.readGroups).mockResolvedValue({
    data: {
      count: mockGroups.length,
      results: mockGroups,
    },
  } as unknown as ResponseOf<typeof InventoriesAPI.readGroups>);
  vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValue({
    data: {
      actions: {
        GET: {},
        POST: {},
      },
    },
  } as unknown as ResponseOf<typeof InventoriesAPI.readGroupsOptions>);
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
        POST: {},
      },
    },
  } as unknown as ResponseOf<typeof InventoriesAPI.readAdHocOptions>);
}

describe('<InventoryGroupsList />', () => {
  beforeEach(() => {
    mockSuccessfulApis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('shows each inventory its own groups, not the last one read', async () => {
    const groupsOf: Record<string, string> = {
      '1': 'group of inventory one',
      '2': 'group of inventory two',
    };
    vi.mocked(InventoriesAPI.readGroups).mockImplementation(
      async (inventoryId) =>
        ({
          data: {
            count: 1,
            results: [
              {
                ...mockGroups[0],
                id: Number(inventoryId) * 100,
                name: groupsOf[String(inventoryId)],
              },
            ],
          },
        }) as unknown as ResponseOf<typeof InventoriesAPI.readGroups>
    );

    const { history } = renderUnder('/inventories/inventory/1/groups');
    expect(
      await screen.findByText('group of inventory one')
    ).toBeInTheDocument();

    // Moving to another inventory in the same session, which keeps the
    // cache: the list used to come back from it with the first one's groups.
    act(() => {
      history.push('/inventories/inventory/2/groups');
    });
    expect(
      await screen.findByText('group of inventory two')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('group of inventory one')
    ).not.toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenLastCalledWith(
      '2',
      expect.anything()
    );
  });

  test('should fetch groups from api and render them in the list', async () => {
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByRole('link', { name: 'foo' })
    ).toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'bar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'baz' })).toBeInTheDocument();
  });

  /** The toolbar's run menu, and the kind of run picked from it. */
  const runFromMenu = async (
    user: { click: (el: Element) => Promise<void> },
    kind: string
  ) => {
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(await screen.findByRole('menuitem', { name: kind }));
  };

  test('should offer a run of each kind the list can start', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent)
    ).toEqual(['Job', 'Workflow', 'Command']);
  });

  /*
   * A limit names groups as readily as hosts, so the run is aimed at what is
   * ticked here; the pattern is taken as the modal opens rather than read
   * later, when the list behind it may have been paged.
   */
  test('should run a template against the groups selected', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    const pick = async (name: string) =>
      user.click(
        within(
          (await screen.findByRole('link', { name })).closest('tr')!
        ).getByRole('checkbox')
      );
    await pick('foo');
    await pick('bar');
    await runFromMenu(user, 'Job');

    // The tooltip says the same words as the wizard's title, so the limit is
    // what tells the two apart, and it is the thing under test anyway.
    expect(await screen.findByText('Limit: foo,bar')).toBeInTheDocument();
  });

  /* Nothing ticked is every group in the inventory, said in one word. */
  test('should run a template on the whole inventory when none are ticked', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });

    await runFromMenu(user, 'Workflow');

    expect(await screen.findByText('Limit: all')).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    const row = (await screen.findByRole('link', { name: 'foo' })).closest(
      'tr'
    );
    const checkbox = within(row!).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(3);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should not render ad hoc commands button', async () => {
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
    const { user } = renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent)
    ).toEqual(['Job', 'Workflow']);
  });
});

describe('<InventoryGroupsList/> error handling', () => {
  beforeEach(() => {
    mockSuccessfulApis();
    vi.mocked(GroupsAPI.destroy).mockRejectedValue(new Error());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readGroupsOptions).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error if groups are not successfully fetched from api', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockImplementation(() =>
      Promise.reject(new Error())
    );
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show error modal when group is not successfully deleted from api', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    const row = (await screen.findByRole('link', { name: 'foo' })).closest(
      'tr'
    );
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Group?')).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: 'Delete All Groups and Hosts' })
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});

describe('Constructed Inventory group', () => {
  beforeEach(() => {
    mockSuccessfulApis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should not show add or delete buttons but still show the run menu', async () => {
    renderUnder('/inventories/constructed_inventory/3/groups');
    expect(
      await screen.findByRole('button', { name: 'Run' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });
});
