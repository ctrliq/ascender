import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ExecutionEnvironment from './ExecutionEnvironment';

vi.mock('../../api/models/ExecutionEnvironments');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./ExecutionEnvironmentDetails', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentDetails'),
  };
});
vi.mock('./ExecutionEnvironmentEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentEdit'),
  };
});
vi.mock('./ExecutionEnvironmentTemplate', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
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
function renderAt(path: Untyped) {
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
    vi.mocked(ExecutionEnvironmentsAPI.readDetail).mockResolvedValue({
      data: executionEnvironment,
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(ExecutionEnvironmentsAPI.readDetail).mockRejectedValue(err);
    renderAt('/execution_environments/42/details');
    expect(
      await screen.findByText('Execution environment not found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ExecutionEnvironmentDetails')
    ).not.toBeInTheDocument();
  });
});
