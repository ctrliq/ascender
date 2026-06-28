import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Credentials from './Credentials';

jest.mock('../../api/models/Credentials');

// Capture the ScreenHeader props so we can assert the breadcrumb/title
// mapping.
let mockScreenHeaderProps;
jest.mock('components/ScreenHeader', () => ({
  __esModule: true,
  default: (props) => {
    mockScreenHeaderProps = props;
    return null;
  },
}));

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./CredentialList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    CredentialList: () => ReactLib.createElement('div', null, 'CredentialList'),
  };
});
jest.mock('./CredentialAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialAdd'),
  };
});
jest.mock('./Credential', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Credential detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/credentials/*" element={<Credentials />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Credentials />', () => {
  test('renders the list at /credentials', async () => {
    renderAt('/credentials');
    expect(await screen.findByText('CredentialList')).toBeInTheDocument();
  });

  test('renders the add form at /credentials/add', async () => {
    renderAt('/credentials/add');
    expect(await screen.findByText('CredentialAdd')).toBeInTheDocument();
    expect(screen.queryByText('CredentialList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /credentials/:id', async () => {
    renderAt('/credentials/2/details');
    expect(await screen.findByText('Credential detail')).toBeInTheDocument();
    expect(screen.queryByText('CredentialList')).not.toBeInTheDocument();
  });

  test('sets the ScreenHeader stream type and breadcrumb config', async () => {
    renderAt('/credentials');
    expect(await screen.findByText('CredentialList')).toBeInTheDocument();
    expect(mockScreenHeaderProps).toBeDefined();
    expect(mockScreenHeaderProps.streamType).toBe('credential');
    expect(mockScreenHeaderProps.breadcrumbConfig).toEqual({
      '/credentials': 'Credentials',
      '/credentials/add': 'Create New Credential',
    });
  });
});
