import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '@testing-library/react';
import { HostsAPI, InventoriesAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryHostGroupsList from './InventoryHostGroupsList';

jest.mock('../../../api');

const mockGroups = [
  {
    id: 1,
    type: 'group',
    name: 'foo',
    inventory: 1,
    url: '/api/v2/groups/1',
    summary_fields: {
      inventory: { id: 1 },
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
      inventory: { id: 1 },
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
      inventory: { id: 1 },
      user_capabilities: { delete: true, edit: false },
    },
  },
];

function renderList(url = '/inventories/inventory/1/hosts/3/groups') {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/hosts/:hostId/groups/*"
        element={<InventoryHostGroupsList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryHostGroupsList />', () => {
  beforeEach(() => {
    HostsAPI.readAllGroups.mockResolvedValue({
      data: {
        count: mockGroups.length,
        results: mockGroups,
      },
    });
    HostsAPI.readGroupsOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    });
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
          POST: {},
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch groups from api and render them in the list', async () => {
    renderList();
    expect(await screen.findByRole('link', { name: 'foo' })).toBeInTheDocument();
    expect(HostsAPI.readAllGroups).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'bar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'baz' })).toBeInTheDocument();
  });

  test('should render Run Commands button', async () => {
    renderList();
    expect(
      await screen.findByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderList();
    const row = (await screen.findByRole('link', { name: 'foo' })).closest('tr');
    const checkbox = within(row).getByRole('checkbox');
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
    renderList();
    await screen.findByRole('link', { name: 'foo' });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });

  test('should show content error when api throws error on initial render', async () => {
    HostsAPI.readAllGroups.mockImplementation(() => Promise.reject(new Error()));
    renderList();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show add button according to permissions', async () => {
    renderList();
    expect(
      await screen.findByRole('button', { name: 'Add' })
    ).toBeInTheDocument();
  });

  test('should hide add button without POST permission', async () => {
    HostsAPI.readGroupsOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    });
    renderList();
    await screen.findByRole('link', { name: 'foo' });
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should show associate group modal when adding an existing group', async () => {
    InventoriesAPI.readGroups.mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 123, name: 'associable', url: '/api/v2/groups/123/' }],
      },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    const { user } = renderList();
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const modal = await screen.findByRole('dialog');
    // wait for the modal's group list to finish loading before closing it so
    // the pending fetch doesn't resolve after unmount
    await within(modal).findByText('associable');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await settleTooltips();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should make expected api request when associating groups', async () => {
    HostsAPI.associateGroup.mockResolvedValue();
    InventoriesAPI.readGroups.mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 123, name: 'foo', url: '/api/v2/groups/123/' }],
      },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    const { user } = renderList();
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const modal = await screen.findByRole('dialog');
    const groupRow = (await within(modal).findByText('foo')).closest('tr');
    await user.click(within(groupRow).getByRole('checkbox'));
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

    await settleTooltips();
    expect(HostsAPI.associateGroup).toHaveBeenCalledTimes(1);
    expect(InventoriesAPI.readGroups).toHaveBeenCalled();
  });

  test('expected api calls are made for multi-disassociation', async () => {
    HostsAPI.disassociateGroup.mockResolvedValue();
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });
    expect(HostsAPI.disassociateGroup).toHaveBeenCalledTimes(0);
    expect(HostsAPI.readAllGroups).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate group from host?')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'confirm disassociate' })
    );

    await waitFor(() =>
      expect(HostsAPI.disassociateGroup).toHaveBeenCalledTimes(3)
    );
    expect(HostsAPI.readAllGroups).toHaveBeenCalledTimes(2);
  });

  test('should show error modal for failed disassociation', async () => {
    HostsAPI.disassociateGroup.mockRejectedValue(new Error());
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm disassociate' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});
