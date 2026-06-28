import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { createMemoryHistory } from 'history';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import CredentialsStep from './CredentialsStep';

jest.mock('../../../api/models/CredentialTypes');
jest.mock('../../../api/models/Credentials');

const types = [
  { id: 1, kind: 'ssh', name: 'SSH', url: '/api/v2/credential_types/1/' },
  { id: 3, kind: 'vault', name: 'Vault', url: '/api/v2/credential_types/3/' },
  {
    id: 5,
    name: 'Amazon Web Services',
    kind: 'cloud',
    url: '/api/v2/credential_types/5/',
  },
  {
    id: 9,
    name: 'Google Compute Engine',
    kind: 'cloud',
    url: '/api/v2/credential_types/9/',
  },
];

const credentials = [
  {
    id: 1,
    kind: 'aws',
    name: 'Cred 1',
    credential_type: 5,
    url: '/api/v2/credentials/1/',
    inputs: {},
  },
  {
    id: 2,
    kind: 'ssh',
    name: 'Cred 2',
    credential_type: 1,
    url: '/api/v2/credentials/2/',
    inputs: {
      password: 'ASK',
    },
  },
  {
    id: 3,
    kind: 'gce',
    name: 'Cred 3',
    credential_type: 9,
    url: '/api/v2/credentials/3/',
    inputs: {},
  },
  {
    id: 4,
    kind: 'ssh',
    name: 'Cred 4',
    credential_type: 1,
    url: '/api/v2/credentials/4/',
    inputs: {},
  },
  {
    id: 5,
    kind: 'ssh',
    name: 'Cred 5',
    credential_type: 1,
    url: '/api/v2/credentials/5/',
    inputs: {},
  },
  {
    id: 33,
    kind: 'vault',
    name: 'Cred 33',
    credential_type: 3,
    url: '/api/v2/credentials/33/',
    inputs: {
      vault_id: 'foo',
    },
    summary_fields: {
      credential_type: {
        name: 'Vault',
      },
    },
  },
  {
    id: 34,
    kind: 'vault',
    name: 'Cred 34',
    credential_type: 3,
    url: '/api/v2/credentials/34/',
    inputs: {
      vault_id: 'bar',
    },
    summary_fields: {
      credential_type: {
        name: 'Vault',
      },
    },
  },
];

// The credential-type AnsibleSelect renders a native <select> with a generic
// "Select Input" aria-label, so locate it by its stable id.
async function findCategorySelect(container) {
  return waitFor(() => {
    const el = container.querySelector('select#multiCredentialsLookUp-select');
    expect(el).not.toBeNull();
    return el;
  });
}

