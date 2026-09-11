import type { ApiResponse } from 'api/Base';
import type { Untyped, Team } from 'types/api';
import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { TeamsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamEdit from './TeamEdit';

vi.mock('../../../api');

const updatedTeamData = {
  name: 'new name',
  description: 'new description',
  organization: { id: 2, name: 'Other Org' },
};

vi.mock('../shared/TeamForm', () => ({
  default: function MockTeamForm({
    handleSubmit,
    handleCancel,
    submitError,
  }: Untyped) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button
          type="button"
          onClick={() =>
            handleSubmit({
              name: 'new name',
              description: 'new description',
              organization: { id: 2, name: 'Other Org' },
            })
          }
        >
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

const mockData = {
  name: 'Foo',
  description: 'Bar',
  id: 1,
  summary_fields: { organization: { id: 1, name: 'Default' } },
} as unknown as Team;

describe('<TeamEdit />', () => {
  let history: Untyped;

  const renderEdit = () => {
    history = createMemoryHistory({});
    return renderWithContexts(<TeamEdit team={mockData} />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('handleSubmit calls api update and navigates to the details page', async () => {
    vi.mocked(TeamsAPI.update).mockResolvedValue({
      data: { ...mockData },
    } as unknown as ApiResponse<Untyped>);
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(TeamsAPI.update).toHaveBeenCalledWith(1, {
        ...updatedTeamData,
        organization: 2,
      })
    );
    expect(history.location.pathname).toEqual('/teams/1/details');
  });

  test('should navigate to team detail when cancel is clicked', async () => {
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/teams/1/details');
  });

  test('failed form submission shows an error message', async () => {
    vi.mocked(TeamsAPI.update).mockRejectedValue(
      Object.assign(new Error('request failed'), {
        response: { data: { detail: 'An error occurred' } },
      })
    );
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
