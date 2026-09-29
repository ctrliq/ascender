import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { OrganizationsAPI, TeamsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationTeamList from './OrganizationTeamList';

vi.mock('../../../api');

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
    vi.mocked(OrganizationsAPI.readTeams).mockResolvedValue(
      listData as unknown as ResponseOf<typeof OrganizationsAPI.readTeams>
    );
    vi.mocked(OrganizationsAPI.readTeamsOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof OrganizationsAPI.readTeamsOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    expect(
      await screen.findByRole('link', { name: 'one' })
    ).toBeInTheDocument();
    ['two', 'three', 'four', 'five'].forEach((name) => {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    });
  });

  test('should show content error for failed team fetch', async () => {
    vi.mocked(OrganizationsAPI.readTeams).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(<OrganizationTeamList id={1} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('adds a team in this organization, for somebody who may', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/71/teams'],
    });
    const { user } = renderWithContexts(
      <OrganizationTeamList
        id={71}
        organization={{ id: 71, name: 'measure-org' }}
      />,
      { context: { router: { history } } }
    );

    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(history.location.pathname).toBe('/teams/add');
    expect(history.location.state).toEqual({
      organization: { id: 71, name: 'measure-org' },
    });
  });

  test('offers no Add to somebody who may not add a team', async () => {
    vi.mocked(OrganizationsAPI.readTeamsOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.readTeamsOptions>);
    renderWithContexts(<OrganizationTeamList id={71} />);

    expect(await screen.findByText('one')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });

  test('deletes the selected teams, which destroys them', async () => {
    vi.mocked(TeamsAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof TeamsAPI.destroy>
    );
    const { user } = renderWithContexts(<OrganizationTeamList id={71} />);
    const row = (await screen.findByRole('link', { name: 'two' })).closest(
      'tr'
    )!;

    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Teams?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'confirm delete' }));

    await waitFor(() => expect(TeamsAPI.destroy).toHaveBeenCalledWith(2));
    expect(TeamsAPI.destroy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(OrganizationsAPI.readTeams).toHaveBeenCalledTimes(2)
    );
  });

  test('refuses to delete a team the viewer may not delete', async () => {
    vi.mocked(OrganizationsAPI.readTeams).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'one',
            url: '/org/team/1',
            summary_fields: {
              user_capabilities: { edit: false, delete: false },
            },
          },
        ],
      },
    } as unknown as ResponseOf<typeof OrganizationsAPI.readTeams>);
    const { user } = renderWithContexts(<OrganizationTeamList id={71} />);
    const row = (await screen.findByRole('link', { name: 'one' })).closest(
      'tr'
    )!;

    await user.click(within(row).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
