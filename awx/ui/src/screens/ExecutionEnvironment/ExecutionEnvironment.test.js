import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ExecutionEnvironment from './ExecutionEnvironment';

jest.mock('../../api/models/ExecutionEnvironments');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('./ExecutionEnvironmentDetails', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentDetails'),
  };
});
jest.mock('./ExecutionEnvironmentEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentEdit'),
  };
});
jest.mock('./ExecutionEnvironmentTemplate', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentTemplateList'),
  };
});

const executionEnvironment = {
  id: 42,
  name: 'Foo',
  image: 'quay.io/foo/bar',
  summary_fields: { user_capabilities: { edit: true, delete: true } },
};

// ExecutionEnvironment uses paths relative to its parent route, so mount it
// under the same /execution_environments/:id/* route that
// ExecutionEnvironments.js gives it in the app.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/execution_environments/:id/*"
        element={<ExecutionEnvironment setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<ExecutionEnvironment />', () => {
  beforeEach(() => {
    ExecutionEnvironmentsAPI.readDetail.mockResolvedValue({
      data: executionEnvironment,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('fetches the execution environment detail', async () => {
    renderAt('/execution_environments/42/details');
    expect(
      await screen.findByText('ExecutionEnvironmentDetails')
    ).toBeInTheDocument();
    // real route params are strings (the previous test mocked a number)
    expect(ExecutionEnvironmentsAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/execution_environments/42/edit');
    expect(
      await screen.findByText('ExecutionEnvironmentEdit')
    ).toBeInTheDocument();
  });

  test('renders the templates panel at /templates', async () => {
    renderAt('/execution_environments/42/templates');
    expect(
      await screen.findByText('ExecutionEnvironmentTemplateList')
    ).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/execution_environments/42');
    expect(
      await screen.findByText('ExecutionEnvironmentDetails')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/execution_environments/42/details'
      )
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    ExecutionEnvironmentsAPI.readDetail.mockRejectedValue(err);
    renderAt('/execution_environments/42/details');
    expect(
      await screen.findByText('Execution environment not found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ExecutionEnvironmentDetails')
    ).not.toBeInTheDocument();
  });
});
