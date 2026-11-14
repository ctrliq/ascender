import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ContainerGroups from './ContainerGroups';

vi.mock('../../api/models/InstanceGroups');

// Replace the routed children with markers so the assertions are purely about
// which branch of the <Routes> tree resolves for a given URL.
vi.mock('./InstanceGroupList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ isContainerGroup }: { isContainerGroup?: boolean }) =>
      ReactLib.createElement(
        'div',
        null,
        isContainerGroup ? 'ContainerGroupList' : 'InstanceGroupList'
      ),
  };
});
vi.mock('./ContainerGroupAdd', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroupAdd'),
  };
});
vi.mock('./ContainerGroup', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ContainerGroup detail'),
  };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/container_groups/*" element={<ContainerGroups />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<ContainerGroups />', () => {
  test('renders the list at /container_groups', async () => {
    renderAt('/container_groups');
    // The list of the one kind, which is what the tab beside the instances
    // opens.
    expect(await screen.findByText('ContainerGroupList')).toBeInTheDocument();
  });

  test('renders the add form at /container_groups/add', async () => {
    renderAt('/container_groups/add');
    expect(await screen.findByText('ContainerGroupAdd')).toBeInTheDocument();
    expect(screen.queryByText('ContainerGroupList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /container_groups/:id', async () => {
    renderAt('/container_groups/5/details');
    expect(
      await screen.findByText('ContainerGroup detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('ContainerGroupList')).not.toBeInTheDocument();
  });
});
