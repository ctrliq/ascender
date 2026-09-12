import type { Credential, Untyped } from 'types/api';
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import {
  CredentialsAPI,
  CredentialInputSourcesAPI,
  CredentialTypesAPI,
  OrganizationsAPI,
  UsersAPI,
} from 'api';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import CredentialEdit from './CredentialEdit';

vi.mock('../../../api');
// The component reads useParams from react-router-dom (the route
// tree is v6); mock it there, keeping the rest of the module real.
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 3,
  }),
}));

// Drive the container directly through the shared CredentialForm's props.
/**
 * What the screen hands the form, as the stub the test puts in its place
 * captures it: the assertions read these back to say what the screen passed.
 */
interface CapturedFormProps {
  onSubmit: (...args: unknown[]) => Promise<void> | void;
  handleSubmit: (...args: unknown[]) => Promise<void> | void;
  onCancel: () => void;
  handleCancel: () => void;
  submitError?: unknown;
  [key: string]: unknown;
}

let formProps: CapturedFormProps | undefined;
vi.mock('../shared/CredentialForm', () => ({
  default: (props: CapturedFormProps) => {
    formProps = props;
    return (
      <button type="button" onClick={() => props.onCancel()}>
        mock-credential-form
      </button>
    );
  },
}));

const mockCredential = {
  id: 3,
  type: 'credential',
  url: '/api/v2/credentials/3/',
  summary_fields: {
    organization: {
      id: 1,
      name: 'org',
      description: '',
    },
    credential_type: {
      id: 1,
      name: 'Machine',
      description: '',
    },
    user_capabilities: {
      edit: true,
      delete: true,
      copy: true,
      use: true,
    },
  },
  created: '2020-02-18T15:35:04.563928Z',
  modified: '2020-02-18T15:35:04.563957Z',
  name: 'oersdgfasf',
  description: '',
  organization: 1,
  credential_type: 1,
  inputs: {},
  kind: 'ssh',
  cloud: false,
  kubernetes: false,
} as unknown as Credential;

const mockOrgAdmins = {
  data: {
    count: 1,
    results: [{ id: 1, name: 'org' }],
  },
};

const mockOrganizations = {
  data: {
    results: [{ id: 1 }],
    count: 1,
  },
};

const mockCredentialResults = {
  data: {
    results: [
      {
        id: 1,
        name: 'Machine',
        kind: 'ssh',
        namespace: 'ssh',
        managed: true,
        inputs: {
          fields: [
            { id: 'username', label: 'Username', type: 'string' },
            {
              id: 'password',
              label: 'Password',
              type: 'string',
              secret: true,
              ask_at_runtime: true,
            },
            {
              id: 'ssh_key_data',
              label: 'SSH Private Key',
              type: 'string',
              format: 'ssh_private_key',
              secret: true,
              multiline: true,
            },
            {
              id: 'ssh_public_key_data',
              label: 'Signed SSH Certificate',
              type: 'string',
              multiline: true,
              secret: true,
            },
            {
              id: 'ssh_key_unlock',
              label: 'Private Key Passphrase',
              type: 'string',
              secret: true,
              ask_at_runtime: true,
            },
            {
              id: 'become_method',
              label: 'Privilege Escalation Method',
              type: 'string',
            },
            {
              id: 'become_username',
              label: 'Privilege Escalation Username',
              type: 'string',
            },
            {
              id: 'become_password',
              label: 'Privilege Escalation Password',
              type: 'string',
              secret: true,
              ask_at_runtime: true,
            },
          ],
        },
        injectors: {},
      },
    ],
  },
};

const mockInputSources = {
  data: {
    results: [
      {
        id: 34,
        summary_fields: {
          source_credential: {
            id: 20,
            name: 'CyberArk Conjur Secrets Manager Lookup',
            description: '',
            kind: 'conjur',
            cloud: false,
            credential_type_id: 20,
          },
        },
        input_field_name: 'password',
        metadata: { secret_path: 'a', secret_version: 'b' },
        source_credential: 20,
      },
      {
        id: 35,
        summary_fields: {
          source_credential: {
            id: 20,
            name: 'CyberArk Conjur Secrets Manager Lookup',
            description: '',
            kind: 'conjur',
            cloud: false,
            credential_type_id: 20,
          },
        },
        input_field_name: 'become_username',
        metadata: { secret_path: 'foo', secret_version: 'bar' },
        source_credential: 20,
      },
    ],
  },
};

