import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { CredentialTypesAPI, CredentialsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';

import CredentialTypeDetails from './CredentialTypeDetails';

jest.mock('../../../api');

const makeCredentialType = (overrides = {}) => ({
  name: 'Foo',
  description: 'Bar',
  kind: 'cloud',
  inputs: {
    fields: [
      { id: 'username', type: 'string', label: 'Jenkins username' },
      { id: 'password', type: 'string', label: 'Jenkins password', secret: true },
    ],
    required: ['username', 'password'],
  },
  injectors: {
    extra_vars: {
      Jenkins_password: '{{ password }}',
      Jenkins_username: '{{ username }}',
    },
  },
  summary_fields: {
    created_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    modified_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    user_capabilities: { edit: true, delete: true },
    ...(overrides.summary_fields || {}),
  },
  created: '2020-06-25T16:52:36.127008Z',
  modified: '2020-06-25T16:52:36.127022Z',
  ...overrides,
});

describe('<CredentialTypeDetails/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details properly', async () => {
    renderWithContexts(
      <CredentialTypeDetails credentialType={makeCredentialType()} />
    );
    await waitFor(() =>
      expect(screen.getByText('Name')).toBeInTheDocument()
    );
    assertDetail('Name', 'Foo');
    assertDetail('Description', 'Bar');
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.getByText('Input configuration')).toBeInTheDocument();
    expect(screen.getByText('Injector configuration')).toBeInTheDocument();
  });

  test('should disable delete and show proper tooltip when in use', async () => {
    CredentialsAPI.read.mockResolvedValue({ data: { count: 15 } });
    renderWithContexts(
      <CredentialTypeDetails credentialType={makeCredentialType()} />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    );
  });

  test('should show an error modal when fetching delete details fails', async () => {
    CredentialsAPI.read.mockRejectedValue(new Error('error'));
    renderWithContexts(
      <CredentialTypeDetails credentialType={makeCredentialType()} />
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/credential_types/42/details'],
    });
    const { user } = renderWithContexts(
      <CredentialTypeDetails credentialType={makeCredentialType({ id: 42 })} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    // PF4's Modal aria-hides the whole tree in jsdom, so query the confirm
    // button by its label (ignores aria-hidden) and fire the click directly.
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    await waitFor(() =>
      expect(CredentialTypesAPI.destroy).toHaveBeenCalledTimes(1)
    );
    expect(history.location.pathname).toBe('/credential_types');
  });

  test('should not render delete button without delete capability', async () => {
    renderWithContexts(
      <CredentialTypeDetails
        credentialType={makeCredentialType({
          summary_fields: {
            user_capabilities: { edit: true, delete: false },
          },
        })}
      />
    );
    await waitFor(() =>
      expect(screen.getByText('Name')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should not render edit button without edit capability', async () => {
    renderWithContexts(
      <CredentialTypeDetails
        credentialType={makeCredentialType({
          summary_fields: {
            user_capabilities: { edit: false, delete: true },
          },
        })}
      />
    );
    await waitFor(() =>
      expect(screen.getByText('Name')).toBeInTheDocument()
    );
    expect(screen.queryByLabelText('edit')).not.toBeInTheDocument();
  });
});
