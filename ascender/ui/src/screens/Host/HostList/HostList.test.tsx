import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI, InventoriesAPI, RootAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import HostList from './HostList';

vi.mock('../../../api');

const mockHosts = [
  {
    id: 1,
    name: 'Host 1',
    url: '/api/v2/hosts/1',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: {
        id: 1,
        name: 'inv 1',
      },
      user_capabilities: {
        delete: true,
        update: true,
        edit: true,
      },
      recent_jobs: [],
    },
  },
  {
    id: 2,
    name: 'Host 2',
    url: '/api/v2/hosts/2',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: {
        id: 1,
        name: 'inv 1',
      },
      user_capabilities: {
        delete: true,
        update: true,
        edit: true,
      },
      recent_jobs: [],
    },
  },
  {
    id: 3,
    name: 'Host 3',
    url: '/api/v2/hosts/3',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: {
        id: 1,
        name: 'inv 1',
      },
      recent_jobs: [
        {
          id: 123,
          name: 'Bibbity Bop',
          status: 'success',
          finished: '2020-01-27T19:40:36.208728Z',
        },
      ],
      user_capabilities: {
        delete: false,
        update: false,
        edit: false,
      },
    },
  },
];

function getRow(name: string) {
  return screen.getByRole('link', { name }).closest('tr');
}

// each host row has two checkbox-role controls: the row select and the
// HostToggle switch (aria-label "Toggle Host"); this returns the select one
function getRowSelect(name: string) {
  return within(getRow(name)!)
    .getAllByRole('checkbox')
    .find((box) => box.getAttribute('aria-label') !== 'Toggle Host');
}

