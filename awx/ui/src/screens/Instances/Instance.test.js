import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Instance from './Instance';

jest.mock('../../api/models/Settings');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('./InstanceDetail', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceDetail'),
  };
});
jest.mock('./InstancePeers', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstancePeerList'),
  };
});
jest.mock('./InstanceListenerAddressList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'InstanceListenerAddressList'),
  };
});

// Instance uses paths relative to its parent route, so mount it under the same
// /instances/:id/* route that Instances.js gives it in the app.
function renderAt(path) {
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
    SettingsAPI.readCategory.mockResolvedValue({ data: { IS_K8S: false } });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    SettingsAPI.readCategory.mockResolvedValue({ data: { IS_K8S: true } });
    renderAt('/instances/1/peers');
    expect(await screen.findByText('InstancePeerList')).toBeInTheDocument();
  });

  test('renders the listener addresses panel on K8s', async () => {
    SettingsAPI.readCategory.mockResolvedValue({ data: { IS_K8S: true } });
    renderAt('/instances/1/listener_addresses');
    expect(
      await screen.findByText('InstanceListenerAddressList')
    ).toBeInTheDocument();
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/instances/1/foobar');
    expect(
      await screen.findByText('View Instance Details')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceDetail')).not.toBeInTheDocument();
  });
});
