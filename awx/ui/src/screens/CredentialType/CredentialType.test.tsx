import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { CredentialTypesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CredentialType from './CredentialType';

vi.mock('../../api/models/CredentialTypes');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./CredentialTypeDetails', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialTypeDetails'),
  };
});
vi.mock('./CredentialTypeEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'CredentialTypeEdit'),
  };
});

const credentialType = {
  id: 42,
  name: 'Foo',
  summary_fields: { user_capabilities: { edit: true, delete: true } },
};

// CredentialType uses paths relative to its parent route, so mount it under the
// same /credential_types/:id/* route that CredentialTypes.js gives it.
function renderAt(path: Untyped) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/credential_types/:id/*"
        element={<CredentialType setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<CredentialType />', () => {
  beforeEach(() => {
    vi.mocked(CredentialTypesAPI.readDetail).mockResolvedValue({
      data: credentialType,
    } as unknown as ResponseOf<typeof CredentialTypesAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the credential type detail', async () => {
    renderAt('/credential_types/42/details');
    expect(
      await screen.findByText('CredentialTypeDetails')
    ).toBeInTheDocument();
    // real route params are strings (the previous test mocked a number)
    expect(CredentialTypesAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the expected tabs', async () => {
    renderAt('/credential_types/42/details');
    expect(
      await screen.findByText('Back to credential types')
    ).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/credential_types/42/edit');
    expect(await screen.findByText('CredentialTypeEdit')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/credential_types/42');
    expect(
      await screen.findByText('CredentialTypeDetails')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/credential_types/42/details')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(CredentialTypesAPI.readDetail).mockRejectedValue(err);
    renderAt('/credential_types/42/details');
    expect(
      await screen.findByText('Credential type not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('CredentialTypeDetails')).not.toBeInTheDocument();
  });
});
