import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI, ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilderForm from './ExecutionEnvironmentBuilderForm';

jest.mock('../../../api');

const executionEnvironmentBuilder = {
  id: 16,
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'v1',
  execution_environment_file: 'execution-environment.yml',
  summary_fields: {
    project: {
      id: 7,
      name: 'Demo Project',
    },
    credential: {
      id: 4,
      name: 'Container Registry',
      kind: 'registry',
    },
  },
};

const renderForm = async (props = {}) => {
  CredentialsAPI.read.mockResolvedValue({
    data: { results: [], count: 0 },
  });
  CredentialsAPI.readOptions.mockResolvedValue({
    data: { actions: { GET: {} }, related_search_fields: [] },
  });
  ProjectsAPI.read.mockResolvedValue({
    data: { results: [{ id: 7, name: 'Demo Project' }], count: 1 },
  });
  ProjectsAPI.readOptions.mockResolvedValue({
    data: { actions: { GET: {} }, related_search_fields: [] },
  });
  ProjectsAPI.readExecutionEnvironmentFiles.mockResolvedValue({
    data: ['execution-environment.yml'],
  });
  const onCancel = jest.fn();
  const onSubmit = jest.fn();
  const result = renderWithContexts(
    <ExecutionEnvironmentBuilderForm
      onCancel={onCancel}
      onSubmit={onSubmit}
      executionEnvironmentBuilder={executionEnvironmentBuilder}
      {...props}
    />
  );
  // wait for the form to finish loading
  await screen.findByRole('button', { name: 'Save' });
  return { ...result, onCancel, onSubmit };
};

describe('<ExecutionEnvironmentBuilderForm/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display form fields properly', async () => {
    const { container } = await renderForm();
    expect(container.querySelector('#eeb-name')).toBeInTheDocument();
    expect(container.querySelector('#eeb-image')).toBeInTheDocument();
    expect(container.querySelector('#eeb-tag')).toBeInTheDocument();
    expect(screen.getByText('Registry credential')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(
      screen.getByText('Execution environment file')
    ).toBeInTheDocument();
  });

  test('should call onSubmit when form submitted', async () => {
    const { user, onSubmit } = await renderForm();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('should update form values', async () => {
    const { user, container } = await renderForm();
    const nameField = container.querySelector('#eeb-name');
    await user.clear(nameField);
    await user.type(nameField, 'Updated Name');
    expect(nameField).toHaveValue('Updated Name');

    const imageField = container.querySelector('#eeb-image');
    await user.clear(imageField);
    await user.type(imageField, 'updated-image');
    expect(imageField).toHaveValue('updated-image');

    const tagField = container.querySelector('#eeb-tag');
    await user.clear(tagField);
    await user.type(tagField, 'v2');
    expect(tagField).toHaveValue('v2');
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const { user, onCancel } = await renderForm();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  test('should render with default values for new builder', async () => {
    const { container } = await renderForm({
      executionEnvironmentBuilder: undefined,
    });
    expect(container.querySelector('#eeb-name')).toHaveValue('');
    expect(container.querySelector('#eeb-tag')).toHaveValue('latest');
  });

  test('should show submit error when submitError prop is provided', async () => {
    const submitError = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    const { container } = await renderForm({ submitError });
    await waitFor(() =>
      expect(
        container.querySelector('[data-ouia-component-id="form-submit-error-alert"]')
      ).toBeInTheDocument()
    );
  });

  test('should populate credential from builder summary_fields', async () => {
    await renderForm();
    expect(screen.getByDisplayValue('Container Registry')).toBeInTheDocument();
  });
});
