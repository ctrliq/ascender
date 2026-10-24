import type { CredentialType } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { RootAPI } from 'api';
import { FormRoot } from 'components/Form';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import WorkloadIdentityInfo from './WorkloadIdentityInfo';

// The notice sits inside the credential form, whose values it reads
function renderInForm(ui: React.ReactElement, inputs = {}) {
  return renderWithContexts(
    <FormRoot initialValues={{ inputs }} onSubmit={() => {}}>
      {ui}
    </FormRoot>
  );
}

vi.mock('../../../../api/models/Root');

const vaultLookup = { namespace: 'hashivault_kv_oidc' } as CredentialType;
const injectedToken = { namespace: 'oidc_workload_identity' } as CredentialType;

describe('<WorkloadIdentityInfo />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('shows the issuer and how to point Vault at it', async () => {
    vi.mocked(RootAPI.readWorkloadIdentityConfiguration).mockResolvedValue({
      data: { issuer: 'https://ascender.example.com/api/o' },
    } as unknown as ResponseOf<
      typeof RootAPI.readWorkloadIdentityConfiguration
    >);
    renderInForm(<WorkloadIdentityInfo credentialType={vaultLookup} />);
    // a read only ClipboardCopy holds its text in an input
    await waitFor(() =>
      expect(
        screen.getByDisplayValue(
          'vault write auth/jwt/config oidc_discovery_url="https://ascender.example.com/api/o" bound_issuer="https://ascender.example.com/api/o"'
        )
      ).toBeInTheDocument()
    );
    expect(
      screen.getByDisplayValue('https://ascender.example.com/api/o')
    ).toBeInTheDocument();
  });

  test('tells the job where its token is', async () => {
    vi.mocked(RootAPI.readWorkloadIdentityConfiguration).mockResolvedValue({
      data: { issuer: 'https://ascender.example.com/api/o' },
    } as unknown as ResponseOf<
      typeof RootAPI.readWorkloadIdentityConfiguration
    >);
    renderInForm(<WorkloadIdentityInfo credentialType={injectedToken} />);
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE'
      )
    );
    expect(
      document.querySelector('#workload-identity-vault-config')
    ).toBeNull();
  });

  test('warns while the feature is off', async () => {
    vi.mocked(RootAPI.readWorkloadIdentityConfiguration).mockRejectedValue({
      response: {
        status: 404,
        data: { detail: 'Workload identity is not enabled.' },
      },
    });
    renderInForm(<WorkloadIdentityInfo credentialType={vaultLookup} />);
    await waitFor(() =>
      expect(
        screen.getByText('Workload identity is not available')
      ).toBeInTheDocument()
    );
    // translated advice, not the server's English detail
    expect(document.body).toHaveTextContent('can turn it on in Settings');
    expect(document.body).not.toHaveTextContent(
      'Workload identity is not enabled.'
    );
  });

  test('names the mount the credential logs in through', async () => {
    vi.mocked(RootAPI.readWorkloadIdentityConfiguration).mockResolvedValue({
      data: { issuer: 'https://ascender.example.com/api/o' },
    } as unknown as ResponseOf<
      typeof RootAPI.readWorkloadIdentityConfiguration
    >);
    renderInForm(<WorkloadIdentityInfo credentialType={vaultLookup} />, {
      default_auth_path: 'jwt-ascender',
    });
    await waitFor(() =>
      expect(
        screen.getByDisplayValue(/^vault write auth\/jwt-ascender\/config /)
      ).toBeInTheDocument()
    );
  });

  test('does not advise turning it on when the server failed', async () => {
    vi.mocked(RootAPI.readWorkloadIdentityConfiguration).mockRejectedValue({
      response: { status: 500, data: {} },
    });
    renderInForm(<WorkloadIdentityInfo credentialType={vaultLookup} />);
    await waitFor(() =>
      expect(
        screen.getByText('Could not read the workload identity configuration')
      ).toBeInTheDocument()
    );
    expect(document.body).not.toHaveTextContent('can turn it on');
  });
});
