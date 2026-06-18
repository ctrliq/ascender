import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import HostList from './HostList';

jest.mock('../../../api');

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

function getRow(name) {
  return screen.getByRole('link', { name }).closest('tr');
}

// each host row has two checkbox-role controls: the row select and the
// HostToggle switch (aria-label "Toggle host"); this returns the select one
function getRowSelect(name) {
  return within(getRow(name))
    .getAllByRole('checkbox')
    .find((box) => box.getAttribute('aria-label') !== 'Toggle host');
}

describe('<HostList />', () => {
  beforeEach(() => {
    HostsAPI.read.mockResolvedValue({
      data: {
        count: mockHosts.length,
        results: mockHosts,
      },
    });

    HostsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: ['first_key__search', 'ansible_facts'],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });
  });

  test('Hosts are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    expect(HostsAPI.read).toHaveBeenCalled();
    expect(
      screen.getAllByRole('link', { name: /^Host \d$/ })
    ).toHaveLength(3);
  });

  test('should select and deselect a single item', async () => {
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    const checkbox = getRowSelect('Host 1');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
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
    await user.click(getRowSelect('Host 3'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('api is called to delete hosts for each selected host.', async () => {
    HostsAPI.destroy = jest.fn().mockResolvedValue({});
    const { user } = renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    await user.click(getRowSelect('Host 1'));
    await user.click(getRowSelect('Host 2'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(HostsAPI.destroy).toHaveBeenCalledTimes(2));
  });

  test('error is shown when host not successfully deleted from api', async () => {
    HostsAPI.destroy.mockRejectedValue(
      new Error({
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

    await user.click(getRowSelect('Host 1'));
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
      screen.getByRole('button', { name: 'Smart Inventory' })
    ).toBeInTheDocument();
  });

  test('should hide Add and Smart Inventory buttons according to permissions', async () => {
    HostsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    });
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Smart Inventory' })
    ).not.toBeInTheDocument();
  });

  test('Smart Inventory button should be disabled when no search params are present', async () => {
    renderWithContexts(<HostList />);
    await screen.findByRole('link', { name: 'Host 1' });
    expect(
      screen.getByRole('button', { name: 'Smart Inventory' })
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
      screen.getByRole('button', { name: 'Smart Inventory' })
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
      name: 'Smart Inventory',
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
