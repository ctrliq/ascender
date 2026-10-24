import type { Credential, CredentialType } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI, CredentialTypesAPI, JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExternalTestModal from './ExternalTestModal';
import credentialTypesArr from './data.credentialTypes.json';

vi.mock('../../../api/models/Credentials');
vi.mock('../../../api/models/CredentialTypes');
vi.mock('../../../api/models/JobTemplates');

const credentialType = credentialTypesArr.find(
  (credType) => credType.namespace === 'hashivault_kv'
);

const credentialFormValues = {
  name: 'Foobar',
  credential_type: credentialType!.id,
  inputs: {
    api_version: 'v2',
    token: '$encrypted$',
    url: 'http://hashivault:8200',
  },
  passwordPrompts: {},
};

const credential = {
  id: 1,
  name: 'A credential',
  credential_type: credentialType!.id,
} as unknown as Credential;

// The modal is rendered in a portal; query its fields/buttons against document.
const getInput = (id: string) =>
  document.querySelector(`input#credential-${id}`) as HTMLInputElement;
const getRunButton = () => screen.getByRole('button', { name: 'Run' });

const expectedPayload = {
  inputs: {
    api_version: 'v2',
    cacert: undefined,
    role_id: undefined,
    secret_id: undefined,
    token: '$encrypted$',
    url: 'http://hashivault:8200',
  },
  metadata: {
    auth_path: '',
    secret_backend: '',
    secret_key: 'password',
    secret_path: '/secret/foo/bar/baz',
    secret_version: '',
  },
};

async function fillAndRun(user: TestUser) {
  await user.type(getInput('secret_path'), '/secret/foo/bar/baz');
  await user.type(getInput('secret_key'), 'password');
  await user.click(getRunButton());
}

describe('<ExternalTestModal />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should display metadata fields correctly', () => {
    renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    expect(getInput('secret_backend')).toBeInTheDocument();
    expect(getInput('secret_path')).toBeInTheDocument();
    expect(getInput('auth_path')).toBeInTheDocument();
    expect(getInput('secret_key')).toBeInTheDocument();
    expect(getInput('secret_version')).toBeInTheDocument();
  });

  test('should make the test request correctly when testing an existing credential', async () => {
    const { user } = renderWithContexts(
      <ExternalTestModal
        credential={credential}
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    await fillAndRun(user);

    await waitFor(() =>
      expect(CredentialsAPI.test).toHaveBeenCalledWith(1, expectedPayload)
    );
  });

  test('should make the test request correctly when testing a new credential', async () => {
    const { user } = renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    await fillAndRun(user);

    await waitFor(() =>
      expect(CredentialTypesAPI.test).toHaveBeenCalledWith(21, expectedPayload)
    );
  });

  test('should display the alert after a successful test', async () => {
    vi.mocked(CredentialTypesAPI.test).mockResolvedValue(
      {} as unknown as ResponseOf<typeof CredentialTypesAPI.test>
    );
    const { user } = renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    await fillAndRun(user);

    // CredentialPluginTestAlert shows "Test passed" on success
    expect(await screen.findByText('Test passed')).toBeInTheDocument();
  });

  test('should display the alert after a failed test', async () => {
    vi.mocked(CredentialTypesAPI.test).mockRejectedValue({
      response: {
        data: {
          inputs: `HTTP 404
        {"errors":["no handler for route '/secret/foo/bar/baz'"]}
      `,
        },
      },
    });
    const { user } = renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    await fillAndRun(user);

    expect(
      await screen.findByText(
        "HTTP 404: no handler for route '/secret/foo/bar/baz'"
      )
    ).toBeInTheDocument();
  });

  test('tests a workload identity lookup as the job template picked', async () => {
    const oidcType = {
      ...credentialType,
      id: 42,
      namespace: 'hashivault_kv_oidc',
      inputs: {
        fields: [
          { id: 'url', label: 'Server URL', type: 'string' },
          { id: 'jwt_role', label: 'JWT Role', type: 'string' },
        ],
        metadata: [
          { id: 'secret_path', label: 'Path to Secret', type: 'string' },
          { id: 'secret_key', label: 'Key Name', type: 'string' },
        ],
        required: ['url', 'jwt_role', 'secret_path', 'secret_key'],
      },
    };
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 1, results: [{ id: 7, name: 'patch' }] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);

    const { user } = renderWithContexts(
      <ExternalTestModal
        credentialType={oidcType as unknown as CredentialType}
        credentialFormValues={{
          ...credentialFormValues,
          inputs: { url: 'http://hashivault:8200', jwt_role: 'infra' },
        }}
        onClose={vi.fn()}
      />
    );
    const jobTemplateInput = document.querySelector(
      'input#job_template'
    ) as HTMLInputElement;
    // disabled while the lookup reads its first page
    await waitFor(() => expect(jobTemplateInput).toBeEnabled());
    await user.type(jobTemplateInput, 'patch');
    // the lookup resolves what was typed a second after typing stops, and
    // Run stays disabled until it has
    expect(getRunButton()).toBeDisabled();
    await waitFor(() => expect(getRunButton()).toBeEnabled(), {
      timeout: 3000,
    });
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
      name: 'patch',
      role_level: 'execute_role',
    });
    await user.type(getInput('secret_path'), '/secret/linux/root');
    await user.type(getInput('secret_key'), 'password');
    await user.click(getRunButton());

    await waitFor(() =>
      expect(CredentialTypesAPI.test).toHaveBeenCalledWith(42, {
        inputs: { url: 'http://hashivault:8200', jwt_role: 'infra' },
        metadata: {
          secret_path: '/secret/linux/root',
          secret_key: 'password',
          job_template_id: 7,
        },
      })
    );
  });

  test('a lookup that does not log in as the job asks for no template', () => {
    renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType as unknown as CredentialType}
        credentialFormValues={credentialFormValues}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector('input#job_template')).toBeNull();
  });
});
