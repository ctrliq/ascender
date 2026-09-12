import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ExecutionEnvironments from './ExecutionEnvironments';

vi.mock('../../api/models/ExecutionEnvironments');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
vi.mock('./ExecutionEnvironmentList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentList'),
  };
});
vi.mock('./ExecutionEnvironmentAdd', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentAdd'),
  };
});
vi.mock('./ExecutionEnvironment', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironment detail'),
  };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/execution_environments/*"
        element={<ExecutionEnvironments />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<ExecutionEnvironments />', () => {
  test('renders the list at /execution_environments', async () => {
    renderAt('/execution_environments');
    expect(
      await screen.findByText('ExecutionEnvironmentList')
    ).toBeInTheDocument();
  });

  test('renders the add form at /execution_environments/add', async () => {
    renderAt('/execution_environments/add');
    expect(
      await screen.findByText('ExecutionEnvironmentAdd')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ExecutionEnvironmentList')
    ).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /execution_environments/:id', async () => {
    renderAt('/execution_environments/42/details');
    expect(
      await screen.findByText('ExecutionEnvironment detail')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ExecutionEnvironmentList')
    ).not.toBeInTheDocument();
  });
});
