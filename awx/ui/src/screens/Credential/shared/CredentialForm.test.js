import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import machineCredential from './data.machineCredential.json';
import gceCredential from './data.gceCredential.json';
import scmCredential from './data.scmCredential.json';
import galaxyCredential from './data.galaxyCredential.json';
import towerCredential from './data.towerCredential.json';
import credentialTypesArr from './data.credentialTypes.json';
import CredentialForm from './CredentialForm';

jest.mock('../../../api');

// jsdom's File does not implement Blob.text(); the GceFileUploadField reads the
// uploaded file via `await value.text()`. Build a File whose text() resolves to
// the provided contents so the real upload path can run.
function makeJsonFile(contents, name = 'foo.json') {
  const file = new File([contents], name, { type: 'application/json' });
  file.text = () => Promise.resolve(contents);
  return file;
}

const credentialTypes = credentialTypesArr.reduce(
  (credentialTypesMap, credentialType) => {
    credentialTypesMap[credentialType.id] = credentialType;
    return credentialTypesMap;
  },
  {}
);

// FormGroup renders its `label` text in a <label>/<span>; query that text to
// assert a field group is present.
function expectGroup(label) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

function expectCommonGroups() {
  expectGroup('Name');
  expectGroup('Description');
  expectGroup('Organization');
  expectGroup('Credential Type');
}

function machineFieldExpects(container) {
  expectCommonGroups();
  expectGroup('Username');
  expect(container.querySelector('input#credential-password')).toBeInTheDocument();
  expectGroup('SSH Private Key');
  expectGroup('Signed SSH Certificate');
  expect(
    container.querySelector('input#credential-ssh_key_unlock')
  ).toBeInTheDocument();
  expectGroup('Privilege Escalation Method');
  expectGroup('Privilege Escalation Username');
  expect(
    container.querySelector('input#credential-become_password')
  ).toBeInTheDocument();
}

function sourceFieldExpects() {
  expectCommonGroups();
  expectGroup('Username');
  expectGroup('Password');
  expectGroup('SCM Private Key');
  expectGroup('Private Key Passphrase');
}

function gceFieldExpects() {
  expectCommonGroups();
  expectGroup('Service account JSON file');
  expectGroup('Service Account Email Address');
  expectGroup('Project');
  expectGroup('RSA Private Key');
}

async function selectCredentialType(user, label) {
  const input = screen.getByRole('textbox', { name: 'Select Credential Type' });
  await user.clear(input);
  await user.click(input);
  await user.click(await screen.findByText(label));
}

async function renderForm(props) {
  const result = renderWithContexts(
    <CredentialForm
      onCancel={() => {}}
      onSubmit={() => {}}
      credentialTypes={credentialTypes}
      {...props}
    />
  );
  // OrganizationLookup fetches on mount; let it settle to avoid act warnings
  await screen.findByText('Name');
  await waitFor(() =>
    expect(OrganizationsAPI.read).toHaveBeenCalled()
  );
  return result;
}

