import React from 'react';
import type { Group } from 'types/api';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI, InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryGroupHostList from './InventoryGroupHostList';
import mockHosts from '../shared/data.hosts.json';

vi.mock('../../../api/models/Groups');
vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/CredentialTypes');

function renderUnder(url: string, inventoryGroup?: Group) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_hosts/*"
        element={<InventoryGroupHostList inventoryGroup={inventoryGroup} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

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

describe('<InventoryGroupHostList />', () => {
  const url = '/inventories/inventory/1/groups/2/nested_hosts';

  beforeEach(() => {
    vi.mocked(GroupsAPI.readAllHosts).mockResolvedValue({
      data: { ...mockHosts },
    } as unknown as ResponseOf<typeof GroupsAPI.readAllHosts>);
    vi.mocked(InventoriesAPI.readHostsOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readHostsOptions>);
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue(
      adHocOptions as unknown as ResponseOf<
        typeof InventoriesAPI.readAdHocOptions
      >
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should fetch inventory group hosts from api and render them in the list', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    expect(GroupsAPI.readAllHosts).toHaveBeenCalled();
    expect(InventoriesAPI.readHostsOptions).toHaveBeenCalled();
    expect(InventoriesAPI.readAdHocOptions).toHaveBeenCalled();
    expect(
      screen.getAllByRole('checkbox', { name: /select row/i })
    ).toHaveLength(3);
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    const checkbox = screen.getByRole('checkbox', { name: 'Select row 2' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /select row/i,
    });
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should show Add, Associate and the run menu by permission', async () => {
    renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Associate' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  // Nothing ticked is this group, not every host in the inventory.
  test('says Run on Group with nothing ticked', async () => {
    const { user } = renderUnder(url, {
      id: 2,
      name: 'web',
    } as unknown as Group);
    await screen.findAllByRole('link', { name: /dummy/ });

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run on Group')).toBeInTheDocument();
  });

  test('should hide Add and Associate without POST permission', async () => {
    vi.mocked(InventoriesAPI.readHostsOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readHostsOptions>);
    renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  test('expected api calls are made for multi-delete', async () => {
    vi.mocked(GroupsAPI.disassociateHost).mockResolvedValue(
      {} as unknown as ResponseOf<typeof GroupsAPI.disassociateHost>
    );
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate these hosts from the group?')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );
    await waitFor(() =>
      expect(GroupsAPI.disassociateHost).toHaveBeenCalledTimes(3)
    );
    await waitFor(() =>
      expect(GroupsAPI.readAllHosts).toHaveBeenCalledTimes(2)
    );
  });

  /*
   * A tick kept across a new search could sit on a host the search hides,
   * and the toolbar's Disassociate would still take it out of the group.
   */
  test('clears the ticks when the search changes', async () => {
    const { user, history } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Disassociate' })).toBeEnabled();

    act(() => history.replace(`${url}?host.name__icontains=x`));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled()
    );
  });

  test('should show error modal for failed disassociation', async () => {
    vi.mocked(GroupsAPI.disassociateHost).mockRejectedValue(new Error());
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to disassociate one or more hosts.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should show associate host modal when adding an existing host', async () => {
    vi.mocked(InventoriesAPI.readHosts).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readHosts>);
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('button', { name: 'Associate' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Titled for what the button beneath it does.
    expect(screen.getByText('Associate Hosts')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should make expected api request when associating hosts', async () => {
    vi.mocked(GroupsAPI.associateHost).mockResolvedValue(
      {} as unknown as ResponseOf<typeof GroupsAPI.associateHost>
    );
    vi.mocked(InventoriesAPI.readHosts).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 123, name: 'foo', url: '/api/v2/hosts/123/' }],
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readHosts>);
    const { user } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('button', { name: 'Associate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByText('foo'));
    await user.click(within(dialog).getByRole('button', { name: 'Associate' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(InventoriesAPI.readHosts).toHaveBeenCalledTimes(1);
    expect(GroupsAPI.associateHost).toHaveBeenCalledTimes(1);
    await settleTooltips();
  });

  test('should navigate to host add form when adding a new host', async () => {
    const { user, history } = renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    await user.click(screen.getByRole('link', { name: 'Add' }));
    expect(history.location.pathname).toEqual(
      '/inventories/inventory/1/groups/2/nested_hosts/add'
    );
    await settleTooltips();
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readHostsOptions).mockRejectedValue(new Error());
    renderUnder(url);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
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
    renderUnder(url);
    await screen.findAllByRole('link', { name: /dummy/ });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryGroupHostList> for read-only inventories', () => {
  beforeEach(() => {
    vi.mocked(GroupsAPI.readAllHosts).mockResolvedValue({
      data: { ...mockHosts },
    } as unknown as ResponseOf<typeof GroupsAPI.readAllHosts>);
    vi.mocked(InventoriesAPI.readHostsOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readHostsOptions>);
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
      renderUnder(`/inventories/${inventoryType}/1/groups/2/nested_hosts`);
      await screen.findAllByRole('link', { name: /dummy/ });
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
});
