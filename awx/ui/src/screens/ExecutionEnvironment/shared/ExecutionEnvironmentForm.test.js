import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI, CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentForm from './ExecutionEnvironmentForm';

jest.mock('../../../api');

const mockMe = { is_superuser: true, is_super_auditor: false };

const executionEnvironment = {
  id: 16,
  name: 'Test EE',
  type: 'execution_environment',
  pull: 'one',
  summary_fields: {
    organization: { id: 1, name: 'Default', description: '' },
    credential: { id: 4, name: 'Container Registry', kind: 'registry' },
  },
  description: 'A simple EE',
  organization: 1,
  image: 'https://registry.com/image/container',
  managed: false,
  credential: 4,
};

const globallyAvailableEE = {
  ...executionEnvironment,
  id: 17,
  name: 'GEE',
  summary_fields: {
    credential: { id: 4, name: 'Container Registry', kind: 'registry' },
  },
  organization: null,
};

const mockOptions = {
  data: {
    actions: {
      POST: {
        pull: {
          choices: [
            ['one', 'One'],
            ['two', 'Two'],
            ['three', 'Three'],
          ],
        },
      },
    },
  },
};

const containerRegistryCredentialResolve = {
  data: {
    results: [{ id: 4, name: 'Container Registry', kind: 'registry' }],
    count: 1,
  },
};

const renderForm = async (props = {}) => {
  ExecutionEnvironmentsAPI.readOptions.mockResolvedValue(mockOptions);
  CredentialTypesAPI.read.mockResolvedValue(containerRegistryCredentialResolve);
  const onCancel = jest.fn();
  const onSubmit = jest.fn();
  const result = renderWithContexts(
    <ExecutionEnvironmentForm
      onCancel={onCancel}
      onSubmit={onSubmit}
      executionEnvironment={executionEnvironment}
      me={mockMe}
      {...props}
    />
  );
  // wait for the form to finish loading (ContentLoading -> fields)
  await screen.findByRole('button', { name: 'Save' });
  return { ...result, onCancel, onSubmit };
};

describe('<ExecutionEnvironmentForm/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display the form fields', async () => {
    await renderForm();
    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Registry credential')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  test('should call onSubmit when the form is submitted', async () => {
    const { user, onSubmit } = await renderForm();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('should update the image and description fields', async () => {
    const { user, container } = await renderForm();
    const imageField = container.querySelector('#execution-environment-image');
    await user.clear(imageField);
    await user.type(imageField, 'https://registry.com/image/container2');
    expect(imageField).toHaveValue('https://registry.com/image/container2');

    const descField = container.querySelector(
      '#execution-environment-description'
    );
    await user.clear(descField);
    await user.type(descField, 'New description');
    expect(descField).toHaveValue('New description');
  });

  test('should call onCancel when Cancel is clicked', async () => {
    const { user, onCancel } = await renderForm();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  test('disables the organization lookup for a globally available ee', async () => {
    const { container } = await renderForm({
      executionEnvironment: globallyAvailableEE,
      isOrgLookupDisabled: true,
    });
    expect(
      container.querySelector('[data-ouia-component-id="organization-open"]')
    ).toBeDisabled();
  });

  test('allows reassigning the organization for a non-global ee', async () => {
    const { container } = await renderForm({ isOrgLookupDisabled: true });
    expect(
      container.querySelector('[data-ouia-component-id="organization-open"]')
    ).toBeEnabled();
  });

  test('disables every field except pull for a managed ee', async () => {
    const { container } = await renderForm({
      executionEnvironment: { ...executionEnvironment, managed: true },
    });
    expect(
      container.querySelector('#execution-environment-name')
    ).toBeDisabled();
    expect(
      container.querySelector('#execution-environment-image')
    ).toBeDisabled();
    expect(
      container.querySelector('#execution-environment-description')
    ).toBeDisabled();
    expect(
      container.querySelector('[data-ouia-component-id="credential-open"]')
    ).toBeDisabled();
    expect(
      container.querySelector('[data-ouia-component-id="organization-open"]')
    ).toBeDisabled();
    // the pull option stays editable
    expect(container.querySelector('#container-pull-options')).toBeEnabled();
  });
});
