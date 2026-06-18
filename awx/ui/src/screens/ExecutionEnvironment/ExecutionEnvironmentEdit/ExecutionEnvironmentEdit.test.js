import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentEdit from './ExecutionEnvironmentEdit';

jest.mock('../../../api');

const executionEnvironmentData = {
  id: 42,
  credential: { id: 4 },
  description: 'A simple EE',
  image: 'https://registry.com/image/container',
  pull: 'one',
  name: 'Test EE',
};

const updateExecutionEnvironmentData = {
  image: 'https://registry.com/image/container2',
  description: 'Updated new description',
};

jest.mock('../shared/ExecutionEnvironmentForm', () =>
  function MockExecutionEnvironmentForm({ onSubmit, onCancel, submitError }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button
          type="button"
          onClick={() => onSubmit(updateExecutionEnvironmentData)}
        >
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<ExecutionEnvironmentEdit/>', () => {
  let history;

  const renderEdit = () => {
    history = createMemoryHistory();
    return renderWithContexts(
      <ExecutionEnvironmentEdit
        executionEnvironment={executionEnvironmentData}
      />,
      { context: { router: { history } } }
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    ExecutionEnvironmentsAPI.update.mockResolvedValue({});
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.update).toHaveBeenCalledWith(42, {
        ...updateExecutionEnvironmentData,
        credential: null,
        organization: null,
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/execution_environments/42/details'
      )
    );
  });

  test('should navigate to details when cancel is clicked', async () => {
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/execution_environments/42/details'
    );
  });

  test('failed form submission should show an error message', async () => {
    ExecutionEnvironmentsAPI.update.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
