import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InstanceGroups from './InstanceGroups';

jest.mock('../../api/models/InstanceGroups');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./InstanceGroupList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupList'),
  };
});
jest.mock('./InstanceGroupAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroupAdd'),
  };
});
jest.mock('./ContainerGroupAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroupAdd'),
  };
});
jest.mock('./InstanceGroup', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'InstanceGroup detail'),
  };
});
jest.mock('./ContainerGroup', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroup detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/instance_groups/*" element={<InstanceGroups />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<InstanceGroups />', () => {
  test('renders the list at /instance_groups', async () => {
    renderAt('/instance_groups');
    expect(await screen.findByText('InstanceGroupList')).toBeInTheDocument();
  });

  test('renders the instance group add form at /instance_groups/add', async () => {
    renderAt('/instance_groups/add');
    expect(await screen.findByText('InstanceGroupAdd')).toBeInTheDocument();
    expect(screen.queryByText('InstanceGroupList')).not.toBeInTheDocument();
  });

  test('renders the container group add form at /instance_groups/container_group/add', async () => {
    renderAt('/instance_groups/container_group/add');
    expect(await screen.findByText('ContainerGroupAdd')).toBeInTheDocument();
  });

  test('renders the instance group detail subtree at /instance_groups/:id', async () => {
    renderAt('/instance_groups/5/details');
    expect(
      await screen.findByText('InstanceGroup detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceGroupList')).not.toBeInTheDocument();
  });

  test('renders the container group detail subtree at /instance_groups/container_group/:id', async () => {
    renderAt('/instance_groups/container_group/5/details');
    expect(
      await screen.findByText('ContainerGroup detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('InstanceGroup detail')).not.toBeInTheDocument();
  });
});
