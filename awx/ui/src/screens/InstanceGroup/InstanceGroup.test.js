import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InstanceGroup from './InstanceGroup';

jest.mock('../../api/models/InstanceGroups');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('./InstanceGroupDetails', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupDetails'),
  };
});
jest.mock('./InstanceGroupEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupEdit'),
  };
});
jest.mock('./Instances/Instances', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Instances subtree'),
  };
});
jest.mock('components/JobList', () => {
  const ReactLib = require('react');
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
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/instance_groups/:id/*"
        element={<InstanceGroup setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InstanceGroup />', () => {
  beforeEach(() => {
    InstanceGroupsAPI.readDetail.mockResolvedValue({ data: instanceGroup });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  test('renders the jobs panel at /jobs', async () => {
    renderAt('/instance_groups/42/jobs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/instance_groups/42');
    expect(await screen.findByText('InstanceGroupDetails')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/instance_groups/42/details')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    InstanceGroupsAPI.readDetail.mockRejectedValue(err);
    renderAt('/instance_groups/42/details');
    expect(
      await screen.findByText('Instance group not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceGroupDetails')).not.toBeInTheDocument();
  });
});
