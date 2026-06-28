import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Instances from './Instances';

jest.mock('../../api/models/Instances');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./InstanceList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    InstanceList: () => ReactLib.createElement('div', null, 'InstanceList'),
  };
});
jest.mock('./InstanceAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceAdd'),
  };
});
jest.mock('./InstanceEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceEdit'),
  };
});
jest.mock('./Instance', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Instance detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/instances/*" element={<Instances />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<Instances />', () => {
  test('renders the list at /instances', async () => {
    renderAt('/instances');
    expect(await screen.findByText('InstanceList')).toBeInTheDocument();
  });

  test('renders the add form at /instances/add', async () => {
    renderAt('/instances/add');
    expect(await screen.findByText('InstanceAdd')).toBeInTheDocument();
    expect(screen.queryByText('InstanceList')).not.toBeInTheDocument();
  });

  test('renders the edit form at /instances/:id/edit', async () => {
    renderAt('/instances/1/edit');
    expect(await screen.findByText('InstanceEdit')).toBeInTheDocument();
    expect(screen.queryByText('Instance detail')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /instances/:id', async () => {
    renderAt('/instances/1/details');
    expect(await screen.findByText('Instance detail')).toBeInTheDocument();
    expect(screen.queryByText('InstanceList')).not.toBeInTheDocument();
  });
});
