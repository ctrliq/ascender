import React from 'react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { TeamsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { MockHandlerFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamAdd from './TeamAdd';

vi.mock('../../../api');

vi.mock('../shared/TeamForm', () => ({
  default: function MockTeamForm({
    handleSubmit,
    handleCancel,
    submitError,
    team,
  }: MockHandlerFormProps & {
    team?: { summary_fields?: { organization?: { name: string } } };
  }) {
    return (
      <div>
        <span data-testid="form-organization">
          {team?.summary_fields?.organization?.name ?? ''}
        </span>
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
  },
}));

describe('<TeamAdd />', () => {
  let history: TestHistory;

  const renderAdd = () => {
    history = createMemoryHistory({});
    return renderWithContexts(<TeamAdd />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('handleSubmit posts to the api and redirects', async () => {
    vi.mocked(TeamsAPI.create).mockResolvedValue({
      data: { id: 5 },
    } as unknown as ResponseOf<typeof TeamsAPI.create>);
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
    vi.mocked(TeamsAPI.create).mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  describe('when opened from an organization', () => {
    const renderFromOrganization = () => {
      history = createMemoryHistory({
        initialEntries: [
          {
            pathname: '/teams/add',
            state: { organization: { id: 71, name: 'measure-org' } },
          },
        ],
      });
      return renderWithContexts(<TeamAdd />, {
        context: { router: { history } },
      });
    };

    test('starts the form in that organization', () => {
      renderFromOrganization();
      expect(screen.getByTestId('form-organization')).toHaveTextContent(
        'measure-org'
      );
    });

    test('cancels back to the organization it came from', async () => {
      const { user } = renderFromOrganization();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(history.location.pathname).toEqual('/organizations/71/teams');
    });
  });
});
