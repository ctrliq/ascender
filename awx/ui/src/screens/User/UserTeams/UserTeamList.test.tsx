import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { UsersAPI, TeamsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import UserTeamList from './UserTeamList';

vi.mock('../../../api');
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 1,
    userId: 2,
  }),
}));

const mockAPIUserTeamList = [
  {
    name: 'Team 0',
    id: 1,
    url: '/teams/1',
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
      },
      object_roles: {
        member_role: {
          id: 42,
        },
        admin_role: {
          id: 43,
        },
        read_role: {
          id: 44,
        },
      },
    },
  },
  {
    name: 'Team 1',
    id: 2,
    url: '/teams/2',
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
      },
      object_roles: {
        member_role: {
          id: 12,
        },
        admin_role: {
          id: 13,
        },
        read_role: {
          id: 14,
        },
      },
    },
  },
  {
    name: 'Team 2',
    id: 3,
    url: '/teams/3',
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
      },
      object_roles: {
        member_role: {
          id: 22,
        },
        admin_role: {
          id: 23,
        },
        read_role: {
          id: 24,
        },
      },
    },
  },
];

const options = { data: { actions: { POST: true } } };

describe('<UserTeamList />', () => {
  let user: TestUser;

  beforeEach(async () => {
    vi.mocked(UsersAPI.readTeams).mockResolvedValue({
      data: {
        count: mockAPIUserTeamList.length,
        results: mockAPIUserTeamList,
      },
    } as unknown as ResponseOf<typeof UsersAPI.readTeams>);

    vi.mocked(UsersAPI.readTeamsOptions).mockResolvedValue(
      options as unknown as ApiResponse<any>
    );
    vi.mocked(UsersAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
    const history = createMemoryHistory({
      initialEntries: ['/users/1/teams'],
    });
    ({ user } = renderWithContexts(<UserTeamList />, {
      context: {
        router: { history },
      },
    }));
    await screen.findByRole('link', { name: 'Team 0' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should load and render teams', async () => {
    expect(screen.getAllByRole('link', { name: /^Team \d$/ })).toHaveLength(3);
  });

  test('should fetch teams from the api and render them in the list', () => {
    expect(UsersAPI.readTeams).toHaveBeenCalled();
    expect(UsersAPI.readTeamsOptions).toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /^Team \d$/ })).toHaveLength(3);
  });

  test('should show associate team modal when adding an existing team', async () => {
    vi.mocked(TeamsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof TeamsAPI.read>);
    await user.click(screen.getByRole('button', { name: 'Associate' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settleTooltips();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('should show error modal for failed disassociation', async () => {
    vi.mocked(UsersAPI.disassociateRole).mockRejectedValue(new Error());
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate related team(s)?')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'confirm disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to disassociate one or more teams.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    await waitFor(() => expect(UsersAPI.readTeams).toHaveBeenCalledTimes(2));
    // Close the error modal while still mounted (unmounting through an open
    // focus trap re-engages a toolbar tooltip), then settle.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('expected api calls are made for multi-delete', async () => {
    expect(UsersAPI.disassociateRole).toHaveBeenCalledTimes(0);
    expect(UsersAPI.readTeams).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate related team(s)?')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'confirm disassociate' })
    );
    await waitFor(() =>
      expect(UsersAPI.disassociateRole).toHaveBeenCalledTimes(9)
    );
    await waitFor(() => expect(UsersAPI.readTeams).toHaveBeenCalledTimes(2));
  });

  test('should make expected api request when associating teams', async () => {
    vi.mocked(UsersAPI.associateRole).mockResolvedValue({
      id: 2,
    } as unknown as ResponseOf<typeof UsersAPI.associateRole>);
    vi.mocked(UsersAPI.readTeamsOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof UsersAPI.readTeamsOptions>);
    vi.mocked(TeamsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            name: 'Baz',
            id: 12,
            url: '/teams/42',
            summary_fields: {
              user_capabilities: {
                delete: true,
                edit: true,
              },
              object_roles: {
                admin_role: {
                  id: 78,
                },
                member_role: {
                  id: 79,
                },
                read_role: {
                  id: 80,
                },
              },
            },
          },
        ],
      },
    } as unknown as ResponseOf<typeof TeamsAPI.read>);
    await user.click(screen.getByRole('button', { name: 'Associate' }));
    await user.click(await screen.findByText('Baz'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(UsersAPI.associateRole).toHaveBeenCalledTimes(1);
    expect(TeamsAPI.read).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(UsersAPI.readTeams).toHaveBeenCalledTimes(2));
  });
});
