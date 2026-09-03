import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilders from './ExecutionEnvironmentBuilders';

jest.mock('../../api/models/ExecutionEnvironmentBuilders');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock(
  './ExecutionEnvironmentBuilderList/ExecutionEnvironmentBuilderList',
  () => {
    const ReactLib = require('react');
    return {
      __esModule: true,
      default: () =>
        ReactLib.createElement('div', null, 'ExecutionEnvironmentBuilderList'),
    };
  }
);
jest.mock(
  './ExecutionEnvironmentBuilderAdd/ExecutionEnvironmentBuilderAdd',
  () => {
    const ReactLib = require('react');
    return {
      __esModule: true,
      default: () =>
        ReactLib.createElement('div', null, 'ExecutionEnvironmentBuilderAdd'),
    };
  }
);
jest.mock('./ExecutionEnvironmentBuilder', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'ExecutionEnvironmentBuilder detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/execution_environment_builders/*"
        element={<ExecutionEnvironmentBuilders />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<ExecutionEnvironmentBuilders />', () => {
  test('renders the list at /execution_environment_builders', async () => {
    renderAt('/execution_environment_builders');
    expect(
      await screen.findByText('ExecutionEnvironmentBuilderList')
    ).toBeInTheDocument();
  });

  test('renders the add form at /execution_environment_builders/add', async () => {
    renderAt('/execution_environment_builders/add');
    expect(
      await screen.findByText('ExecutionEnvironmentBuilderAdd')
    ).toBeInTheDocument();
  });

  test('renders the detail view at /execution_environment_builders/:id', async () => {
    renderAt('/execution_environment_builders/1');
    expect(
      await screen.findByText('ExecutionEnvironmentBuilder detail')
    ).toBeInTheDocument();
  });
});
