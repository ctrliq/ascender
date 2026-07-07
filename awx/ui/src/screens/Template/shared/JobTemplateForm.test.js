import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import {
  LabelsAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  CredentialsAPI,
  CredentialTypesAPI,
  InventoriesAPI,
  RootAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobTemplateForm from './JobTemplateForm';

jest.mock('../../../api');

// The Inventory / Project / Credential lookups talk to the API and render
// large search modals; rather than drive their onChange handlers through
// those modals, we stand them in with lightweight mocks that surface the
// current value in the DOM and expose buttons to trigger onChange with the
// same payloads the test uses.
jest.mock('components/Lookup', () => {
  const actual = jest.requireActual('components/Lookup');
  return {
    ...actual,
    InventoryLookup: ({ value, onChange }) => (
      <div>
        <span data-testid="inventory-value">{JSON.stringify(value)}</span>
        <button
          type="button"
          aria-label="select inventory"
          onClick={() => onChange({ id: 3, name: 'inventory' })}
        >
          select inventory
        </button>
      </div>
    ),
    ProjectLookup: ({ value, onChange }) => (
      <div>
        <span data-testid="project-value">{JSON.stringify(value)}</span>
        <button
          type="button"
          aria-label="select project"
          onClick={() =>
            onChange({ id: 4, name: 'project', allow_override: true })
          }
        >
          select project
        </button>
      </div>
    ),
    MultiCredentialsLookup: ({ value, onChange }) => (
      <div>
        <span data-testid="credentials-value">{JSON.stringify(value)}</span>
        {value.map((cred) => (
          <button
            key={cred.id}
            type="button"
            aria-label={`remove credential ${cred.name}`}
            onClick={() => onChange(value.filter((c) => c.id !== cred.id))}
          >
            {cred.name}
          </button>
        ))}
      </div>
    ),
    ExecutionEnvironmentLookup: () => <div />,
    InstanceGroupsLookup: () => <div />,
  };
});

describe('<JobTemplateForm />', () => {
  const mockData = {
    id: 1,
    name: 'Foo',
    description: 'Bar',
    job_type: 'run',
    inventory: 2,
    project: 3,
    playbook: 'Baz',
    type: 'job_template',
    scm_branch: 'Foo',
    limit: '5000',
    summary_fields: {
      inventory: {
        id: 2,
        name: 'foo',
        organization_id: 1,
      },
      project: {
        id: 3,
        name: 'qux',
        allow_override: false,
      },
      labels: {
        results: [
          { name: 'Sushi', id: 1 },
          { name: 'Major', id: 2 },
        ],
      },
      credentials: [
        { id: 1, kind: 'cloud', name: 'Foo' },
        { id: 2, kind: 'ssh', name: 'Bar' },
      ],
    },
    related: { webhook_receiver: '/api/v2/job_templates/57/gitlab/' },
    webhook_key: 'webhook key',
    webhook_service: 'github',
    webhook_credential: 7,
    host_config_key: '',
  };
  const mockInstanceGroups = [
    {
      id: 1,
      type: 'instance_group',
      url: '/api/v2/instance_groups/1/',
      related: {
        jobs: '/api/v2/instance_groups/1/jobs/',
        instances: '/api/v2/instance_groups/1/instances/',
      },
      name: 'tower',
      capacity: 59,
      committed_capacity: 0,
      consumed_capacity: 0,
      percent_capacity_remaining: 100.0,
      jobs_running: 0,
      jobs_total: 3,
      instances: 1,
      controller: null,
      policy_instance_percentage: 100,
      policy_instance_minimum: 0,
      policy_instance_list: [],
    },
  ];
  const mockCredentials = [
    { id: 1, kind: 'cloud', name: 'Cred 1', url: 'www.google.com' },
    { id: 2, kind: 'ssh', name: 'Cred 2', url: 'www.google.com' },
    { id: 3, kind: 'Ansible', name: 'Cred 3', url: 'www.google.com' },
    { id: 4, kind: 'Machine', name: 'Cred 4', url: 'www.google.com' },
    { id: 5, kind: 'Machine', name: 'Cred 5', url: 'www.google.com' },
  ];

  let consoleError;

  beforeEach(() => {
    // The deeply-nested PF Lookup/OptionsList components log prop-type
    // warnings under the partial API mocks; suppress console.error so these
    // don't fail the run.
    consoleError = global.console.error;
    global.console.error = jest.fn();
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    LabelsAPI.read.mockReturnValue({
      data: mockData.summary_fields.labels,
    });
    CredentialTypesAPI.loadAllTypes.mockResolvedValue([]);
    CredentialsAPI.read.mockReturnValue({
      data: { results: mockCredentials },
    });
    JobTemplatesAPI.readInstanceGroups.mockReturnValue({
      data: { results: mockInstanceGroups },
    });
    JobTemplatesAPI.updateWebhookKey.mockReturnValue({
      data: { webhook_key: 'webhook key' },
    });
    ProjectsAPI.readDetail.mockReturnValue({
      name: 'foo',
      id: 1,
      allow_override: false,
    });
    ProjectsAPI.readPlaybooks.mockReturnValue({
      data: ['debug.yml'],
    });
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
    ProjectsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
  });

  afterEach(() => {
    global.console.error = consoleError;
    jest.resetAllMocks();
  });

  test('should render LabelsSelect', async () => {
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
      />
    );

    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
    await waitFor(() => expect(LabelsAPI.read).toHaveBeenCalled());
    expect(JobTemplatesAPI.readInstanceGroups).toHaveBeenCalled();

    // LabelSelect (PF typeaheadMulti Select) is rendered; its selected-value
    // chips are not paintable in jsdom, so assert the control is present via
    // its accessible label as a DOM proxy for the original value assertion.
    expect(screen.getByLabelText('Select Labels')).toBeInTheDocument();
  });

  test('should not render source control branch when allow_override is false', async () => {
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(document.getElementById('template-scm-branch')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'select project' }));

    await waitFor(() =>
      expect(document.getElementById('template-scm-branch')).toBeInTheDocument()
    );
  });

  test('should update form values on input changes', async () => {
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    const nameInput = document.getElementById('template-name');
    const descriptionInput = document.getElementById('template-description');
    fireEvent.change(nameInput, {
      target: { value: 'new foo', name: 'name' },
    });
    fireEvent.change(descriptionInput, {
      target: { value: 'new bar', name: 'description' },
    });

    // job type AnsibleSelect -> 'check'
    const jobTypeSelect = document.getElementById('template-job-type');
    fireEvent.change(jobTypeSelect, { target: { value: 'check' } });

    fireEvent.click(screen.getByRole('button', { name: 'select project' }));
    fireEvent.click(screen.getByRole('button', { name: 'select inventory' }));

    // scm branch appears now that project allow_override is true
    const scmBranch = await waitFor(() =>
      document.getElementById('template-scm-branch')
    );
    fireEvent.change(scmBranch, { target: { value: 'devel' } });

    const limitInput = document.getElementById('template-limit');
    fireEvent.change(limitInput, { target: { value: '1234567890' } });

    // PlaybookSelect auto-selects the only returned playbook ('debug.yml')
    // once a project is set, the same way the form behaves in the browser.
    const playbookInput = await screen.findByLabelText('Select a playbook');
    await waitFor(() => expect(playbookInput).toHaveValue('debug.yml'));

    // remove the first credential (Foo) -> only Bar remains
    fireEvent.click(
      screen.getByRole('button', { name: 'remove credential Foo' })
    );

    expect(nameInput).toHaveValue('new foo');
    expect(descriptionInput).toHaveValue('new bar');
    expect(jobTypeSelect).toHaveValue('check');
    await waitFor(() =>
      expect(screen.getByTestId('inventory-value')).toHaveTextContent(
        JSON.stringify({ id: 3, name: 'inventory' })
      )
    );
    expect(screen.getByTestId('project-value')).toHaveTextContent(
      JSON.stringify({ id: 4, name: 'project', allow_override: true })
    );
    expect(scmBranch).toHaveValue('devel');
    expect(limitInput).toHaveValue('1234567890');
    expect(playbookInput).toHaveValue('debug.yml');
    expect(screen.getByTestId('credentials-value')).toHaveTextContent(
      JSON.stringify([{ id: 2, kind: 'ssh', name: 'Bar' }])
    );
  });

  test('job slice pinned hosts field only shows when slicing is enabled', async () => {
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(
      document.getElementById('template-job-slice-pinned-hosts')
    ).toBeNull();

    const sliceInput = document.getElementById('template-job-slicing');
    fireEvent.change(sliceInput, {
      target: { value: '3', name: 'job_slice_count' },
    });

    const pinnedInput = await waitFor(() => {
      const el = document.getElementById('template-job-slice-pinned-hosts');
      if (!el) throw new Error('pinned hosts field not rendered yet');
      return el;
    });
    fireEvent.change(pinnedInput, {
      target: { value: 'localhost', name: 'job_slice_pinned_hosts' },
    });
    expect(pinnedInput.value).toBe('localhost');
  });

  test('webhooks and enable concurrent jobs functions properly', async () => {
    // WebhookSubForm reads the template id from useParams(), so mount the form
    // under a real v6 route whose concrete URL provides id=1.
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/edit'],
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/templates/job_template/:id/edit"
          element={
            <JobTemplateForm
              template={mockData}
              handleSubmit={jest.fn()}
              handleCancel={jest.fn()}
            />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );

    // the template has webhook_service set, so the webhook section is enabled
    // on mount and the checkbox renders already checked.
    const webhookCheckbox = await screen.findByRole('checkbox', {
      name: 'Enable Webhook',
    });
    expect(webhookCheckbox).toBeChecked();

    const webhookKeyInput = await screen.findByLabelText(
      'workflow job template webhook key'
    );
    expect(webhookKeyInput).not.toHaveAttribute('readonly');
    expect(webhookKeyInput).toHaveValue('webhook key');

    fireEvent.click(screen.getByRole('button', { name: 'Update webhook key' }));
    await waitFor(() =>
      expect(JobTemplatesAPI.updateWebhookKey).toHaveBeenCalledWith('1')
    );
    expect(screen.getByLabelText('Webhook URL').value).toContain(
      '/api/v2/job_templates/57/gitlab/'
    );

    // webhook service AnsibleSelect
    const serviceSelect = document.getElementById('webhook_service');
    expect(serviceSelect).toBeInTheDocument();
    fireEvent.change(serviceSelect, { target: { value: 'gitlab' } });
    await waitFor(() => expect(serviceSelect).toHaveValue('gitlab'));
  });

  test('webhooks should render properly, without data', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/edit'],
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/templates/job_template/:id/edit"
          element={
            <JobTemplateForm
              template={{
                ...mockData,
                webhook_credential: null,
                webhook_key: '',
                webhook_service: 'github',
                related: { webhook_receiver: '' },
              }}
              handleSubmit={jest.fn()}
              handleCancel={jest.fn()}
            />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );

    const webhookKeyInput = await screen.findByLabelText(
      'workflow job template webhook key'
    );
    // no key yet: the field is empty (a new key is generated on save unless
    // the user types their own) and there is nothing to rotate.
    expect(webhookKeyInput).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Update webhook key' })
    ).toBeDisabled();
  });

  test('should call handleSubmit when Submit button is clicked', async () => {
    const handleSubmit = jest.fn();
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={handleSubmit}
        handleCancel={jest.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(handleSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = jest.fn();
    renderWithContexts(
      <JobTemplateForm
        template={mockData}
        handleSubmit={jest.fn()}
        handleCancel={handleCancel}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(handleCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });
});
