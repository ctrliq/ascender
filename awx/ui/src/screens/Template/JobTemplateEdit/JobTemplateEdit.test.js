import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import { JobTemplatesAPI, ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobTemplateEdit from './JobTemplateEdit';

jest.mock('../../../api');

const mockJobTemplate = {
  allow_callbacks: false,
  allow_simultaneous: false,
  ask_scm_branch_on_launch: false,
  ask_diff_mode_on_launch: false,
  ask_execution_environment_on_launch: false,
  ask_forks_on_launch: false,
  ask_instance_groups_on_launch: false,
  ask_variables_on_launch: false,
  ask_limit_on_launch: false,
  ask_tags_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_job_type_on_launch: false,
  ask_labels_on_launch: false,
  ask_verbosity_on_launch: false,
  ask_inventory_on_launch: false,
  ask_job_slice_count_on_launch: false,
  ask_credential_on_launch: false,
  ask_timeout_on_launch: false,
  become_enabled: false,
  description: 'Bar',
  diff_mode: false,
  extra_vars: '---',
  forks: 0,
  host_config_key: '1234',
  id: 1,
  inventory: 2,
  job_slice_count: 1,
  job_tags: '',
  job_type: 'run',
  limit: '',
  name: 'Foo',
  playbook: 'Baz',
  prevent_instance_group_fallback: false,
  project: 3,
  scm_branch: '',
  skip_tags: '',
  summary_fields: {
    execution_environment: {
      id: 1,
      name: 'Default EE',
      description: '',
      image: 'quay.io/ansible/awx-ee',
    },
    user_capabilities: {
      edit: true,
    },
    labels: {
      results: [
        { name: 'Sushi', id: 1 },
        { name: 'Major', id: 2 },
      ],
    },
    inventory: {
      id: 2,
      name: 'Demo Inventory',
      organization_id: 1,
    },
    credentials: [
      { id: 1, kind: 'cloud', name: 'Foo' },
      { id: 2, kind: 'ssh', name: 'Bar' },
    ],
    project: {
      id: 3,
      name: 'Boo',
    },
  },
  timeout: 0,
  type: 'job_template',
  use_fact_cache: false,
  verbosity: '0',
  webhook_credential: null,
  webhook_key: 'webhook Key',
  webhook_service: 'gitlab',
  related: {
    webhook_receiver: '/api/v2/workflow_job_templates/57/gitlab/',
  },
  execution_environment: 1,
};

// The form has its own suite (JobTemplateForm.test.js); stub it so we can drive
// the container's submit/cancel + value-transformation logic directly. The
// Save button mirrors a post-edit form state: changed name/job_type, inventory,
// cleared execution environment, and a new set of labels. (Names are mock-
// prefixed so jest's out-of-scope guard allows them inside the mock factory.)
const mockUpdatedLabels = [
  { id: 3, name: 'Foo' },
  { id: 4, name: 'Bar' },
  { id: 5, name: 'Maple' },
  { id: 6, name: 'Tree' },
];
// The values object the real form would hand to onSubmit: scalar template
// fields (no id/type/related/summary_fields/webhook_key) plus the object-valued
// lookups the container unwraps, plus the edits made in the form.
const mockBuildSubmitValues = () => {
  const {
    id,
    type,
    related,
    summary_fields,
    webhook_key,
    ...scalarFields
  } = mockJobTemplate;
  return {
    ...scalarFields,
    name: 'new name',
    job_type: 'check',
    inventory: { id: 1, name: 'Other Inventory' },
    project: { id: 3, name: 'Boo' },
    execution_environment: '',
    webhook_credential: null,
    labels: mockUpdatedLabels,
    instanceGroups: [],
    initialInstanceGroups: [],
    credentials: mockJobTemplate.summary_fields.credentials,
  };
};
const mockFormProps = { current: undefined };
jest.mock('../shared/JobTemplateForm', () =>
  function MockJobTemplateForm(props) {
    mockFormProps.current = props;
    const { handleSubmit, handleCancel } = props;
    return (
      <div>
        <button
          type="button"
          aria-label="Save"
          onClick={() => handleSubmit(mockBuildSubmitValues())}
        >
          Save
        </button>
        <button type="button" aria-label="Cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<JobTemplateEdit />', () => {
  beforeEach(() => {
    ProjectsAPI.readDetail.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.resetAllMocks();
    mockFormProps.current = undefined;
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<JobTemplateEdit template={mockJobTemplate} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    );
    // container hands the template through to the form
    expect(mockFormProps.current.template).toEqual(mockJobTemplate);
  });

  test('handleSubmit should call api update', async () => {
    JobTemplatesAPI.update.mockResolvedValue({ data: {} });
    JobTemplatesAPI.orderInstanceGroups.mockResolvedValue({});
    JobTemplatesAPI.disassociateLabel.mockResolvedValue({});
    JobTemplatesAPI.associateLabel.mockResolvedValue({});
    JobTemplatesAPI.disassociateCredentials.mockResolvedValue({});
    JobTemplatesAPI.associateCredentials.mockResolvedValue({});

    const { user } = renderWithContexts(
      <JobTemplateEdit template={mockJobTemplate} reloadTemplate={jest.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const expected = {
      ...mockJobTemplate,
      job_type: 'check',
      name: 'new name',
      inventory: 1,
      project: 3,
      execution_environment: null,
    };
    delete expected.summary_fields;
    delete expected.id;
    delete expected.type;
    delete expected.related;
    delete expected.webhook_key;
    delete expected.webhook_url;
    delete expected.webhook_credential;

    await waitFor(() =>
      expect(JobTemplatesAPI.update).toHaveBeenCalledWith(1, {
        ...expected,
        webhook_credential: null,
      })
    );
    expect(JobTemplatesAPI.disassociateLabel).toHaveBeenCalledTimes(2);
    expect(JobTemplatesAPI.associateLabel).toHaveBeenCalledTimes(4);
  });

  test('should navigate to job template detail when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(
      <JobTemplateEdit template={mockJobTemplate} />,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancel' })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/templates/job_template/1/details'
    );
  });
});
