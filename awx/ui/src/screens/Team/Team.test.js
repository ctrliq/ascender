import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { TeamsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Team from './Team';

jest.mock('../../api/models/Teams');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('./TeamDetail', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'TeamDetail'),
  };
});
jest.mock('./TeamEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'TeamEdit'),
  };
});
jest.mock('./TeamRoles', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'TeamRoles'),
  };
});
jest.mock('components/ResourceAccessList', () => {
  const ReactLib = require('react');
  return {
    ResourceAccessList: () =>
      ReactLib.createElement('div', null, 'ResourceAccessList'),
  };
});

const mockTeam = {
  id: 1,
  name: 'Test Team',
  summary_fields: {
    organization: { id: 1, name: 'Default' },
    user_capabilities: { edit: true, delete: true },
  },
};

// Team uses paths relative to its parent route, so mount it under the same
// /teams/:id/* route that Teams.js gives it in the app.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/teams/:id/*" element={<Team setBreadcrumb={() => {}} />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Team />', () => {
  beforeEach(() => {
    TeamsAPI.readDetail.mockResolvedValue({ data: mockTeam });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('fetches the team detail', async () => {
    renderAt('/teams/1/details');
    expect(await screen.findByText('TeamDetail')).toBeInTheDocument();
    // real route params come through as strings
    expect(TeamsAPI.readDetail).toHaveBeenCalledWith('1');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/teams/1/edit');
    expect(await screen.findByText('TeamEdit')).toBeInTheDocument();
  });

  test('renders the access panel at /access', async () => {
    renderAt('/teams/1/access');
    expect(await screen.findByText('ResourceAccessList')).toBeInTheDocument();
  });

  test('renders the roles panel at /roles', async () => {
    renderAt('/teams/1/roles');
    expect(await screen.findByText('TeamRoles')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/teams/1');
    expect(await screen.findByText('TeamDetail')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/teams/1/details')
    );
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/teams/1/foobar');
    expect(await screen.findByText('View Team Details')).toBeInTheDocument();
    expect(screen.queryByText('TeamDetail')).not.toBeInTheDocument();
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    TeamsAPI.readDetail.mockRejectedValue(err);
    renderAt('/teams/1/details');
    expect(await screen.findByText('Team not found.')).toBeInTheDocument();
    expect(screen.queryByText('TeamDetail')).not.toBeInTheDocument();
  });
});
