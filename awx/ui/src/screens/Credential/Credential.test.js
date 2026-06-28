import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockMachineCredential from './shared/data.machineCredential.json';
import mockCyberArkCredential from './shared/data.cyberArkCredential.json';
import Credential from './Credential';

jest.mock('../../api/models/Credentials');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('./CredentialDetail', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialDetail'),
  };
});
jest.mock('./CredentialEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialEdit'),
  };
});
jest.mock('components/RelatedTemplateList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'RelatedTemplateList'),
  };
});
jest.mock('components/ResourceAccessList', () => {
  const ReactLib = require('react');
  return {
    ResourceAccessList: () =>
      ReactLib.createElement('div', null, 'ResourceAccessList'),
  };
});

// Credential uses paths relative to its parent route, so mount it under the
// same /credentials/:id/* route that Credentials.js gives it in the app.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/credentials/:id/*"
        element={<Credential setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Credential />', () => {
  beforeEach(() => {
    CredentialsAPI.readDetail.mockResolvedValue({ data: mockMachineCredential });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('fetches the credential detail', async () => {
    renderAt('/credentials/2/details');
    expect(await screen.findByText('CredentialDetail')).toBeInTheDocument();
    // real route params are strings (route params are always strings under react-router)
    expect(CredentialsAPI.readDetail).toHaveBeenCalledWith('2');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/credentials/2/edit');
    expect(await screen.findByText('CredentialEdit')).toBeInTheDocument();
  });

  test('renders the access panel at /access', async () => {
    renderAt('/credentials/2/access');
    expect(await screen.findByText('ResourceAccessList')).toBeInTheDocument();
  });

  test('renders the job templates panel at /job_templates', async () => {
    renderAt('/credentials/2/job_templates');
    expect(await screen.findByText('RelatedTemplateList')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/credentials/2');
    expect(await screen.findByText('CredentialDetail')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/credentials/2/details')
    );
  });

  test('shows the Job Templates tab for an acceptable credential kind', async () => {
    renderAt('/credentials/2/details');
    expect(await screen.findByText('CredentialDetail')).toBeInTheDocument();
    expect(screen.getByText('Job Templates')).toBeInTheDocument();
  });

  test('hides the Job Templates tab for a registry credential', async () => {
    CredentialsAPI.readDetail.mockResolvedValue({
      data: { ...mockCyberArkCredential, kind: 'registry' },
    });
    renderAt('/credentials/2/details');
    expect(await screen.findByText('CredentialDetail')).toBeInTheDocument();
    expect(screen.queryByText('Job Templates')).not.toBeInTheDocument();
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/credentials/2/foobar');
    expect(
      await screen.findByText('View Credential Details')
    ).toBeInTheDocument();
    expect(screen.queryByText('CredentialDetail')).not.toBeInTheDocument();
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    CredentialsAPI.readDetail.mockRejectedValue(err);
    renderAt('/credentials/2/details');
    expect(await screen.findByText('Credential not found.')).toBeInTheDocument();
    expect(screen.queryByText('CredentialDetail')).not.toBeInTheDocument();
  });
});
