import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { TeamsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import TeamList from './TeamList';

vi.mock('../../../api');

const mockAPITeamList = {
  data: {
    count: 3,
    results: [
      {
        name: 'Team 0',
        id: 1,
        url: '/teams/1',
        summary_fields: { user_capabilities: { delete: true, edit: true } },
      },
      {
        name: 'Team 1',
        id: 2,
        url: '/teams/2',
        summary_fields: { user_capabilities: { delete: true, edit: true } },
      },
      {
        name: 'Team 2',
        id: 3,
        url: '/teams/3',
        summary_fields: { user_capabilities: { delete: true, edit: true } },
      },
    ],
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('<TeamList /> with full permissions', () => {
  let user: Untyped;

  beforeEach(async () => {
    vi.mocked(TeamsAPI.read).mockResolvedValue({
      data: mockAPITeamList.data,
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(TeamsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    } as unknown as ApiResponse<Untyped>);

    ({ user } = renderWithContexts(<TeamList />));
    await screen.findByRole('link', { name: 'Team 0' });
  });

  test('should load and render teams', () => {
    expect(TeamsAPI.read).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Team 0' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team 2' })).toBeInTheDocument();
  });

  test('should select team when checked', async () => {
    const row = screen.getByRole('link', { name: 'Team 0' }).closest('tr');
    const checkbox = within(row!).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(3);
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('should call delete api', async () => {
    vi.mocked(TeamsAPI.destroy).mockResolvedValue(
      {} as unknown as ApiResponse<Untyped>
    );
    await user.click(
      within(
        screen.getByRole('link', { name: 'Team 0' }).closest('tr')!
      ).getByRole('checkbox')
    );
    await user.click(
      within(
        screen.getByRole('link', { name: 'Team 1' }).closest('tr')!
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    await waitFor(() => expect(TeamsAPI.destroy).toHaveBeenCalledTimes(2));
  });

  test('should re-fetch teams after team(s) have been deleted', async () => {
    vi.mocked(TeamsAPI.destroy).mockResolvedValue(
      {} as unknown as ApiResponse<Untyped>
    );
    expect(TeamsAPI.read).toHaveBeenCalledTimes(1);
    await user.click(
      within(
        screen.getByRole('link', { name: 'Team 0' }).closest('tr')!
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    await waitFor(() => expect(TeamsAPI.read).toHaveBeenCalledTimes(2));
  });

  test('should show deletion error', async () => {
    vi.mocked(TeamsAPI.destroy).mockRejectedValue(new Error());
    await user.click(
      within(
        screen.getByRole('link', { name: 'Team 0' }).closest('tr')!
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('Add button shown for users with ability to POST', () => {
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('<TeamList /> without full permissions', () => {
  test('Add button hidden for users without ability to POST', async () => {
    vi.mocked(TeamsAPI.read).mockResolvedValue({
      data: mockAPITeamList.data,
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(TeamsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ApiResponse<Untyped>);

    renderWithContexts(<TeamList />);
    await screen.findByRole('link', { name: 'Team 0' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
