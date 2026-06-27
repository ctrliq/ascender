import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { Formik } from 'formik';
import { createMemoryHistory } from 'history';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import MultiCredentialsLookup from './MultiCredentialsLookup';

jest.mock('../../api');

describe('<Formik><MultiCredentialsLookup /></Formik>', () => {
  const credentials = [
    {
      id: 1,
      credential_type: 1,
      kind: 'gce',
      name: 'Foo',
      url: 'www.google.com',
    },
    {
      id: 2,
      credential_type: 2,
      kind: 'ssh',
      name: 'Alex',
      url: 'www.google.com',
    },
    {
      id: 21,
      credential_type: 3,
      kind: 'vault',
      inputs: { vault_id: '1' },
      name: 'Gatsby',
    },
    { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
    { id: 8, credential_type: 4, kind: 'Machine', name: 'Gatsby' },
  ];

  function renderLookup(props = {}, options = {}) {
    return renderWithContexts(
      <Formik>
        <MultiCredentialsLookup
          value={credentials}
          tooltip="This is credentials look up"
          onChange={() => {}}
          onError={() => {}}
          {...props}
        />
      </Formik>,
      options
    );
  }

  beforeEach(() => {
    CredentialTypesAPI.loadAllTypes.mockResolvedValue([
      {
        id: 400,
        kind: 'ssh',
        namespace: 'biz',
        name: 'Amazon Web Services',
      },
      { id: 500, kind: 'vault', namespace: 'buzz', name: 'Vault' },
      { id: 600, kind: 'machine', namespace: 'fuzz', name: 'Machine' },
    ]);
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            credential_type: 1,
            kind: 'gc2',
            name: 'Cred 1',
            url: 'www.google.com',
          },
          {
            id: 2,
            credential_type: 2,
            kind: 'ssh',
            name: 'Cred 2',
            url: 'www.google.com',
          },
          {
            id: 3,
            credential_type: 5,
            kind: 'Ansible',
            name: 'Cred 3',
            url: 'www.google.com',
          },
          {
            id: 4,
            credential_type: 4,
            kind: 'Machine',
            name: 'Cred 4',
            url: 'www.google.com',
          },
          {
            id: 5,
            credential_type: 4,
            kind: 'Machine',
            name: 'Cred 5',
            url: 'www.google.com',
          },
          {
            id: 6,
            credential_type: 5,
            kind: 'vault',
            name: 'Cred 6',
            url: 'www.google.com',
            inputs: { vault_id: 'vault ID' },
          },
          {
            id: 7,
            credential_type: 5,
            kind: 'vault',
            name: 'Cred 7',
            url: 'www.google.com',
            inputs: {},
          },
        ],
        count: 7,
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should load credential types', async () => {
    const onChange = jest.fn();
    renderLookup({ onChange });
    await waitFor(() =>
      expect(CredentialTypesAPI.loadAllTypes).toHaveBeenCalled()
    );
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('onChange is called when you click to remove a credential from input', async () => {
    const onChange = jest.fn();
    const { user } = renderLookup({ onChange });
    await waitFor(() =>
      expect(CredentialTypesAPI.loadAllTypes).toHaveBeenCalled()
    );

    // remove the second chip (SSH: Alex)
    const chip = screen.getByText('Alex').closest('.pf-v6-c-label');
    await user.click(within(chip).getByRole('button'));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 1,
        credential_type: 1,
        kind: 'gce',
        name: 'Foo',
        url: 'www.google.com',
      },
      {
        id: 21,
        credential_type: 3,
        kind: 'vault',
        inputs: { vault_id: '1' },
        name: 'Gatsby',
      },
      { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
      { id: 8, credential_type: 4, kind: 'Machine', name: 'Gatsby' },
    ]);
  });

  test('should change credential types', async () => {
    const { user } = renderLookup();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(2));

    // category select renders the initial ssh credentials
    expect(await within(dialog).findByText('Cred 2')).toBeInTheDocument();

    CredentialsAPI.read.mockResolvedValueOnce({
      data: {
        results: [
          { id: 1, kind: 'cloud', name: 'New Cred', url: 'www.google.com' },
        ],
        count: 1,
      },
    });
    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    expect(await within(dialog).findByText('New Cred')).toBeInTheDocument();
  });

  test('should reset query params (credentials.page) when selected credential type is changed', async () => {
    const history = createMemoryHistory({
      initialEntries: ['?credentials.page=2'],
    });
    const { user } = renderLookup(
      {},
      { context: { router: { history } } }
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 400,
        order_by: 'name',
        page: 2,
        page_size: 5,
      })
    );

    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        credential_type: 500,
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
  });

  test('should only add 1 credential per credential type except vault(see below)', async () => {
    const onChange = jest.fn();
    const { user } = renderLookup({ onChange });
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    // ssh category => single-select (radio)
    const cred5Row = (await within(dialog).findByText('Cred 5')).closest('tr');
    await user.click(within(cred5Row).getByRole('radio'));

    await user.click(within(dialog).getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 1,
        credential_type: 1,
        kind: 'gce',
        name: 'Foo',
        url: 'www.google.com',
      },
      {
        id: 2,
        credential_type: 2,
        kind: 'ssh',
        name: 'Alex',
        url: 'www.google.com',
      },
      {
        id: 21,
        credential_type: 3,
        kind: 'vault',
        inputs: { vault_id: '1' },
        name: 'Gatsby',
      },
      { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
      {
        id: 5,
        credential_type: 4,
        kind: 'Machine',
        name: 'Cred 5',
        url: 'www.google.com',
        label: 'Cred 5',
      },
    ]);
  });

  test('should properly render vault credential labels', async () => {
    const { user } = renderLookup();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    expect(
      await within(dialog).findByText('Cred 6 | vault ID')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Cred 7')).toBeInTheDocument();
  });

  test('should allow multiple vault credentials with no vault id', async () => {
    const onChange = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 11,
            credential_type: 3,
            kind: 'vault',
            name: 'Vault',
            url: 'www.google.com',
          },
        ],
        count: 1,
      },
    });
    const { user } = renderLookup({ onChange });
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    const vaultRow = (
      await within(dialog).findByText('Vault', { selector: 'b' })
    ).closest('tr');
    await user.click(within(vaultRow).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 1,
        credential_type: 1,
        kind: 'gce',
        name: 'Foo',
        url: 'www.google.com',
      },
      {
        id: 2,
        credential_type: 2,
        kind: 'ssh',
        name: 'Alex',
        url: 'www.google.com',
      },
      {
        id: 21,
        credential_type: 3,
        kind: 'vault',
        inputs: { vault_id: '1' },
        name: 'Gatsby',
      },
      { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
      { id: 8, credential_type: 4, kind: 'Machine', name: 'Gatsby' },
      {
        id: 11,
        credential_type: 3,
        kind: 'vault',
        name: 'Vault',
        url: 'www.google.com',
        label: 'Vault',
      },
    ]);
  });

  test('should allow multiple vault credentials with different vault ids', async () => {
    const onChange = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 12,
            credential_type: 3,
            kind: 'vault',
            name: 'Other Vault',
            url: 'www.google.com',
            inputs: { vault_id: '2' },
          },
        ],
        count: 1,
      },
    });
    const { user } = renderLookup({ onChange });
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    const vaultRow = (
      await within(dialog).findByText('Other Vault | 2')
    ).closest('tr');
    await user.click(within(vaultRow).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 1,
        credential_type: 1,
        kind: 'gce',
        name: 'Foo',
        url: 'www.google.com',
      },
      {
        id: 2,
        credential_type: 2,
        kind: 'ssh',
        name: 'Alex',
        url: 'www.google.com',
      },
      {
        id: 21,
        credential_type: 3,
        kind: 'vault',
        inputs: { vault_id: '1' },
        name: 'Gatsby',
      },
      { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
      { id: 8, credential_type: 4, kind: 'Machine', name: 'Gatsby' },
      {
        id: 12,
        credential_type: 3,
        kind: 'vault',
        name: 'Other Vault',
        url: 'www.google.com',
        inputs: { vault_id: '2' },
        label: 'Other Vault | 2',
      },
    ]);
  });

  test('should not select multiple vault credentials with same vault id', async () => {
    const onChange = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 13,
            credential_type: 3,
            kind: 'vault',
            name: 'Vault Cred with Same Vault Id',
            url: 'www.google.com',
            inputs: { vault_id: '1' },
          },
        ],
        count: 1,
      },
    });
    const { user } = renderLookup({ onChange });
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), '500');

    const vaultRow = (
      await within(dialog).findByText('Vault Cred with Same Vault Id | 1')
    ).closest('tr');
    await user.click(within(vaultRow).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 1,
        credential_type: 1,
        kind: 'gce',
        name: 'Foo',
        url: 'www.google.com',
      },
      {
        id: 2,
        credential_type: 2,
        kind: 'ssh',
        name: 'Alex',
        url: 'www.google.com',
      },
      { id: 23, credential_type: 3, kind: 'vault', name: 'Gatsby 2' },
      { id: 8, credential_type: 4, kind: 'Machine', name: 'Gatsby' },
      {
        id: 13,
        credential_type: 3,
        kind: 'vault',
        name: 'Vault Cred with Same Vault Id',
        url: 'www.google.com',
        inputs: { vault_id: '1' },
        label: 'Vault Cred with Same Vault Id | 1',
      },
    ]);
  });
});
