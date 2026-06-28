import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import Instances from './Instances';

// Markers for the routed panels, so assertions are about which branch of the
// nested v6 <Routes> tree resolves.
jest.mock('./InstanceList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceList'),
  };
});
jest.mock('../InstanceDetails', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceDetails'),
  };
});

const instanceGroup = { id: 42, name: 'Foo' };

// Instances uses paths relative to its parent route, so mount it under the same
// /instance_groups/:id/instances/* route that InstanceGroup.js gives it.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instance_groups/:id/instances/*"
        element={
          <Instances instanceGroup={instanceGroup} setBreadcrumb={() => {}} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Instances />', () => {
  test('renders the instance list at the index path', async () => {
    renderAt('/instance_groups/42/instances');
    expect(await screen.findByText('InstanceList')).toBeInTheDocument();
  });

  test('renders the instance details at /:instanceId/details', async () => {
    renderAt('/instance_groups/42/instances/7/details');
    expect(await screen.findByText('InstanceDetails')).toBeInTheDocument();
    expect(screen.queryByText('InstanceList')).not.toBeInTheDocument();
  });

  test('redirects /:instanceId to its details', async () => {
    const { history } = renderAt('/instance_groups/42/instances/7');
    expect(await screen.findByText('InstanceDetails')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/instance_groups/42/instances/7/details'
      )
    );
  });
});
