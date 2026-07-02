import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilderEdit from './ExecutionEnvironmentBuilderEdit';

jest.mock('../../../api');

const builderData = {
  id: 42,
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'latest',
  execution_environment_file: 'execution-environment.yml',
  summary_fields: {
    project: {
      id: 7,
      name: 'Demo Project',
    },
    credential: {
      id: 4,
      name: 'Container Registry',
      kind: 'registry',
    },
  },
};

const updatedValues = {
  name: 'Updated Builder',
  image: 'updated-ee',
  tag: 'v2',
  execution_environment_file: 'nested/execution-environment.yml',
  project: 7,
  credential: { id: 4, name: 'Container Registry' },
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
              name: 'Updated Builder',
              image: 'updated-ee',
              tag: 'v2',
              execution_environment_file: 'nested/execution-environment.yml',
              project: { id: 7, name: 'Demo Project' },
              credential: { id: 4, name: 'Container Registry' },
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
  }
);

describe('<ExecutionEnvironmentBuilderEdit/>', () => {
  let history;
  let onUpdate;

  const renderEdit = (builder = builderData) => {
    history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/42/edit'],
    });
    onUpdate = jest.fn();
    return renderWithContexts(
      <ExecutionEnvironmentBuilderEdit builder={builder} onUpdate={onUpdate} />,
      {
        context: { router: { history } },
      }
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render form', () => {
    renderEdit();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  test('handleSubmit should call the api and redirect to detail page', async () => {
    ExecutionEnvironmentBuildersAPI.update.mockResolvedValue({});
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.update).toHaveBeenCalledWith(42, {
        ...updatedValues,
        credential: 4,
      })
    );
    expect(onUpdate).toHaveBeenCalled();
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/execution_environment_builders/42'
      )
    );
  });

  test('should navigate to detail page when cancel is clicked', async () => {
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/execution_environment_builders/42'
    );
  });

  test('failed form submission should show an error message', async () => {
    ExecutionEnvironmentBuildersAPI.update.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  test('should render loading when builder is null', () => {
    renderEdit(null);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
