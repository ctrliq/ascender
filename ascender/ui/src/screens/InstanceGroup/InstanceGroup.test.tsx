import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InstanceGroup from './InstanceGroup';

vi.mock('../../api/models/InstanceGroups');
vi.mock('../../api/models/Settings');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./InstanceGroupDetails', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupDetails'),
  };
});
vi.mock('./InstanceGroupEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupEdit'),
  };
});
vi.mock('./Instances/Instances', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Instances subtree'),
  };
});
vi.mock('components/JobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'JobList'),
  };
});

const instanceGroup = {
  id: 42,
  name: 'Foo',
  summary_fields: { user_capabilities: { edit: true, delete: true } },
};

// InstanceGroup uses paths relative to its parent route, so mount it under the
// same /instance_groups/:id/* route that InstanceGroups.js gives it in the app.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instance_groups/:id/*"
        element={<InstanceGroup setBreadcrumb={() => {}} />}
      />
      {/* Where a container group is sent, so the redirect lands somewhere. */}
      <Route path="/container_groups/*" element={<div>ContainerGroup</div>} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InstanceGroup />', () => {
  beforeEach(() => {
    vi.mocked(InstanceGroupsAPI.readDetail).mockResolvedValue({
      data: instanceGroup,
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the instance group detail', async () => {
    renderAt('/instance_groups/42/details');
    expect(await screen.findByText('InstanceGroupDetails')).toBeInTheDocument();
    // real route params are strings (route params are always strings under react-router)
    expect(InstanceGroupsAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/instance_groups/42/edit');
    expect(await screen.findByText('InstanceGroupEdit')).toBeInTheDocument();
  });

  test('renders the instances subtree at /instances', async () => {
    renderAt('/instance_groups/42/instances');
    expect(await screen.findByText('Instances subtree')).toBeInTheDocument();
  });

  test('renders the jobs panel at /runs', async () => {
    renderAt('/instance_groups/42/runs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/instance_groups/42');
    expect(await screen.findByText('InstanceGroupDetails')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/instance_groups/42/details')
    );
  });

  test('sends a container group to its own address, keeping the tab', async () => {
    vi.mocked(InstanceGroupsAPI.readDetail).mockResolvedValue({
      data: { ...instanceGroup, is_container_group: true },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readDetail>);
    const { history } = renderAt('/instance_groups/42/runs');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/container_groups/42/runs')
    );
  });

  test('drops a tab the container group screen does not have', async () => {
    vi.mocked(InstanceGroupsAPI.readDetail).mockResolvedValue({
      data: { ...instanceGroup, is_container_group: true },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readDetail>);
    const { history } = renderAt('/instance_groups/42/instances');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/container_groups/42')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(InstanceGroupsAPI.readDetail).mockRejectedValue(err);
    renderAt('/instance_groups/42/details');
    expect(
      await screen.findByText('Instance group not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceGroupDetails')).not.toBeInTheDocument();
  });
});
