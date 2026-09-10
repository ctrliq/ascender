import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { OrganizationsAPI } from 'api';
import mockOrganization from 'util/data.organization.json';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Organization from './Organization';

vi.mock('../../api/models/Organizations');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./OrganizationDetail', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'OrganizationDetail'),
  };
});
vi.mock('./OrganizationEdit', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'OrganizationEdit'),
  };
});
vi.mock('./OrganizationTeams', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'OrganizationTeams'),
  };
});
vi.mock('./OrganizationExecEnvList', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'OrganizationExecEnvList'),
  };
});
vi.mock('components/ResourceAccessList', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    ResourceAccessList: () =>
      ReactLib.createElement('div', null, 'ResourceAccessList'),
  };
});
vi.mock('components/NotificationList/NotificationList', async () => {
  const ReactLib = await vi.importActual('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'NotificationList'),
  };
});

const mockMe = { is_super_user: true, is_system_auditor: false };
const mockAuditorMe = { is_super_user: true, is_system_auditor: true };

// Organization uses paths relative to its parent route, so mount it under the
// same /organizations/:id/* route that Organizations.js gives it in the app.
function renderAt(path, me = mockMe) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/organizations/:id/*"
        element={<Organization setBreadcrumb={() => {}} me={me} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Organization />', () => {
  beforeEach(() => {
    OrganizationsAPI.readDetail.mockResolvedValue({ data: mockOrganization });
    OrganizationsAPI.readGalaxyCredentials.mockResolvedValue({
      data: { results: [] },
    });
    OrganizationsAPI.read.mockResolvedValue({ data: { results: [] } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the organization detail', async () => {
    renderAt('/organizations/1/details');
    expect(await screen.findByText('OrganizationDetail')).toBeInTheDocument();
    // real route params are strings (route params are always strings under react-router)
    expect(OrganizationsAPI.readDetail).toHaveBeenCalledWith('1');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/organizations/1/edit');
    expect(await screen.findByText('OrganizationEdit')).toBeInTheDocument();
  });

  test('renders the access panel at /access', async () => {
    renderAt('/organizations/1/access');
    expect(await screen.findByText('ResourceAccessList')).toBeInTheDocument();
  });

  test('renders the teams panel at /teams', async () => {
    renderAt('/organizations/1/teams');
    expect(await screen.findByText('OrganizationTeams')).toBeInTheDocument();
  });

  test('renders the execution environments panel at /execution_environments', async () => {
    renderAt('/organizations/1/execution_environments');
    expect(
      await screen.findByText('OrganizationExecEnvList')
    ).toBeInTheDocument();
  });

  test('renders the notifications panel for an auditor', async () => {
    renderAt('/organizations/1/notifications', mockAuditorMe);
    expect(await screen.findByText('NotificationList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/organizations/1');
    expect(await screen.findByText('OrganizationDetail')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/organizations/1/details')
    );
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/organizations/1/foobar');
    expect(
      await screen.findByText('View Organization Details')
    ).toBeInTheDocument();
    expect(screen.queryByText('OrganizationDetail')).not.toBeInTheDocument();
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    OrganizationsAPI.readDetail.mockRejectedValue(err);
    renderAt('/organizations/1/details');
    expect(
      await screen.findByText('Organization not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('OrganizationDetail')).not.toBeInTheDocument();
  });
});