describe('<CredentialForm />', () => {
  const onCancel = jest.fn();

  beforeEach(() => {
    OrganizationsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    OrganizationsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Add', () => {
    test('should display form fields on add properly', async () => {
      await renderForm();
      expectCommonGroups();
    });

    test('should hide Test button initially', async () => {
      await renderForm();
      expect(
        screen.queryByRole('button', { name: 'Test' })
      ).not.toBeInTheDocument();
    });

    test('should update form values', async () => {
      const { user } = await renderForm();

      const nameInput = screen.getByLabelText('Name', { exact: false });
      const descriptionInput = screen.getByLabelText('Description');
      await user.type(nameInput, 'new Foo');
      await user.type(descriptionInput, 'new Bar');
      expect(nameInput).toHaveValue('new Foo');
      expect(descriptionInput).toHaveValue('new Bar');
    });

    test('should display cred type subform when scm type select has a value', async () => {
      const { user, container } = await renderForm();

      await selectCredentialType(user, 'Machine');
      machineFieldExpects(container);

      await selectCredentialType(user, 'Source Control');
      sourceFieldExpects();
    });

    test('should update expected fields when gce service account json file uploaded', async () => {
      const { user, container } = await renderForm();

      await selectCredentialType(user, 'Google Compute Engine');
      gceFieldExpects();
      expect(container.querySelector('input#credential-username')).toHaveValue('');
      expect(container.querySelector('input#credential-project')).toHaveValue('');
      expect(
        container.querySelector('textarea#credential-ssh_key_data')
      ).toHaveValue('');

      // the gce FileUpload's hidden dropzone input shares the FileUpload
      // wrapper that also holds the browse button #credential-gce-file-filename
      const fileInput = container
        .querySelector('#credential-gce-file-filename')
        .closest('.pf-v6-c-file-upload')
        .querySelector('input[type="file"]');
      const file = makeJsonFile(
        '{"client_email":"testemail@ansible.com","project_id":"test123","private_key":"-----BEGIN PRIVATE KEY-----\\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\n-----END PRIVATE KEY-----\\n"}'
      );
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() =>
        expect(container.querySelector('input#credential-username')).toHaveValue(
          'testemail@ansible.com'
        )
      );
      expect(container.querySelector('input#credential-project')).toHaveValue(
        'test123'
      );
      expect(
        container.querySelector('textarea#credential-ssh_key_data')
      ).toHaveValue(
        '-----BEGIN PRIVATE KEY-----\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END PRIVATE KEY-----\n'
      );

      // clearing the file resets the autopopulated fields (scope to the gce
      // FileUpload — other multiline fields also render a Clear button)
      const gceClearButton = within(
        container
          .querySelector('#credential-gce-file-filename')
          .closest('.pf-v6-c-file-upload')
      ).getByRole('button', { name: 'Clear' });
      await user.click(gceClearButton);
      await waitFor(() =>
        expect(container.querySelector('input#credential-username')).toHaveValue(
          ''
        )
      );
      expect(container.querySelector('input#credential-project')).toHaveValue('');
      expect(
        container.querySelector('textarea#credential-ssh_key_data')
      ).toHaveValue('');
    });

    test('should update field when RSA Private Key file uploaded', async () => {
      const { user, container } = await renderForm();
      await selectCredentialType(user, 'Google Compute Engine');

      const sshKeyTextarea = container.querySelector(
        'textarea#credential-ssh_key_data'
      );
      await user.type(sshKeyTextarea, 'my-private-key');
      expect(sshKeyTextarea).toHaveValue('my-private-key');
    });

    test('should show error when error thrown parsing JSON', async () => {
      const { user, container } = await renderForm();
      await selectCredentialType(user, 'Google Compute Engine');

      expect(
        screen.getByText(
          'Select a JSON formatted service account key to autopopulate the following fields.'
        )
      ).toBeInTheDocument();

      // the gce FileUpload's hidden dropzone input shares the FileUpload
      // wrapper that also holds the browse button #credential-gce-file-filename
      const fileInput = container
        .querySelector('#credential-gce-file-filename')
        .closest('.pf-v6-c-file-upload')
        .querySelector('input[type="file"]');
      const file = makeJsonFile('{not good json}');
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(
        await screen.findByText(
          'There was an error parsing the file. Please check the file formatting and try again.'
        )
      ).toBeInTheDocument();
    });

    test('should show Test button when external credential type is selected', async () => {
      const { user } = await renderForm();
      await selectCredentialType(user, 'HashiCorp Vault Secret Lookup');

      const testButton = await screen.findByRole('button', { name: 'Test' });
      expect(testButton).toBeInTheDocument();
      expect(testButton).toBeDisabled();
    });

    test('should call handleCancel when Cancel button is clicked', async () => {
      const { user } = await renderForm({ onCancel });
      expect(onCancel).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Edit', () => {
    test('should display form fields for machine credential properly', async () => {
      const { container } = await renderForm({ credential: machineCredential });
      machineFieldExpects(container);
    });

    test('organization lookup should be disabled', async () => {
      await renderForm({
        credential: machineCredential,
        isOrgLookupDisabled: true,
      });
      // When the org lookup is disabled, its Search button is disabled.
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    });

    test('should display form fields for source control credential properly', async () => {
      await renderForm({ credential: scmCredential });
      sourceFieldExpects();
    });

    test('should display form fields for gce credential properly', async () => {
      await renderForm({ credential: gceCredential });
      gceFieldExpects();
    });

    test('should display form fields for galaxy/automation hub credentials', async () => {
      await renderForm({ credential: galaxyCredential });
      expectCommonGroups();
    });

    test('should display form fields for tower credentials', async () => {
      const { container } = await renderForm({ credential: towerCredential });
      expectCommonGroups();
      expectGroup('Ansible Controller Hostname');
      expectGroup('Username');
      expectGroup('Password');
      expectGroup('OAuth Token');
      expect(
        container.querySelector('input#credential-verify_ssl')
      ).not.toBeChecked();
    });
  });
});
