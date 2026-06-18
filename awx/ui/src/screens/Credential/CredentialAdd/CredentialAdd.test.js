import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import {
  CredentialsAPI,
  CredentialInputSourcesAPI,
  CredentialTypesAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import CredentialAdd from './CredentialAdd';

jest.mock('../../../api');

// Drive the container directly through the shared CredentialForm's props.
let formProps;
jest.mock('../shared/CredentialForm', () => (props) => {
  formProps = props;
  return (
    <button type="button" onClick={() => props.onCancel()}>
      mock-credential-form
    </button>
  );
});

const mockCredentialTypeResults = {
  data: {
    results: [
      {
        id: 1,
        name: 'Machine',
        kind: 'ssh',
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

describe('<CredentialAdd />', () => {
  afterEach(() => {
    jest.clearAllMocks();
    formProps = undefined;
  });

  describe('Initial GET request succeeds', () => {
    let history;
    let user;

    beforeEach(async () => {
      CredentialTypesAPI.read.mockResolvedValue(mockCredentialTypeResults);
      // NOTE: jest auto-mocks all `*API.create` to the SAME shared fn (they
      // share a prototype via the Base class), so we only set the resolved
      // value once; both CredentialsAPI.create and
      // CredentialInputSourcesAPI.create return { data: { id: 13 } }.
      CredentialsAPI.create.mockResolvedValue({ data: { id: 13 } });
      history = createMemoryHistory({ initialEntries: ['/credentials'] });
      ({ user } = renderWithContexts(<CredentialAdd />, {
        context: { router: { history } },
      }));
      await screen.findByText('mock-credential-form');
    });

    test('handleSubmit should call the api and redirect to details page', async () => {
      await act(async () => {
        await formProps.onSubmit({
        user: 1,
        name: 'foo',
        description: 'bar',
        credential_type: '1',
        inputs: {
          username: {
            credential: {
              id: 1,
              name: 'Some cred',
            },
            inputs: {
              foo: 'bar',
            },
          },
          password: 'foo',
          ssh_key_data: 'bar',
          ssh_public_key_data: 'baz',
          ssh_key_unlock: 'foobar',
          become_method: '',
          become_username: '',
          become_password: '',
        },
          passwordPrompts: {
            become_password: true,
          },
        });
      });

      expect(CredentialsAPI.create).toHaveBeenCalledWith({
        user: 1,
        name: 'foo',
        description: 'bar',
        credential_type: '1',
        inputs: {
          password: 'foo',
          ssh_key_data: 'bar',
          ssh_public_key_data: 'baz',
          ssh_key_unlock: 'foobar',
          become_method: '',
          become_username: '',
          become_password: 'ASK',
        },
      });
      expect(CredentialInputSourcesAPI.create).toHaveBeenCalledWith({
        input_field_name: 'username',
        metadata: {
          foo: 'bar',
        },
        source_credential: 1,
        target_credential: 13,
      });
      await waitFor(() =>
        expect(history.location.pathname).toBe('/credentials/13/details')
      );
    });

    test('handleCancel should return the user back to the credentials list', async () => {
      await user.click(screen.getByText('mock-credential-form'));
      expect(history.location.pathname).toEqual('/credentials');
    });
  });

  describe('Initial GET request fails', () => {
    test('shows error when initial GET request fails', async () => {
      CredentialTypesAPI.read.mockRejectedValue(new Error());
      const history = createMemoryHistory({ initialEntries: ['/credentials'] });
      renderWithContexts(<CredentialAdd />, {
        context: { router: { history } },
      });

      expect(
        await screen.findByText(/There was an error loading this content/)
      ).toBeInTheDocument();
    });
  });
});
