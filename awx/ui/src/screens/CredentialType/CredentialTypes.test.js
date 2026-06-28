import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import CredentialTypes from './CredentialTypes';


// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./CredentialTypeList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialTypeList'),
  };
});
jest.mock('./CredentialTypeAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialTypeAdd'),
  };
});
jest.mock('./CredentialType', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialType detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/credential_types/*" element={<CredentialTypes />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<CredentialTypes />', () => {
  test('renders the list at /credential_types', async () => {
    renderAt('/credential_types');
    expect(await screen.findByText('CredentialTypeList')).toBeInTheDocument();
  });

  test('renders the add form at /credential_types/add', async () => {
    renderAt('/credential_types/add');
    expect(await screen.findByText('CredentialTypeAdd')).toBeInTheDocument();
    expect(screen.queryByText('CredentialTypeList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /credential_types/:id', async () => {
    renderAt('/credential_types/42/details');
    expect(
      await screen.findByText('CredentialType detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('CredentialTypeList')).not.toBeInTheDocument();
  });
});
