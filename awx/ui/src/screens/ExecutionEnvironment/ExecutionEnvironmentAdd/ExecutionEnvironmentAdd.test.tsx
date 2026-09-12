import type { Untyped } from 'types/api';
import React from 'react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
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
  }: Untyped) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <div data-testid="prefill-image">{executionEnvironment?.image}</div>
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
    await user.click(screen.getByRole('button', { name: 'Submit' }));
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
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/execution_environments');
  });

  test('failed form submission shows an error message', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.create).mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  test('prefills the image from the query params', () => {
    renderAdd('/execution_environments/add?image=https://myhub.io/repo:2.0');
    expect(screen.getByTestId('prefill-image')).toHaveTextContent(
      'https://myhub.io/repo:2.0'
    );
  });
});