describe('CredentialsStep', () => {
  beforeEach(() => {
    CredentialTypesAPI.loadAllTypes.mockResolvedValue(types);
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: credentials,
        count: 5,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('should load credentials', async () => {
    renderWithContexts(
      <Formik>
        <CredentialsStep allowCredentialsWithPasswords />
      </Formik>
    );

    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('Cred 1')).toBeInTheDocument();
    expect(screen.getByText('Cred 2')).toBeInTheDocument();
    expect(screen.getByText('Cred 5')).toBeInTheDocument();
  });

  test('should load credentials for selected type', async () => {
    const { user, container } = renderWithContexts(
      <Formik>
        <CredentialsStep allowCredentialsWithPasswords />
      </Formik>
    );

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 1,
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );

    const select = await findCategorySelect(container);
    // the native <select> option values are credential type ids, so select
    // by the Vault type id (3) rather than its label
    await user.selectOptions(select, '3');

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 3,
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
  });

  test('should reset query params (credential.page) when selected credential type is changed', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '?credential.page=2&credential.page_size=5&credential.order_by=name',
      ],
    });
    const { user, container } = renderWithContexts(
      <Formik>
        <CredentialsStep allowCredentialsWithPasswords />
      </Formik>,
      {
        context: { router: { history } },
      }
    );

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 1,
        order_by: 'name',
        page: 2,
        page_size: 5,
      })
    );

    const select = await findCategorySelect(container);
    // the native <select> option values are credential type ids, so select
    // by the Vault type id (3) rather than its label
    await user.selectOptions(select, '3');

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 3,
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
  });

  test("error should be shown when a credential that prompts for passwords is selected on a step that doesn't allow it", async () => {
    const { user, container } = renderWithContexts(
      <Formik
        initialValues={{
          credentials: [],
        }}
      >
        <CredentialsStep allowCredentialsWithPasswords={false} />
      </Formik>
    );

    await screen.findByText('Cred 2');
    expect(screen.queryByText(/require passwords on launch/)).toBeNull();

    const checkbox = container.querySelector('#check-action-item-2 input');
    await user.click(checkbox);

    const alert = await screen.findByText(/require passwords on launch/);
    expect(alert).toHaveTextContent('Cred 2');
  });

  test('error should be toggled when default machine credential is removed and then replaced', async () => {
    const selectedCredentials = [
      {
        id: 5,
        kind: 'ssh',
        name: 'Cred 5',
        credential_type: 1,
        url: '/api/v2/credentials/5/',
        inputs: {},
        summary_fields: {
          credential_type: {
            name: 'Machine',
          },
        },
      },
    ];
    const { user, container } = renderWithContexts(
      <Formik
        initialValues={{
          credentials: selectedCredentials,
        }}
      >
        <CredentialsStep
          allowCredentialsWithPasswords={false}
          defaultCredentials={selectedCredentials}
        />
      </Formik>
    );

    await screen.findByText('Cred 2');
    expect(screen.queryByText(/must be replaced/)).toBeNull();

    const removeChip = screen.getByRole('button', { name: 'SSH: Cred 5' });
    await user.click(removeChip);

    const alert = await screen.findByText(/must be replaced/);
    expect(alert).toHaveTextContent('Machine');

    const checkbox = container.querySelector('#check-action-item-5 input');
    await user.click(checkbox);

    await waitFor(() =>
      expect(screen.queryByText(/must be replaced/)).toBeNull()
    );
  });

  test('error should be toggled when default vault credential is removed and then replaced', async () => {
    const selectedCredentials = [
      {
        id: 33,
        kind: 'vault',
        name: 'Cred 33',
        credential_type: 3,
        url: '/api/v2/credentials/33/',
        inputs: {
          vault_id: 'foo',
        },
        summary_fields: {
          credential_type: {
            name: 'Vault',
          },
        },
      },
      {
        id: 34,
        kind: 'vault',
        name: 'Cred 34',
        credential_type: 3,
        url: '/api/v2/credentials/34/',
        inputs: {
          vault_id: 'bar',
        },
        summary_fields: {
          credential_type: {
            name: 'Vault',
          },
        },
      },
    ];
    const { user, container } = renderWithContexts(
      <Formik
        initialValues={{
          credentials: selectedCredentials,
        }}
      >
        <CredentialsStep
          allowCredentialsWithPasswords={false}
          defaultCredentials={selectedCredentials}
        />
      </Formik>
    );

    await screen.findByText('Cred 1');
    expect(screen.queryByText(/must be replaced/)).toBeNull();

    const removeChip = screen.getByRole('button', {
      name: 'Vault: Cred 33 | foo',
    });
    await user.click(removeChip);

    const alert = await screen.findByText(/must be replaced/);
    expect(alert).toHaveTextContent('Vault | foo');

    const select = await findCategorySelect(container);
    // the native <select> option values are credential type ids, so select
    // by the Vault type id (3) rather than its label
    await user.selectOptions(select, '3');

    const checkbox = await waitFor(() => {
      const el = container.querySelector('#check-action-item-33 input');
      expect(el).not.toBeNull();
      return el;
    });
    await user.click(checkbox);

    await waitFor(() =>
      expect(screen.queryByText(/must be replaced/)).toBeNull()
    );
  });
});
