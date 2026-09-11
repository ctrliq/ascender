import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ContainerGroup from './ContainerGroup';

vi.mock('../../api/models/InstanceGroups');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./ContainerGroupDetails', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroupDetails'),
  };
});
vi.mock('./ContainerGroupEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroupEdit'),
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
  is_container_group: true,
  summary_fields: { user_capabilities: { edit: true, delete: true } },
};

// ContainerGroup uses paths relative to its parent route, so mount it under the
// same /instance_groups/container_group/:id/* route that InstanceGroups.js
// gives it in the app.
function renderAt(path: Untyped) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instance_groups/container_group/:id/*"
        element={<ContainerGroup setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<ContainerGroup />', () => {
  beforeEach(() => {
    vi.mocked(InstanceGroupsAPI.readDetail).mockResolvedValue({
      data: instanceGroup,
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the container group detail', async () => {
    renderAt('/instance_groups/container_group/42/details');
    expect(
      await screen.findByText('ContainerGroupDetails')
    ).toBeInTheDocument();
    expect(InstanceGroupsAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/instance_groups/container_group/42/edit');
    expect(await screen.findByText('ContainerGroupEdit')).toBeInTheDocument();
  });

  test('renders the jobs panel at /jobs', async () => {
    renderAt('/instance_groups/container_group/42/jobs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/instance_groups/container_group/42');
    expect(
      await screen.findByText('ContainerGroupDetails')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/instance_groups/container_group/42/details'
      )
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(InstanceGroupsAPI.readDetail).mockRejectedValue(err);
    renderAt('/instance_groups/container_group/42/details');
    expect(
      await screen.findByText('Container group not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('ContainerGroupDetails')).not.toBeInTheDocument();
  });
});