describe('<HostList />', () => {
  beforeEach(() => {
    /*
     * Any run of a command reaches the brand name on its way through the
     * wizard, and a mock that answers nothing throws once the test that
     * opened it has finished, so every test here answers it.
     */
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: { BRAND_NAME: 'Ascender Automation' },
    } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);

    vi.mocked(HostsAPI.read).mockResolvedValue({
      data: {
        count: mockHosts.length,
        results: mockHosts,
      },
    } as unknown as ResponseOf<typeof HostsAPI.read>);

    vi.mocked(HostsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: ['first_key__search', 'ansible_facts'],
      },
    } as unknown as ResponseOf<typeof HostsAPI.readOptions>);

    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue({
      data: {
        actions: {
          GET: { module_name: { choices: [['command', 'command']] } },
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readAdHocOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });
  });

  test('Hosts are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    expect(HostsAPI.read).toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /^Host \d$/ })).toHaveLength(3);
  });

  /** The toolbar's run menu, and the kind of run picked from it. */
  const runFromMenu = async (
    user: { click: (el: Element) => Promise<void> },
    kind: string
  ) => {
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(await screen.findByRole('menuitem', { name: kind }));
  };

  /*
   * A command is sent to one inventory's own endpoint, and this list is every
   * inventory's hosts: with nothing ticked the wizard asks which inventory
   * the command runs in, the way the runs list does.
   */
  test('should ask what a command runs on where nothing is ticked', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await runFromMenu(user, 'Command');

    expect(
      await screen.findByRole('combobox', { name: 'Run On' })
    ).toBeInTheDocument();
  });

  /* Ticked hosts name their inventory, so the form opens on them instead. */
  test('should take the command straight to the hosts ticked', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await waitFor(() =>
      expect(InventoriesAPI.readAdHocOptions).toHaveBeenCalledWith(1)
    );
    await runFromMenu(user, 'Command');

    expect(
      screen.queryByRole('combobox', { name: 'Run On' })
    ).not.toBeInTheDocument();
  });

  test('should refuse a selection that spans two inventories', async () => {
    vi.mocked(HostsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [mockHosts[0], { ...mockHosts[1], inventory: 2 }],
      },
    } as unknown as ResponseOf<typeof HostsAPI.read>);
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await waitFor(() =>
      expect(InventoriesAPI.readAdHocOptions).toHaveBeenCalledWith(1)
    );

    // A second inventory leaves the selection naming neither of them, so the
    // command asks which one it runs in rather than assuming.
    await user.click(getRowSelect('Host 2')!);
    await runFromMenu(user, 'Command');
    expect(
      await screen.findByRole('combobox', { name: 'Run On' })
    ).toBeInTheDocument();
  });

  test('should run the command against the hosts selected', async () => {
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: { id: 1, organization: 1 },
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    /*
     * Every api model inherits read from the same base, so the auto mock gives
     * them one function between them: what each caller gets back is keyed on
     * what it asked for rather than on which model it called.
     */
    vi.mocked(HostsAPI.read).mockImplementation(
      (params) =>
        Promise.resolve(
          (params as { namespace?: string })?.namespace === 'ssh'
            ? { data: { count: 1, results: [{ id: 3 }] } }
            : { data: { count: mockHosts.length, results: mockHosts } }
        ) as ReturnType<typeof HostsAPI.read>
    );
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await waitFor(() =>
      expect(InventoriesAPI.readAdHocOptions).toHaveBeenCalledWith(1)
    );
    await runFromMenu(user, 'Command');

    // The wizard opens on its details step, limited to what was selected. The
    // step's name is in the nav and again on the step itself, hence the all.
    expect((await screen.findAllByText('Details')).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Limit' })).toHaveValue(
        'Host 1'
      )
    );
  });

  /*
   * A template runs against its own inventory; the selection says which of its
   * hosts to run on, so the pattern is taken as the modal opens rather than
   * read later, when the list behind it may have been paged.
   */
  test('should run a template against the hosts selected', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await user.click(getRowSelect('Host 2')!);
    await runFromMenu(user, 'Job');

    // The tooltip says the same words as the title, so the limit is what tells
    // the two apart, and it is the thing under test anyway.
    expect(await screen.findByText('Limit: Host 1,Host 2')).toBeInTheDocument();
  });

  /* Nothing ticked is the whole list, which the run says in one word. */
  test('should run a template on every host when none are ticked', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await runFromMenu(user, 'Job');

    expect(await screen.findByText('Limit: all')).toBeInTheDocument();
  });

  /*
   * One run happens in one inventory, so hosts from two are no limit at all:
   * the wizard asks where to run as the runs list does, which is after the
   * template, since what a template prompts for is what can be asked.
   */
  test('should ask what to run on where the ticks span inventories', async () => {
    vi.mocked(HostsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [mockHosts[0], { ...mockHosts[1], inventory: 2 }],
      },
    } as unknown as ResponseOf<typeof HostsAPI.read>);
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await user.click(getRowSelect('Host 2')!);
    await runFromMenu(user, 'Job');

    expect(
      await screen.findByRole('button', { name: 'Template' })
    ).toBeInTheDocument();
    // No limit was taken from the ticks, so none is announced.
    expect(screen.queryByText(/^Limit:/)).not.toBeInTheDocument();
  });

  test('should select and deselect a single item', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    const checkbox = getRowSelect('Host 1');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox!);
    expect(checkbox).toBeChecked();
    await user.click(checkbox!);
    expect(checkbox).not.toBeChecked();
  });

  test('should select all items', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    await user.click(selectAll);

    ['Host 1', 'Host 2', 'Host 3'].forEach((name) => {
      const rowCheckbox = getRowSelect(name);
      expect(rowCheckbox).toBeChecked();
    });
  });

  test('delete button is disabled if user does not have delete capabilities on a selected host', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    // Host 3 has delete:false
    await user.click(getRowSelect('Host 3')!);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('api is called to delete hosts for each selected host.', async () => {
    vi.mocked(HostsAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof HostsAPI.destroy>
    );
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await user.click(getRowSelect('Host 2')!);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(HostsAPI.destroy).toHaveBeenCalledTimes(2));
  });

  test('error is shown when host not successfully deleted from api', async () => {
    vi.mocked(HostsAPI.destroy).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/hosts/1',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1')!);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should show Add and Smart Inventory buttons according to permissions', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Smart Inventory' })
    ).toBeInTheDocument();
  });

  test('should hide Add and Smart Inventory buttons according to permissions', async () => {
    vi.mocked(HostsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    } as unknown as ResponseOf<typeof HostsAPI.readOptions>);
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Smart Inventory' })
    ).not.toBeInTheDocument();
  });

  test('Smart Inventory button should be disabled when no search params are present', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });
    expect(
      screen.getByRole('button', { name: 'Add Smart Inventory' })
    ).toBeDisabled();
  });

  test('Smart Inventory button should be disabled with ansible facts search', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/hosts?host.host_filter=ansible_facts__ansible_date_time__weekday_number%3D"3"',
      ],
    });
    renderWithContexts(<HostList />, {
      context: { router: { history } },
    });
    await screen.findByRole('link', { name: 'Host 1' });
    expect(
      screen.getByRole('button', { name: 'Add Smart Inventory' })
    ).toBeDisabled();
  });

  test('Clicking Smart Inventory button should navigate to smart inventory form with correct query param', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/hosts?host.name__icontains=foo'],
    });
    const { user } = renderWithContexts(<HostList />, {
      context: { router: { history } },
    });
    await screen.findByRole('link', { name: 'Host 1' });

    const smartInventoryButton = screen.getByRole('button', {
      name: 'Add Smart Inventory',
    });
    expect(smartInventoryButton).not.toBeDisabled();
    await user.click(smartInventoryButton);

    expect(history.location.pathname).toEqual(
      '/inventories/smart_inventory/add'
    );
    expect(history.location.search).toEqual(
      '?host_filter=name__icontains%3Dfoo'
    );
  });
});
