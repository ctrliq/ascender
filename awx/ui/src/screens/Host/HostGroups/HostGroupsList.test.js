import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { HostsAPI, InventoriesAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import HostGroupsList from './HostGroupsList';

jest.mock('../../../api');

const host = {
  summary_fields: {
    inventory: {
      id: 1,
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

function rowSelect(name) {
  const row = screen.getByRole('link', { name }).closest('tr');
  return within(row).getByRole('checkbox');
}

describe('<HostGroupsList />', () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderList();
    expect(await screen.findByRole('link', { name: 'foo' })).toBeInTheDocument();
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
    HostsAPI.readAllGroups.mockRejectedValueOnce(new Error());
    renderList();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show add button according to permissions', async () => {
    const { unmount } = renderList();
    expect(await screen.findByText('foo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    unmount();

    HostsAPI.readGroupsOptions.mockResolvedValueOnce({
      data: {
        actions: {
          GET: {},
        },
      },
    });
    renderList();
    await screen.findByText('foo');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should show associate group modal when adding an existing group', async () => {
    InventoriesAPI.readGroups.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    });
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Select Groups')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settleTooltips();
    expect(screen.queryByText('Select Groups')).not.toBeInTheDocument();
  });

  test('should make expected api request when associating groups', async () => {
    HostsAPI.associateGroup.mockResolvedValue();
    InventoriesAPI.readGroups.mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 123, name: 'associate me', url: '/api/v2/groups/123/' }],
      },
    });
    InventoriesAPI.readGroupsOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    const { user } = renderList();
    await screen.findByRole('link', { name: 'foo' });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    const associateItem = await screen.findByText('associate me');
    const associateRow = associateItem.closest('tr');
    await user.click(within(associateRow).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await settleTooltips();
    expect(screen.queryByText('Select Groups')).not.toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenCalledTimes(1);
    expect(HostsAPI.associateGroup).toHaveBeenCalledTimes(1);
  });

  test('expected api calls are made for multi-disassociation', async () => {
    HostsAPI.disassociateGroup.mockResolvedValue();
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
    expect(
      await screen.findByText('Disassociate group from host?')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'confirm disassociate' })
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
