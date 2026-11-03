import type { ExecutionEnvironment } from 'types/api';
import React from 'react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { MockFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentAdd from './ExecutionEnvironmentAdd';

vi.mock('../../../api');

// The form has its own suite; stub it so we can drive the container's
// submit/cancel/error handling and observe the query-param prefill it passes.
vi.mock('../shared/ExecutionEnvironmentForm', () => ({
  default: function MockExecutionEnvironmentForm({
    onSubmit,
    onCancel,
    submitError,
    executionEnvironment,
  }: MockFormProps & {
    executionEnvironment?: Partial<ExecutionEnvironment>;
  }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <div data-testid="prefill-image">{executionEnvironment?.image}</div>
        <div data-testid="prefill-organization">
          {executionEnvironment?.summary_fields?.organization?.name}
        </div>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              name: 'Test EE',
              image: 'https://registry.com/image/container',
              credential: { id: 4 },
              organization: { id: 9 },
            })
          }
        >
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

describe('<ExecutionEnvironmentAdd/>', () => {
  /*
   * The page reads what the form draws with before it renders it, so that the
   * whole page has one loading state rather than one inside the card.
   */
  beforeEach(() => {
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: { pull: { choices: [] } } } },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
  });

  let history: TestHistory;

  const renderAdd = (initialEntry = '/execution_environments') => {
    history = createMemoryHistory({ initialEntries: [initialEntry] });
    return renderWithContexts(<ExecutionEnvironmentAdd />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.create).mockResolvedValue({
      data: { id: 42 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.create>);
    const { user } = renderAdd();
    await user.click(await screen.findByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.create).toHaveBeenCalledWith({
        name: 'Test EE',
        image: 'https://registry.com/image/container',
        credential: 4,
        organization: 9,
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/execution_environments/42/details'
      )
    );
  });

  test('handleCancel returns the user back to the list', async () => {
    const { user } = renderAdd();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/execution_environments');
  });

  test('failed form submission shows an error message', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.create).mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  test('prefills the image from the query params', async () => {
    renderAdd('/execution_environments/add?image=https://myhub.io/repo:2.0');
    // The page reads before it renders the form, so the fill is asserted once
    // the form is on screen rather than on the first paint.
    expect(await screen.findByTestId('prefill-image')).toHaveTextContent(
      'https://myhub.io/repo:2.0'
    );
  });

  describe('when opened from an organization', () => {
    const renderFromOrganization = () => {
      history = createMemoryHistory({
        initialEntries: [
          {
            pathname: '/execution_environments/add',
            state: { organization: { id: 71, name: 'measure-org' } },
          },
        ],
      });
      return renderWithContexts(<ExecutionEnvironmentAdd />, {
        context: { router: { history } },
      });
    };

    test('starts the form in that organization', async () => {
      renderFromOrganization();
      expect(
        await screen.findByTestId('prefill-organization')
      ).toHaveTextContent('measure-org');
    });

    test('cancels back to the organization it came from', async () => {
      const { user } = renderFromOrganization();
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      expect(history.location.pathname).toEqual(
        '/organizations/71/execution_environments'
      );
    });
  });
});
