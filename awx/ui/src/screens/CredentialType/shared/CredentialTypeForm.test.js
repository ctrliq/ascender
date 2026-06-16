import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import CredentialTypeForm from './CredentialTypeForm';

jest.mock('../../../api');

const credentialType = {
  id: 28,
  type: 'credential_type',
  url: '/api/v2/credential_types/28/',
  summary_fields: {
    created_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    modified_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    user_capabilities: { edit: true, delete: true },
  },
  created: '2020-06-18T14:48:47.869002Z',
  modified: '2020-06-18T14:48:47.869017Z',
  name: 'Jenkins Credential',
  description: 'Jenkins Credential',
  kind: 'cloud',
  namespace: null,
  managed: false,
  inputs: JSON.stringify({
    fields: [
      { id: 'username', type: 'string', label: 'Jenkins username' },
      { id: 'password', type: 'string', label: 'Jenkins password', secret: true },
    ],
    required: ['username', 'password'],
  }),
  injectors: JSON.stringify({
    extra_vars: {
      Jenkins_password: '{{ password }}',
      Jenkins_username: '{{ username }}',
    },
  }),
};

describe('<CredentialTypeForm/>', () => {
  let onCancel;
  let onSubmit;

  const renderForm = () => {
    onCancel = jest.fn();
    onSubmit = jest.fn();
    return renderWithContexts(
      <CredentialTypeForm
        onCancel={onCancel}
        onSubmit={onSubmit}
        credentialType={credentialType}
      />
    );
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should display form fields properly', () => {
    renderForm();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Input configuration')).toBeInTheDocument();
    expect(screen.getByText('Injector configuration')).toBeInTheDocument();
  });

  test('should call onSubmit when the form is submitted', async () => {
    const { user } = renderForm();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('should update form values', async () => {
    const { user, container } = renderForm();

    // PF4's FormField renders a Popover labelIcon that breaks getByLabelText's
    // label association, so the inputs are selected by id; assert they exist
    // before interacting so a markup change fails clearly.
    const nameField = container.querySelector('#credential-type-name');
    expect(nameField).toBeInTheDocument();
    await user.clear(nameField);
    await user.type(nameField, 'Foo');
    expect(nameField).toHaveValue('Foo');

    const descriptionField = container.querySelector(
      '#credential-type-description'
    );
    expect(descriptionField).toBeInTheDocument();
    await user.clear(descriptionField);
    await user.type(descriptionField, 'New description');
    expect(descriptionField).toHaveValue('New description');
  });

  test('should call onCancel when Cancel button is clicked', async () => {
    const { user } = renderForm();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
