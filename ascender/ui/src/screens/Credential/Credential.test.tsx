import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { CredentialsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockMachineCredential from './shared/data.machineCredential.json';
import mockCyberArkCredential from './shared/data.cyberArkCredential.json';
import Credential from './Credential';

vi.mock('../../api/models/Credentials');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./CredentialDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialDetail'),
  };
});
vi.mock('./CredentialEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialEdit'),
  };
});
vi.mock('components/RelatedTemplateList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'RelatedTemplateList'),
  };
});
vi.mock('components/ResourceAccessList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    ResourceAccessList: () =>
      ReactLib.createElement('div', null, 'ResourceAccessList'),
  };
});

// Credential uses paths relative to its parent route, so mount it under the
// same /credentials/:id/* route that Credentials.js gives it in the app.
function renderAt(path: string) {
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
    vi.mocked(CredentialsAPI.readDetail).mockResolvedValue({
      data: mockMachineCredential,
    } as unknown as ResponseOf<typeof CredentialsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(CredentialsAPI.readDetail).mockResolvedValue({
      data: { ...mockCyberArkCredential, kind: 'registry' },
    } as unknown as ResponseOf<typeof CredentialsAPI.readDetail>);
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
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(CredentialsAPI.readDetail).mockRejectedValue(err);
    renderAt('/credentials/2/details');
    expect(
      await screen.findByText('Credential not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('CredentialDetail')).not.toBeInTheDocument();
  });
});
