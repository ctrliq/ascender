import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import {
  WorkflowJobTemplatesAPI,
  LabelsAPI,
  OrganizationsAPI,
  InventoriesAPI,
  ProjectsAPI,
  CredentialTypesAPI,
  ExecutionEnvironmentsAPI,
  CredentialsAPI,
} from 'api';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowJobTemplateForm from './WorkflowJobTemplateForm';

jest.mock('../../../api/models/ExecutionEnvironments');
jest.mock('../../../api/models/WorkflowJobTemplates');
jest.mock('../../../api/models/Labels');
jest.mock('../../../api/models/Organizations');
jest.mock('../../../api/models/Inventories');
jest.mock('../../../api/models/Projects');
jest.mock('../../../api/models/CredentialTypes');
jest.mock('../../../api/models/Credentials');

describe('<WorkflowJobTemplateForm/>', () => {
  let history;
  const handleSubmit = jest.fn();
  const handleCancel = jest.fn();
  let consoleError;
  const mockTemplate = {
    id: 6,
    name: 'Foo',
    description: 'Foo description',
    summary_fields: {
      inventory: { id: 1, name: 'Inventory 1' },
      organization: { id: 1, name: 'Organization 1' },
      labels: {
        results: [
          { name: 'Label 1', id: 1 },
          { name: 'Label 2', id: 2 },
        ],
      },
    },
    scm_branch: 'devel',
    limit: '5000',
    variables: '---',
    related: {
      webhook_receiver: '/api/v2/workflow_job_templates/57/gitlab/',
    },
    webhook_credential: null,
    webhook_key: 'sdfghjklmnbvcdsew435678iokjhgfd',
    webhook_service: 'github',
  };

  // WebhookSubForm reads the template id from useParams(), so mount the form
  // under a real v6 route whose concrete URL (set on history below) provides
  // id=6.
  const renderForm = (props = {}) =>
    renderWithContexts(
      <Routes>
        <Route
          path="/templates/workflow_job_template/:id/edit"
          element={
            <WorkflowJobTemplateForm
              template={mockTemplate}
              handleCancel={handleCancel}
              handleSubmit={handleSubmit}
              {...props}
            />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );

  beforeEach(async () => {
    // The VariablesField CodeEditor and deeply-nested PF Lookup components log
    // warnings under the partial API mocks; silence console.error so they
    // don't fail the run.
    consoleError = global.console.error;
    global.console.error = jest.fn();
    WorkflowJobTemplatesAPI.updateWebhookKey.mockResolvedValue({
      data: { webhook_key: 'sdafdghjkl2345678ionbvcxz' },
    });
    LabelsAPI.read.mockResolvedValue({
      data: {
        results: [
          { name: 'Label 1', id: 1 },
          { name: 'Label 2', id: 2 },
          { name: 'Label 3', id: 3 },
        ],
        count: 3,
      },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Organization 1' },
          { id: 2, name: 'Organization 2' },
        ],
        count: 2,
      },
    });
    InventoriesAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Foo' },
          { id: 2, name: 'Bar' },
        ],
        count: 2,
      },
    });
    CredentialTypesAPI.read.mockResolvedValue({
      data: { results: [{ id: 1 }], count: 1 },
    });
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
    ProjectsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });

    history = createMemoryHistory({
      initialEntries: ['/templates/workflow_job_template/6/edit'],
    });
    renderForm();
    await screen.findByRole('button', { name: 'Save' });
  });

  afterEach(() => {
    global.console.error = consoleError;
    jest.clearAllMocks();
  });

  test('renders successfully', () => {
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('organization is a required field for organization admins', async () => {
    renderForm({ isOrgAdmin: true });
    await screen.findAllByRole('button', { name: 'Save' });

    // OrganizationLookup is required -> its FormGroup label carries the
    // PF required marker.
    const orgLabels = screen.getAllByText('Organization');
    const orgFormGroup = orgLabels[orgLabels.length - 1].closest(
      '.pf-v6-c-form__group'
    );
    expect(
      orgFormGroup.querySelector('.pf-v6-c-form__label-required')
    ).toBeInTheDocument();
  });

  test('all the fields render successfully', () => {
    expect(document.getElementById('wfjt-name')).toBeInTheDocument();
    expect(document.getElementById('wfjt-description')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText('Limit')).toBeInTheDocument();
    expect(screen.getByText('Source control branch')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Skip Tags')).toBeInTheDocument();
    expect(screen.getByText('Job Tags')).toBeInTheDocument();
    // VariablesField renders the Variables label
    expect(screen.getByText('Variables')).toBeInTheDocument();

    // Organization is not required when not an org admin
    const orgFormGroup = screen
      .getByText('Organization')
      .closest('.pf-v6-c-form__group');
    expect(
      orgFormGroup.querySelector('.pf-v6-c-form__label-required')
    ).not.toBeInTheDocument();
  });

  test('changing inputs should update values', async () => {
    const nameInput = document.getElementById('wfjt-name');
    const descriptionInput = document.getElementById('wfjt-description');

    fireEvent.change(nameInput, {
      target: { value: 'new foo', name: 'name' },
    });
    fireEvent.change(descriptionInput, {
      target: { value: 'new bar', name: 'description' },
    });

    await waitFor(() => expect(nameInput).toHaveValue('new foo'));
    expect(descriptionInput).toHaveValue('new bar');
  });

  test('test changes in FieldWithPrompt', async () => {
    const scmBranch = document.getElementById('wfjt-scm-branch');
    const limit = document.getElementById('wfjt-limit');

    fireEvent.change(scmBranch, { target: { value: 'main' } });
    fireEvent.change(limit, { target: { value: '1234567890' } });

    await waitFor(() => expect(scmBranch).toHaveValue('main'));
    expect(limit).toHaveValue('1234567890');
  });

  test('webhooks and enable concurrent jobs functions properly', async () => {
    // template has webhook_service set, so the webhook section is enabled on
    // mount and the checkbox renders already checked.
    const webhookCheckbox = screen.getByRole('checkbox', {
      name: 'Enable Webhook',
    });
    expect(webhookCheckbox).toBeChecked();

    const webhookKeyInput = await screen.findByLabelText(
      'workflow job template webhook key'
    );
    expect(webhookKeyInput).not.toHaveAttribute('readonly');
    expect(webhookKeyInput).toHaveValue('sdfghjklmnbvcdsew435678iokjhgfd');

    fireEvent.click(screen.getByRole('button', { name: 'Update webhook key' }));
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.updateWebhookKey).toHaveBeenCalledWith('6')
    );
    expect(screen.getByLabelText('Webhook URL').value).toContain(
      '/api/v2/workflow_job_templates/57/gitlab/'
    );

    const serviceSelect = document.getElementById('webhook_service');
    expect(serviceSelect).toBeInTheDocument();
    fireEvent.change(serviceSelect, { target: { value: 'gitlab' } });
    await waitFor(() => expect(serviceSelect).toHaveValue('gitlab'));
  });

  test('handleSubmit is called on submit button click', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('handleCancel is called on cancel button click', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });

  test('should not show inventory field as required', () => {
    // InventoryLookup receives required=false -> no PF required marker in the
    // inventory FormGroup.
    const inventoryFormGroup = screen
      .getByText('Inventory')
      .closest('.pf-v6-c-form__group');
    expect(
      within(inventoryFormGroup).queryByText('*')
    ).not.toBeInTheDocument();
  });
});
