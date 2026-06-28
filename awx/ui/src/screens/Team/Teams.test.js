import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Teams from './Teams';

jest.mock('../../api/models/Teams');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./TeamList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'TeamList'),
  };
});
jest.mock('./TeamAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'TeamAdd'),
  };
});
jest.mock('./Team', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Team detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/teams/*" element={<Teams />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<Teams />', () => {
  test('renders the list at /teams', async () => {
    renderAt('/teams');
    expect(await screen.findByText('TeamList')).toBeInTheDocument();
  });

  test('renders the add form at /teams/add', async () => {
    renderAt('/teams/add');
    expect(await screen.findByText('TeamAdd')).toBeInTheDocument();
    expect(screen.queryByText('TeamList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /teams/:id', async () => {
    renderAt('/teams/1/details');
    expect(await screen.findByText('Team detail')).toBeInTheDocument();
    expect(screen.queryByText('TeamList')).not.toBeInTheDocument();
  });
});
