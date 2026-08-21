import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentBuilderAdd from './ExecutionEnvironmentBuilderAdd';

jest.mock('../../../api');

const submitValues = {
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'latest',
  execution_environment_file: 'execution-environment.yml',
  project: 7,
};

// The form has its own suite; stub it so we can drive the container's
// submit/cancel/error handling.
jest.mock('../shared/ExecutionEnvironmentBuilderForm', () =>
  function MockExecutionEnvironmentBuilderForm({ onSubmit, onCancel, submitError }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button
          type="button"
          onClick={() =>
            onSubmit({
              name: 'Test Builder',
              image: 'my-custom-ee',
              tag: 'latest',
              execution_environment_file: 'execution-environment.yml',
              project: { id: 7, name: 'Demo Project' },
              credential: { id: 4, name: 'Container Registry' },
            })
          }
        >
          Submit
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              name: 'Test Builder',
              image: 'my-custom-ee',
              tag: 'latest',
              execution_environment_file: 'execution-environment.yml',
              project: { id: 7, name: 'Demo Project' },
              credential: null,
            })
          }
        >
          Submit without credential
        </button>
        <button type="button" aria-label="Cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<ExecutionEnvironmentBuilderAdd/>', () => {
  let history;

  const renderAdd = () => {
    history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/add'],
    });
    return renderWithContexts(<ExecutionEnvironmentBuilderAdd />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render form', () => {
    renderAdd();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  test('handleSubmit should call the api and redirect to detail page', async () => {
    ExecutionEnvironmentBuildersAPI.create.mockResolvedValue({
      data: { id: 42 },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.create).toHaveBeenCalledWith({
        ...submitValues,
        credential: 4,
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/execution_environment_builders/42')
    );
  });

  test('handleSubmit should send null credential when not provided', async () => {
    ExecutionEnvironmentBuildersAPI.create.mockResolvedValue({
      data: { id: 42 },
    });
    const { user } = renderAdd();
    await user.click(
      screen.getByRole('button', { name: 'Submit without credential' })
    );
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.create).toHaveBeenCalledWith({
        ...submitValues,
        credential: null,
      })
    );
  });

  test('handleCancel should return the user back to the list', async () => {
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/execution_environment_builders');
  });

  test('failed form submission should show an error message', async () => {
    ExecutionEnvironmentBuildersAPI.create.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
