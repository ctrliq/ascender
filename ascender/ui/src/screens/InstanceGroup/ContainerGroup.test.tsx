import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ContainerGroup from './ContainerGroup';
import { PERSISTENT_FILTER_KEY } from '../../constants';

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
// same /container_groups/:id/* route that InstanceGroups.js
// gives it in the app.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/container_groups/:id/*"
        element={<ContainerGroup setBreadcrumb={() => {}} />}
      />
      {/* The list the back tab leads to, so following it lands somewhere. */}
      <Route path="/container_groups" element={<div>ContainerGroupList</div>} />
      <Route path="/instance_groups/*" element={<div>InstanceGroup</div>} />
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
    renderAt('/container_groups/42/details');
    expect(
      await screen.findByText('ContainerGroupDetails')
    ).toBeInTheDocument();
    expect(InstanceGroupsAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/container_groups/42/edit');
    expect(await screen.findByText('ContainerGroupEdit')).toBeInTheDocument();
  });

  test('renders the jobs panel at /runs', async () => {
    renderAt('/container_groups/42/runs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('sends a plain instance group to its own screen, keeping the tab', async () => {
    vi.mocked(InstanceGroupsAPI.readDetail).mockResolvedValue({
      data: { ...instanceGroup, is_container_group: false },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readDetail>);
    const { history } = renderAt('/container_groups/42/edit');

    expect(await screen.findByText('InstanceGroup')).toBeInTheDocument();
    expect(history.location.pathname).toBe('/instance_groups/42/edit');
    expect(screen.queryByText('ContainerGroupEdit')).not.toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/container_groups/42');
    expect(
      await screen.findByText('ContainerGroupDetails')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/container_groups/42/details')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(InstanceGroupsAPI.readDetail).mockRejectedValue(err);
    renderAt('/container_groups/42/details');
    expect(
      await screen.findByText('Container group not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('ContainerGroupDetails')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all container groups' })
    ).toHaveAttribute('href', '/container_groups');
  });

  test('leads back to the container groups list', async () => {
    const { history, user } = renderAt('/container_groups/42/details');
    await user.click(
      await screen.findByRole('tab', { name: /Back to Container Groups/ })
    );
    expect(history.location.pathname).toBe('/container_groups');
  });

  test('keeps the list filters on the way back', async () => {
    sessionStorage.setItem(
      PERSISTENT_FILTER_KEY,
      JSON.stringify({ pageKey: 'containerGroups', qs: '?page=2' })
    );
    const { history, user } = renderAt('/container_groups/42/details');
    await user.click(
      await screen.findByRole('tab', { name: /Back to Container Groups/ })
    );
    expect(history.location.search).toBe('?page=2');
    sessionStorage.clear();
  });

  test('offers the container groups list for an unknown tab', async () => {
    renderAt('/container_groups/42/nope');
    expect(
      await screen.findByRole('link', { name: 'View all container groups' })
    ).toHaveAttribute('href', '/container_groups');
  });
});
