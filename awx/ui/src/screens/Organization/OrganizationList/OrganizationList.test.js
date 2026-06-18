import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { OrganizationsAPI, CredentialsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationsList from './OrganizationList';

jest.mock('../../../api');

const mockOrganizations = {
  data: {
    count: 3,
    results: [
      {
        name: 'Organization 0',
        id: 1,
        url: '/organizations/1',
        summary_fields: {
          related_field_counts: {
            teams: 3,
            users: 4,
          },
          user_capabilities: {
            delete: true,
            edit: true,
          },
        },
      },
      {
        name: 'Organization 1',
        id: 2,
        url: '/organizations/2',
        summary_fields: {
          related_field_counts: {
            teams: 2,
            users: 5,
          },
          user_capabilities: {
            delete: true,
            edit: true,
          },
        },
      },
      {
        name: 'Organization 2',
        id: 3,
        url: '/organizations/3',
        summary_fields: {
          related_field_counts: {
            teams: 5,
            users: 6,
          },
          user_capabilities: {
            delete: true,
            edit: true,
          },
        },
      },
    ],
  },
  isModalOpen: false,
  warningTitle: 'title',
  warningMsg: 'message',
};

describe('<OrganizationsList />', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({ data: { count: 0 } });
    OrganizationsAPI.read.mockResolvedValue(mockOrganizations);
    OrganizationsAPI.readOptions.mockResolvedValue({
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

  test('Items are rendered after loading', async () => {
    renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });
    expect(OrganizationsAPI.read).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByRole('link', { name: /^Organization \d$/ })
    ).toHaveLength(3);
  });

  test('should build the proper number of delete detail requests', () => {
    const deleteDetailsRequests = relatedResourceDeleteRequests(
      (str) => str
    ).organization(mockOrganizations.data.results[0]);
    expect(deleteDetailsRequests).toHaveLength(7);
  });

  test('Item appears selected after selecting it', async () => {
    const { user } = renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });
    const row = screen
      .getByRole('link', { name: 'Organization 0' })
      .closest('tr');
    const checkbox = within(row).getByRole('checkbox');

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('All items appear selected after select-all and unselected after unselect-all', async () => {
    const { user } = renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });

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

  test('Expected api calls are made for multi-delete', async () => {
    OrganizationsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });
    expect(OrganizationsAPI.read).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(OrganizationsAPI.destroy).toHaveBeenCalledTimes(3)
    );
    expect(OrganizationsAPI.read).toHaveBeenCalledTimes(2);
  });

  test('Error dialog shown for failed deletion', async () => {
    OrganizationsAPI.destroy.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/organizations/1',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });

    const row = screen
      .getByRole('link', { name: 'Organization 0' })
      .closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    // settleTooltips() was a ~700ms dead wait here: it only settles a tooltip
    // that appears after a modal closes, but this test leaves the error modal
    // open, so there is nothing for it to settle. Drop it.
  });

  test('Add button shown for users with ability to POST', async () => {
    renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('Add button hidden for users without ability to POST', async () => {
    OrganizationsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    });
    renderWithContexts(<OrganizationsList />);
    await screen.findByRole('link', { name: 'Organization 0' });
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
