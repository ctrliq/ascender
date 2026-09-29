import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstancesAPI, SettingsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Instance from './Instance';

vi.mock('../../api/models/Settings');
vi.mock('../../api/models/Instances');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./InstanceDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceDetail'),
  };
});
vi.mock('./InstancePeers', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstancePeerList'),
  };
});
vi.mock('./InstanceListenerAddressList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'InstanceListenerAddressList'),
  };
});
vi.mock('./InstanceInstanceGroups', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    // Says what it was handed, so a test can see the instance and the control
    // plane name come down from here rather than being read again.
    default: ({
      instance,
      controlPlaneName,
    }: {
      instance?: { hostname?: string };
      controlPlaneName?: string;
    }) =>
      ReactLib.createElement(
        'div',
        null,
        `InstanceInstanceGroupList ${instance?.hostname} ${controlPlaneName}`
      ),
  };
});
vi.mock('./InstanceJobs', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceJobList'),
  };
});

// Instance uses paths relative to its parent route, so mount it under the same
// /instances/:id/* route that Instances.js gives it in the app.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instances/:id/*"
        element={<Instance setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Instance />', () => {
  beforeEach(() => {
    vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
      data: { id: 1, hostname: 'exec', node_type: 'execution' },
    } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: false },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders the detail panel at /details', async () => {
    renderAt('/instances/1/details');
    expect(await screen.findByText('InstanceDetail')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/instances/1');
    expect(await screen.findByText('InstanceDetail')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/instances/1/details')
    );
  });

  test('renders the peers tab only on K8s', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: true },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderAt('/instances/1/peers');
    expect(await screen.findByText('InstancePeerList')).toBeInTheDocument();
  });

  test('renders the listener addresses panel on K8s', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: true },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderAt('/instances/1/listener_addresses');
    expect(
      await screen.findByText('InstanceListenerAddressList')
    ).toBeInTheDocument();
  });

  test('renders the instance groups and runs panels', async () => {
    const { unmount } = renderAt('/instances/1/instance_groups');
    expect(
      await screen.findByText(/^InstanceInstanceGroupList/)
    ).toBeInTheDocument();
    unmount();

    renderAt('/instances/1/runs');
    expect(await screen.findByText('InstanceJobList')).toBeInTheDocument();
  });

  test('hands the instance groups tab the instance and the control plane name', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: false, DEFAULT_CONTROL_PLANE_QUEUE_NAME: 'cp' },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderAt('/instances/1/instance_groups');
    expect(
      await screen.findByText('InstanceInstanceGroupList exec cp')
    ).toBeInTheDocument();
    expect(InstancesAPI.readDetail).toHaveBeenCalledTimes(1);
  });

  test('puts Instance Groups and then Runs after the other tabs', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: true },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderAt('/instances/1/details');
    await screen.findByText('InstanceDetail');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Back to Instances',
      'Details',
      'Listener Addresses',
      'Peers',
      'Instance Groups',
      'Runs',
    ]);
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/instances/1/foobar');
    expect(
      await screen.findByText('View Instance Details')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceDetail')).not.toBeInTheDocument();
  });

  test('leaves Instance Groups and Runs out for a hop node', async () => {
    vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
      data: { id: 1, hostname: 'hop', node_type: 'hop' },
    } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { IS_K8S: true },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderAt('/instances/1/details');
    await screen.findByText('InstanceDetail');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Back to Instances',
      'Details',
      'Listener Addresses',
      'Peers',
    ]);
  });
});
