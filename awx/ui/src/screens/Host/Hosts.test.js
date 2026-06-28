import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Hosts from './Hosts';

jest.mock('../../api/models/Hosts');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./HostList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostList'),
  };
});
jest.mock('./HostAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostAdd'),
  };
});
jest.mock('./Host', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Host detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/hosts/*" element={<Hosts />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Hosts />', () => {
  test('renders the list at /hosts', async () => {
    renderAt('/hosts');
    expect(await screen.findByText('HostList')).toBeInTheDocument();
  });

  test('renders the add form at /hosts/add', async () => {
    renderAt('/hosts/add');
    expect(await screen.findByText('HostAdd')).toBeInTheDocument();
    expect(screen.queryByText('HostList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /hosts/:id', async () => {
    renderAt('/hosts/1/details');
    expect(await screen.findByText('Host detail')).toBeInTheDocument();
    expect(screen.queryByText('HostList')).not.toBeInTheDocument();
  });
});
