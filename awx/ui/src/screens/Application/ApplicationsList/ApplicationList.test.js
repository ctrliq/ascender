import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ApplicationsList from './ApplicationsList';

jest.mock('../../../api/models/Applications');

// fresh data per test because one test mutates user_capabilities.edit
function buildApplications() {
  return {
    data: {
      results: [
        {
          id: 1,
          name: 'Foo',
          summary_fields: {
            organization: { name: 'Org 1', id: 10 },
            user_capabilities: { edit: true, delete: true },
          },
          url: '',
          organization: 10,
        },
        {
          id: 2,
          name: 'Bar',
          summary_fields: {
            organization: { name: 'Org 2', id: 20 },
            user_capabilities: { edit: true, delete: true },
          },
          url: '',
          organization: 20,
        },
      ],
      count: 2,
    },
  };
}

const options = { data: { actions: { POST: true } } };

afterEach(() => {
  jest.clearAllMocks();
});

describe('<ApplicationsList/>', () => {
  test('should have data fetched and render 2 rows', async () => {
    ApplicationsAPI.read.mockResolvedValue(buildApplications());
    ApplicationsAPI.readOptions.mockResolvedValue(options);

    renderWithContexts(<ApplicationsList />);

    expect(await screen.findByRole('link', { name: 'Foo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bar' })).toBeInTheDocument();
    expect(ApplicationsAPI.read).toHaveBeenCalled();
    expect(ApplicationsAPI.readOptions).toHaveBeenCalled();
  });

  test('should delete item successfully', async () => {
    ApplicationsAPI.read.mockResolvedValue(buildApplications());
    ApplicationsAPI.readOptions.mockResolvedValue(options);
    ApplicationsAPI.destroy.mockResolvedValue({});

    const { user } = renderWithContexts(<ApplicationsList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    const checkbox = within(row).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(ApplicationsAPI.destroy).toHaveBeenCalledWith(1)
    );
  });

  test('should throw content error', async () => {
    ApplicationsAPI.read.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'get',
            url: '/api/v2/applications/',
          },
          data: 'An error occurred',
        },
      })
    );
    ApplicationsAPI.readOptions.mockResolvedValue(options);

    renderWithContexts(<ApplicationsList />);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should render deletion error modal', async () => {
    ApplicationsAPI.read.mockResolvedValue(buildApplications());
    ApplicationsAPI.readOptions.mockResolvedValue(options);
    ApplicationsAPI.destroy.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/applications/',
          },
          data: 'An error occurred',
        },
      })
    );

    const { user } = renderWithContexts(<ApplicationsList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    // the error modal includes an ErrorDetail with an expandable "Details" toggle
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should not render add button', async () => {
    ApplicationsAPI.read.mockResolvedValue(buildApplications());
    ApplicationsAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });

    renderWithContexts(<ApplicationsList />);
    await screen.findByRole('link', { name: 'Foo' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should not render edit button for first list item', async () => {
    const applications = buildApplications();
    applications.data.results[0].summary_fields.user_capabilities.edit = false;
    ApplicationsAPI.read.mockResolvedValue(applications);
    ApplicationsAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });

    renderWithContexts(<ApplicationsList />);
    await screen.findByRole('link', { name: 'Foo' });

    const fooRow = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    const barRow = screen.getByRole('link', { name: 'Bar' }).closest('tr');
    expect(
      within(fooRow).queryByRole('link', { name: 'Edit application' })
    ).not.toBeInTheDocument();
    expect(
      within(barRow).getByRole('link', { name: 'Edit application' })
    ).toBeInTheDocument();
  });
});
