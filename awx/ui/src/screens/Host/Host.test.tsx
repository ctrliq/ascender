import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { HostsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockHost from './data.host.json';
import Host from './Host';

vi.mock('../../api/models/Hosts');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./HostDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostDetail'),
  };
});
vi.mock('./HostEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostEdit'),
  };
});
vi.mock('./HostFacts', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostFacts'),
  };
});
vi.mock('./HostGroups', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostGroups subtree'),
  };
});
vi.mock('components/JobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'JobList'),
  };
});

// Host uses paths relative to its parent route, so mount it under the same
// /hosts/:id/* route that Hosts.js gives it in the app.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/hosts/:id/*" element={<Host setBreadcrumb={() => {}} />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Host />', () => {
  beforeEach(() => {
    vi.mocked(HostsAPI.readDetail).mockResolvedValue({
      data: { ...mockHost },
    } as unknown as ResponseOf<typeof HostsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the host detail', async () => {
    renderAt('/hosts/1/details');
    expect(await screen.findByText('HostDetail')).toBeInTheDocument();
    // real route params are strings (route params are always strings under react-router)
    expect(HostsAPI.readDetail).toHaveBeenCalledWith('1');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/hosts/1/edit');
    expect(await screen.findByText('HostEdit')).toBeInTheDocument();
  });

  test('renders the facts panel at /facts', async () => {
    renderAt('/hosts/1/facts');
    expect(await screen.findByText('HostFacts')).toBeInTheDocument();
  });

  test('renders the groups subtree at /groups', async () => {
    renderAt('/hosts/1/groups');
    expect(await screen.findByText('HostGroups subtree')).toBeInTheDocument();
  });

  test('renders the jobs panel at /jobs', async () => {
    renderAt('/hosts/1/jobs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/hosts/1');
    expect(await screen.findByText('HostDetail')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/hosts/1/details')
    );
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/hosts/1/foobar');
    expect(await screen.findByText('View Host Details')).toBeInTheDocument();
    expect(screen.queryByText('HostDetail')).not.toBeInTheDocument();
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(HostsAPI.readDetail).mockRejectedValue(err);
    renderAt('/hosts/1/details');
    expect(await screen.findByText('Host not found.')).toBeInTheDocument();
    expect(screen.queryByText('HostDetail')).not.toBeInTheDocument();
  });
});
