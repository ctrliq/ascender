import type { Host } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { HostsAPI, InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import HostGroupsList from './HostGroupsList';

vi.mock('../../../api');

const host = {
  summary_fields: {
    inventory: {
      id: 1,
    },
  },
} as unknown as Host;

const mockGroups = [
  {
    id: 1,
    type: 'group',
    name: 'foo',
    inventory: 1,
    url: '/api/v2/groups/1',
    summary_fields: {
      inventory: {
        id: 1,
      },
      user_capabilities: {
        delete: true,
        edit: true,
      },
    },
  },
  {
    id: 2,
    type: 'group',
    name: 'bar',
    inventory: 1,
    url: '/api/v2/groups/2',
    summary_fields: {
      inventory: {
        id: 1,
      },
      user_capabilities: {
        delete: true,
        edit: true,
      },
    },
  },
  {
    id: 3,
    type: 'group',
    name: 'baz',
    inventory: 1,
    url: '/api/v2/groups/3',
    summary_fields: {
      inventory: {
        id: 1,
      },
      user_capabilities: {
        delete: true,
        edit: false,
      },
    },
  },
];

// HostGroupsList reads the host id from useParams (v5-compat), so mount it
// under a real v6 route at the same /hosts/:id/groups path the app uses.
function renderList(props = {}) {
  const history = createMemoryHistory({
    initialEntries: ['/hosts/3/groups'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/hosts/:id/groups/*"
        element={<HostGroupsList host={host} {...props} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

function rowSelect(name: string) {
  const row = screen.getByRole('link', { name }).closest('tr');
  return within(row!).getByRole('checkbox');
}

describe('<HostGroupsList />', () => {
  beforeEach(() => {
    vi.mocked(HostsAPI.readAllGroups).mockResolvedValue({
      data: {
        count: mockGroups.length,
        results: mockGroups,
      },
    } as unknown as ResponseOf<typeof HostsAPI.readAllGroups>);
    vi.mocked(HostsAPI.readGroupsOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof HostsAPI.readGroupsOptions>);
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            module_name: {
              choices: [['command', 'command']],
            },
          },
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readAdHocOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderList();
    expect(
      await screen.findByRole('link', { name: 'foo' })
    ).toBeInTheDocument();
  });

  test('should fetch groups from api and render them in the list', async () => {
    renderList();
    await screen.findByRole('link', { name: 'foo' });
    expect(HostsAPI.readAllGroups).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'foo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'bar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'baz' })).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    const checkbox = rowSelect('foo');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = ['foo', 'bar', 'baz'].map(rowSelect);

    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(HostsAPI.readAllGroups).mockRejectedValueOnce(new Error());
    renderList();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show add button according to permissions', async () => {
    const { unmount } = renderList();
    expect(await screen.findByText('foo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Associate' })
    ).toBeInTheDocument();
    unmount();

    vi.mocked(HostsAPI.readGroupsOptions).mockResolvedValueOnce({
      data: {
        actions: {
          GET: {},
        },
      },
    } as unknown as ResponseOf<typeof HostsAPI.readGroupsOptions>);
    renderList();
    await screen.findByText('foo');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
  });

  test('offers a run on the inventory the host is in', async () => {
    renderList();
    await screen.findByRole('link', { name: 'foo' });

    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(InventoriesAPI.readAdHocOptions).toHaveBeenCalledWith(1);
  });

  // Nothing ticked is this host, not every host in its inventory.
  test('says Run on Host with nothing ticked', async () => {
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Run on Host')).toBeInTheDocument();
  });

  test.each(['constructed', 'federated'])(
    'offers no Associate or Disassociate for a host in a %s inventory',
    async (kind) => {
      renderList({
        host: {
          summary_fields: { inventory: { id: 1, kind } },
        } as unknown as Host,
      });
      await screen.findByRole('link', { name: 'foo' });

      expect(
        screen.queryByRole('button', { name: 'Associate' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Disassociate' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
      // Nor an Actions column, whose rows would have nothing in it.
      expect(
        screen.queryByRole('columnheader', { name: 'Actions' })
      ).not.toBeInTheDocument();
    }
  );

  test('should show associate group modal when adding an existing group', async () => {
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readGroups>);
    vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readGroupsOptions>);
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Associate' }));
    expect(await screen.findByText('Associate Groups')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settleTooltips();
    expect(screen.queryByText('Associate Groups')).not.toBeInTheDocument();
  });

  test('should make expected api request when associating groups', async () => {
    vi.mocked(HostsAPI.associateGroup).mockResolvedValue(
      undefined as unknown as ResponseOf<typeof HostsAPI.associateGroup>
    );
    vi.mocked(InventoriesAPI.readGroups).mockResolvedValue({
      data: {
        count: 1,
        results: [
          { id: 123, name: 'associate me', url: '/api/v2/groups/123/' },
        ],
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readGroups>);
    vi.mocked(InventoriesAPI.readGroupsOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readGroupsOptions>);
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Associate' }));
    const associateItem = await screen.findByText('associate me');
    const associateRow = associateItem.closest('tr');
    await user.click(within(associateRow!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Associate' }));

    await settleTooltips();
    expect(screen.queryByText('Associate Groups')).not.toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenCalledTimes(1);
    expect(HostsAPI.associateGroup).toHaveBeenCalledTimes(1);
  });

  test('expected api calls are made for multi-disassociation', async () => {
    vi.mocked(HostsAPI.disassociateGroup).mockResolvedValue(
      undefined as unknown as ResponseOf<typeof HostsAPI.disassociateGroup>
    );
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    expect(HostsAPI.disassociateGroup).toHaveBeenCalledTimes(0);
    expect(HostsAPI.readAllGroups).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    ['foo', 'bar', 'baz'].forEach((name) =>
      expect(rowSelect(name)).toBeChecked()
    );

    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate the host from these groups?')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(HostsAPI.disassociateGroup).toHaveBeenCalledTimes(3)
    );
    expect(HostsAPI.readAllGroups).toHaveBeenCalledTimes(2);
  });

  test('should show error modal for failed disassociation', async () => {
    vi.mocked(HostsAPI.disassociateGroup).mockRejectedValue(new Error());
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate the host from these groups?')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    // Close the error modal while still mounted (unmounting through an open
    // focus trap re-engages a toolbar tooltip), then settle.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });
});
