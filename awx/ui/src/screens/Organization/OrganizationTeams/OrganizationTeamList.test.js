import React from 'react';
import { screen } from '@testing-library/react';

import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationTeamList from './OrganizationTeamList';

jest.mock('../../../api');

const listData = {
  data: {
    count: 7,
    results: [
      {
        id: 1,
        name: 'one',
        url: '/org/team/1',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 2,
        name: 'two',
        url: '/org/team/2',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 3,
        name: 'three',
        url: '/org/team/3',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 4,
        name: 'four',
        url: '/org/team/4',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 5,
        name: 'five',
        url: '/org/team/5',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
    ],
  },
};

describe('<OrganizationTeamList />', () => {
  beforeEach(() => {
    OrganizationsAPI.readTeams.mockResolvedValue(listData);
    OrganizationsAPI.readTeamsOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should load teams on mount with expected query params', async () => {
    renderWithContexts(<OrganizationTeamList id={1} searchString="" />);
    await screen.findByRole('link', { name: 'one' });

    expect(OrganizationsAPI.readTeams).toHaveBeenCalledWith(1, {
      page: 1,
      page_size: 5,
      order_by: 'name',
    });
  });

  test('should render the fetched teams', async () => {
    renderWithContexts(<OrganizationTeamList id={1} searchString="" />);

    expect(await screen.findByRole('link', { name: 'one' })).toBeInTheDocument();
    ['two', 'three', 'four', 'five'].forEach((name) => {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    });
  });

  test('should show content error for failed team fetch', async () => {
    OrganizationsAPI.readTeams.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(<OrganizationTeamList id={1} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
