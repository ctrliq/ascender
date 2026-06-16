import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExternalTestModal from './ExternalTestModal';
import credentialTypesArr from './data.credentialTypes.json';

jest.mock('../../../api/models/Credentials');
jest.mock('../../../api/models/CredentialTypes');

const credentialType = credentialTypesArr.find(
  (credType) => credType.namespace === 'hashivault_kv'
);

const credentialFormValues = {
  name: 'Foobar',
  credential_type: credentialType.id,
  inputs: {
    api_version: 'v2',
    token: '$encrypted$',
    url: 'http://hashivault:8200',
  },
};

const credential = {
  id: 1,
  name: 'A credential',
  credential_type: credentialType.id,
};

// The modal is rendered in a portal; query its fields/buttons against document.
const getInput = (id) => document.querySelector(`input#credential-${id}`);
const getRunButton = () =>
  screen.getByRole('button', { name: 'Run' });

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

async function fillAndRun(user) {
  await user.type(getInput('secret_path'), '/secret/foo/bar/baz');
  await user.type(getInput('secret_key'), 'password');
  await user.click(getRunButton());
}

describe('<ExternalTestModal />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display metadata fields correctly', () => {
    renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType}
        credentialFormValues={credentialFormValues}
        onClose={jest.fn()}
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
        credentialType={credentialType}
        credentialFormValues={credentialFormValues}
        onClose={jest.fn()}
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
        credentialType={credentialType}
        credentialFormValues={credentialFormValues}
        onClose={jest.fn()}
      />
    );
    await fillAndRun(user);

    await waitFor(() =>
      expect(CredentialTypesAPI.test).toHaveBeenCalledWith(21, expectedPayload)
    );
  });

  test('should display the alert after a successful test', async () => {
    CredentialTypesAPI.test.mockResolvedValue({});
    const { user } = renderWithContexts(
      <ExternalTestModal
        credentialType={credentialType}
        credentialFormValues={credentialFormValues}
        onClose={jest.fn()}
      />
    );
    await fillAndRun(user);

    // CredentialPluginTestAlert shows "Test passed" on success
    expect(await screen.findByText('Test passed')).toBeInTheDocument();
  });

  test('should display the alert after a failed test', async () => {
    CredentialTypesAPI.test.mockRejectedValue({
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
        credentialType={credentialType}
        credentialFormValues={credentialFormValues}
        onClose={jest.fn()}
      />
    );
    await fillAndRun(user);

    expect(
      await screen.findByText(
        "HTTP 404: no handler for route '/secret/foo/bar/baz'"
      )
    ).toBeInTheDocument();
  });
});
