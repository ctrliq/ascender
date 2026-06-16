import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { TeamsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamAdd from './TeamAdd';

jest.mock('../../../api');

jest.mock('../shared/TeamForm', () =>
  function MockTeamForm({ handleSubmit, handleCancel, submitError }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button
          type="button"
          onClick={() =>
            handleSubmit({
              name: 'new name',
              description: 'new description',
              organization: { id: 1, name: 'Default' },
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
  }
);

describe('<TeamAdd />', () => {
  let history;

  const renderAdd = () => {
    history = createMemoryHistory({});
    return renderWithContexts(<TeamAdd />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit posts to the api and redirects', async () => {
    TeamsAPI.create.mockResolvedValue({ data: { id: 5 } });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(TeamsAPI.create).toHaveBeenCalledWith({
        name: 'new name',
        description: 'new description',
        organization: 1,
      })
    );
    expect(history.location.pathname).toEqual('/teams/5');
  });

  test('should navigate to teams list when cancel is clicked', async () => {
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/teams');
  });

  test('failed form submission shows an error message', async () => {
    TeamsAPI.create.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