describe('<CredentialEdit />', () => {
  afterEach(() => {
    vi.clearAllMocks();
    formProps = undefined;
  });

  describe('Initial GET request succeeds', () => {
    let history: TestHistory;
    let user: TestUser;

    beforeEach(async () => {
      [
        [UsersAPI.readAdminOfOrganizations, mockOrgAdmins],
        [OrganizationsAPI.read, mockOrganizations],
        [CredentialTypesAPI.read, mockCredentialResults],
        [CredentialsAPI.update, { data: { id: 3 } }],
        [CredentialsAPI.readInputSources, mockInputSources],
      ].forEach(([apiMethod, mockData]: Untyped[]) => {
        vi.mocked(apiMethod).mockResolvedValue(mockData);
      });
      history = createMemoryHistory({ initialEntries: ['/credentials'] });
      ({ user } = renderWithContexts(
        <CredentialEdit credential={mockCredential} />,
        {
          context: { router: { history }, config: { me: { id: 1 } } },
        }
      ));
      await screen.findByText('mock-credential-form');
    });

    test('passes the credential and its input sources to the form', () => {
      expect(formProps!.credential).toEqual(mockCredential);
      // loaded input sources are keyed by input_field_name
      expect(Object.keys(formProps!.inputSources as object)).toEqual(
        expect.arrayContaining(['password', 'become_username'])
      );
    });

    test('handleCancel returns the user to credential detail', async () => {
      await user.click(screen.getByText('mock-credential-form'));
      expect(history.location.pathname).toEqual('/credentials/3/details');
    });

    test('handleSubmit should post to the api', async () => {
      await act(async () => {
        await formProps!.onSubmit({
          user: 1,
          name: 'foo',
          description: 'bar',
          credential_type: '1',
          inputs: {
            username: {
              credential: { id: 1, name: 'Some cred' },
              inputs: { foo: 'bar' },
            },
            password: 'foo',
            ssh_key_data: 'bar',
            ssh_public_key_data: 'baz',
            ssh_key_unlock: 'foobar',
            become_method: '',
            become_username: {
              credential: { id: 1, name: 'Some cred' },
              inputs: { secret_path: '/foo/bar', secret_version: '9000' },
              touched: true,
            },
            become_password: '',
          },
          passwordPrompts: {
            become_password: true,
          },
        });
      });

      expect(CredentialsAPI.update).toHaveBeenCalledWith(3, {
        user: 1,
        name: 'foo',
        organization: null,
        description: 'bar',
        credential_type: '1',
        inputs: {
          password: 'foo',
          ssh_key_data: 'bar',
          ssh_public_key_data: 'baz',
          ssh_key_unlock: 'foobar',
          become_method: '',
          become_password: 'ASK',
        },
      });
      expect(CredentialInputSourcesAPI.create).toHaveBeenCalledWith({
        input_field_name: 'username',
        metadata: { foo: 'bar' },
        source_credential: 1,
        target_credential: 3,
      });
      expect(CredentialInputSourcesAPI.update).toHaveBeenCalledWith(35, {
        metadata: { secret_path: '/foo/bar', secret_version: '9000' },
        source_credential: 1,
      });
      expect(CredentialInputSourcesAPI.destroy).toHaveBeenCalledWith(34);
      await waitFor(() =>
        expect(history.location.pathname).toBe('/credentials/3/details')
      );
    });
  });

  describe('Initial GET request fails', () => {
    test('shows error when initial GET request fails', async () => {
      vi.mocked(CredentialTypesAPI.read).mockRejectedValue(new Error());
      const history = createMemoryHistory({ initialEntries: ['/credentials'] });
      renderWithContexts(<CredentialEdit credential={mockCredential} />, {
        context: { router: { history } },
      });

      expect(
        await screen.findByText(/There was an error loading this content/)
      ).toBeInTheDocument();
    });
  });
});
