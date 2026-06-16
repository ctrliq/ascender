import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { TeamsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamEdit from './TeamEdit';

jest.mock('../../../api');

const updatedTeamData = {
  name: 'new name',
  description: 'new description',
  organization: { id: 2, name: 'Other Org' },
};

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
  }
);

const mockData = {
  name: 'Foo',
  description: 'Bar',
  id: 1,
  summary_fields: { organization: { id: 1, name: 'Default' } },
};

describe('<TeamEdit />', () => {
  let history;

  const renderEdit = () => {
    history = createMemoryHistory({});
    return renderWithContexts(<TeamEdit team={mockData} />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit calls api update and navigates to the details page', async () => {
    TeamsAPI.update.mockResolvedValue({ data: { ...mockData } });
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
    TeamsAPI.update.mockRejectedValue(
      new Error({ response: { data: { detail: 'An error occurred' } } })
    );
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
