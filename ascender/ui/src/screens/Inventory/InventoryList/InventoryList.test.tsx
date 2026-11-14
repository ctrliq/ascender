import React from 'react';
import { createMemoryHistory } from 'history';
import { act, screen, waitFor, within } from '@testing-library/react';
import { InventoriesAPI, JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InventoryList from './InventoryList';

vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/JobTemplates');
vi.mock('../../../api/models/WorkflowJobTemplates');

const mockInventories = [
  {
    id: 1,
    type: 'inventory',
    url: '/api/v2/inventories/1/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: true, copy: true, adhoc: true },
    },
    created: '2019-10-04T16:56:48.025455Z',
    modified: '2019-10-04T16:56:48.025468Z',
    name: 'Inv no hosts',
    description: '',
    organization: 1,
    kind: '',
    host_filter: null,
    variables: '---',
    has_active_failures: false,
    total_hosts: 0,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
  {
    id: 2,
    type: 'inventory',
    url: '/api/v2/inventories/2/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: true, copy: true, adhoc: true },
    },
    created: '2019-10-04T14:28:04.765571Z',
    modified: '2019-10-04T14:28:04.765594Z',
    name: "Mike's Inventory",
    description: '',
    organization: 1,
    kind: '',
    host_filter: null,
    variables: '---',
    has_active_failures: false,
    total_hosts: 1,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
  {
    id: 3,
    type: 'inventory',
    url: '/api/v2/inventories/3/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: false, copy: true, adhoc: true },
    },
    created: '2019-10-04T15:29:11.542911Z',
    modified: '2019-10-04T15:29:11.542924Z',
    name: 'Smart Inv',
    description: '',
    organization: 1,
    kind: 'smart',
    host_filter: 'search=local',
    variables: '',
    has_active_failures: false,
    total_hosts: 1,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
];

describe('<InventoryList />', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    vi.mocked(InventoriesAPI.read).mockResolvedValue({
      data: {
        count: mockInventories.length,
        results: mockInventories,
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.read>);

    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(WorkflowJobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.read>);
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('should load and render inventories', async () => {
    renderWithContexts(<InventoryList />);
    expect(
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Mike's Inventory" })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Smart Inv' })).toBeInTheDocument();
  });

  test('should select inventory when checked', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).closest('tr');
    const checkbox = within(row!).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('should disable delete button when item without delete capability selected', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Smart Inv' })
    ).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await settleTooltips();
  });

  test('should call delete api', async () => {
    vi.mocked(InventoriesAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof InventoriesAPI.destroy>
    );
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(InventoriesAPI.destroy).toHaveBeenCalledTimes(1)
    );
    await settleTooltips();
  });

  test('should show deletion error', async () => {
    vi.mocked(InventoriesAPI.destroy).mockRejectedValue(new Error());
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });

  test('Add button shown for users with ability to POST', async () => {
    renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  test('Add button hidden for users without ability to POST', async () => {
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });

  /*
   * Syncing an inventory needs its update role, which no user_capability
   * carries, so the list asks the api which inventories the reader holds it
   * on and leaves the rest out of a sync.
   */
  describe('sync permission', () => {
    const sourced = mockInventories.map((inventory) => ({
      ...inventory,
      has_inventory_sources: true,
    }));

    function mockRead(updatable: typeof sourced) {
      vi.mocked(InventoriesAPI.read).mockImplementation(((
        params: Record<string, unknown> = {}
      ) => {
        const results =
          params.role_level === 'update_role' ? updatable : sourced;
        return Promise.resolve({
          data: { count: results.length, results },
        });
      }) as unknown as typeof InventoriesAPI.read);
    }

    test('asks the api by update role', async () => {
      mockRead(sourced);
      renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      expect(InventoriesAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          has_inventory_sources: true,
          role_level: 'update_role',
        })
      );
    });

    test('asks about the rows only once they are ticked, not with the list', async () => {
      mockRead(sourced);
      const { user } = renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      // The list draws without waiting on the question for its rows.
      expect(InventoriesAPI.read).not.toHaveBeenCalledWith(
        expect.objectContaining({ id__in: expect.anything() })
      );

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      await waitFor(() =>
        expect(InventoriesAPI.read).toHaveBeenCalledWith(
          expect.objectContaining({
            id__in: '1,2,3',
            role_level: 'update_role',
          })
        )
      );

      // Ticked again, the rows already asked about are not asked about again.
      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      expect(
        vi
          .mocked(InventoriesAPI.read)
          .mock.calls.filter(([params]) => params && 'id__in' in params)
      ).toHaveLength(1);
    });

    test('does not ask about ticked rows that have no source', async () => {
      const { user } = renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

      expect(InventoriesAPI.read).not.toHaveBeenCalledWith(
        expect.objectContaining({ id__in: expect.anything() })
      );
    });

    test('disables Sync All and says why where none may be synced', async () => {
      mockRead([]);
      const { user } = renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      const button = screen.getByRole('button', { name: 'Sync All' });
      expect(button).toBeDisabled();
      await user.hover(button);
      expect(
        await screen.findByText(
          'You do not have permission to sync any of these.'
        )
      ).toBeInTheDocument();
    });

    /*
     * Clicked before the answer about the ticked rows is in, Sync would call
     * them refused. It waits for the answer instead.
     */
    test('holds Sync until it knows which ticked rows may be synced', async () => {
      let answer: (value: unknown) => void = () => {};
      vi.mocked(InventoriesAPI.read).mockImplementation(((
        params: Record<string, unknown> = {}
      ) => {
        if (params.id__in) {
          return new Promise((resolve) => {
            answer = resolve;
          });
        }
        const results =
          params.role_level === 'update_role' ? sourced.slice(0, 1) : sourced;
        return Promise.resolve({ data: { count: results.length, results } });
      }) as unknown as typeof InventoriesAPI.read);
      const { user } = renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled()
      );

      await act(async () => {
        answer({ data: { count: 1, results: sourced.slice(0, 1) } });
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Sync' })).toBeEnabled()
      );
    });

    test('syncs only the ticked inventories the reader may update', async () => {
      mockRead(sourced.slice(0, 1));
      vi.mocked(InventoriesAPI.syncAllSources).mockResolvedValue(
        {} as unknown as ResponseOf<typeof InventoriesAPI.syncAllSources>
      );
      const { user } = renderWithContexts(<InventoryList />);
      await screen.findByRole('link', { name: 'Inv no hosts' });

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      // Which of the ticked rows may be synced is asked once they are ticked.
      await waitFor(() =>
        expect(InventoriesAPI.read).toHaveBeenCalledWith(
          expect.objectContaining({ id__in: '1,2,3' })
        )
      );
      await user.click(screen.getByRole('button', { name: 'Sync' }));

      await waitFor(() =>
        expect(InventoriesAPI.syncAllSources).toHaveBeenCalledTimes(1)
      );
      expect(InventoriesAPI.syncAllSources).toHaveBeenCalledWith(1);
      expect(
        await screen.findByText(
          'You do not have permission to sync 2 of those selected.'
        )
      ).toBeInTheDocument();
    });

    test('Sync All counts and syncs within the search, every page', async () => {
      const [first, , third] = sourced;
      vi.mocked(InventoriesAPI.read).mockImplementation(((
        params: Record<string, unknown> = {}
      ) => {
        if (params.page_size === 200) {
          return Promise.resolve({
            data:
              params.page === 1
                ? { count: 2, results: [first], next: '/page=2' }
                : { count: 2, results: [third], next: null },
          });
        }
        return Promise.resolve({
          data: { count: sourced.length, results: sourced },
        });
      }) as unknown as typeof InventoriesAPI.read);
      vi.mocked(InventoriesAPI.syncAllSources).mockResolvedValue(
        {} as unknown as ResponseOf<typeof InventoriesAPI.syncAllSources>
      );
      const history = createMemoryHistory({
        initialEntries: ['/inventories?inventory.name__icontains=inv'],
      });
      const { user } = renderWithContexts(<InventoryList />, {
        context: { router: { history } },
      });
      await screen.findByRole('link', { name: 'Inv no hosts' });

      // The counts that enable the button are taken within the search.
      expect(InventoriesAPI.read).toHaveBeenCalledWith({
        name__icontains: 'inv',
        has_inventory_sources: true,
        role_level: 'update_role',
        page_size: 1,
      });

      const button = screen.getByRole('button', { name: 'Sync All' });
      await user.hover(button);
      expect(
        await screen.findByText(
          'Sync all Inventories matching the current search'
        )
      ).toBeInTheDocument();

      await user.click(button);
      await settleTooltips();
      await waitFor(() =>
        expect(InventoriesAPI.syncAllSources).toHaveBeenCalledTimes(2)
      );
      expect(InventoriesAPI.syncAllSources).toHaveBeenCalledWith(first!.id);
      expect(InventoriesAPI.syncAllSources).toHaveBeenCalledWith(third!.id);
      expect(InventoriesAPI.read).toHaveBeenCalledWith({
        name__icontains: 'inv',
        has_inventory_sources: true,
        role_level: 'update_role',
        page: 2,
        page_size: 200,
        order_by: 'name',
      });
    });
  });
});
