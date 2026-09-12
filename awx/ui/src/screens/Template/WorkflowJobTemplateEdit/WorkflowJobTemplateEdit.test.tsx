import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import {
  WorkflowJobTemplatesAPI,
  OrganizationsAPI,
  LabelsAPI,
  UsersAPI,
  InventoriesAPI,
} from 'api';
import useDebounce from 'hooks/useDebounce';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowJobTemplateEdit from './WorkflowJobTemplateEdit';

vi.mock('../../../hooks/useDebounce');
vi.mock('../../../api/models/WorkflowJobTemplates');
vi.mock('../../../api/models/Organizations');
vi.mock('../../../api/models/Labels');
vi.mock('../../../api/models/Users');
vi.mock('../../../api/models/Inventories');

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
};

// Values the (stubbed) form submits when "Submit" is clicked. They mirror the
// user editing the name/description/scm_branch and selecting labels so the
// container's handleSubmit produces the update payload + label calls asserted.
const submittedValues = {
  name: 'Alex',
  description: 'Apollo and Athena',
  inventory: { id: 1 },
  organization: { id: 1 },
  scm_branch: 'main',
  limit: '5000',
  extra_vars: '---',
  webhook_credential: null,
  webhook_url: '',
  webhook_service: '',
  allow_simultaneous: false,
  ask_inventory_on_launch: false,
  ask_limit_on_launch: false,
  ask_scm_branch_on_launch: false,
  ask_variables_on_launch: false,
  ask_labels_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_tags_on_launch: false,
  job_tags: '',
  skip_tags: '',
  // original labels are [Label 1, Label 2]; submitting [Label 2, Label 3]
  // removes Label 1 and adds Label 3
  labels: [
    { name: 'Label 2', id: 2 },
    { name: 'Label 3', id: 3 },
  ],
};

// The form is exercised on its own in WorkflowJobTemplateForm.test.js; here we
// only care about the container's submit/cancel/error handling, so stub the form
// with controls that invoke its props. The values it submits are configurable
// per test via setSubmitValues (mock-prefixed so the vi.mock factory may close
// over it).
const mockFormState = { submitValues: null };
const setSubmitValues = (values: Untyped) => {
  mockFormState.submitValues = values;
};

vi.mock('../shared', () => ({
  WorkflowJobTemplateForm: function MockWorkflowJobTemplateForm({
    handleSubmit,
    handleCancel,
    submitError,
  }: Untyped) {
    return (
      <div>
        {submitError ? (
          <div data-testid="form-submit-error">{submitError.message}</div>
        ) : null}
        <button
          type="button"
          onClick={() => handleSubmit(mockFormState.submitValues)}
        >
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

describe('<WorkflowJobTemplateEdit/>', () => {
  let history: TestHistory;

  beforeEach(() => {
    setSubmitValues(submittedValues);
    vi.mocked(LabelsAPI.read).mockResolvedValue({
      data: {
        results: [
          { name: 'Label 1', id: 1 },
          { name: 'Label 2', id: 2 },
          { name: 'Label 3', id: 3 },
        ],
      },
    } as unknown as ResponseOf<typeof LabelsAPI.read>);

    vi.mocked(InventoriesAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof InventoriesAPI.read>);
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);

    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [{ id: 1, name: 'Default' }], count: 1 },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    vi.mocked(OrganizationsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    } as unknown as ResponseOf<typeof OrganizationsAPI.readOptions>);

    vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'Default' }] },
    } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);

    vi.mocked(useDebounce).mockImplementation((fn) => fn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderEdit = async (template: Untyped = mockTemplate) => {
    history = createMemoryHistory({
      initialEntries: ['/templates/workflow_job_template/6/edit'],
    });
    const result = renderWithContexts(
      <WorkflowJobTemplateEdit template={template} />,
      { context: { router: { history } } }
    );
    await screen.findByRole('button', { name: 'Submit' });
    return result;
  };

  test('renders successfully', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  test('api is called to properly to save the updated template.', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.update).toHaveBeenCalledWith(6, {
        name: 'Alex',
        description: 'Apollo and Athena',
        inventory: 1,
        organization: 1,
        scm_branch: 'main',
        limit: '5000',
        extra_vars: '---',
        webhook_credential: null,
        webhook_url: '',
        webhook_service: '',
        allow_simultaneous: false,
        ask_inventory_on_launch: false,
        ask_limit_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_variables_on_launch: false,
        ask_labels_on_launch: false,
        ask_skip_tags_on_launch: false,
        ask_tags_on_launch: false,
        job_tags: null,
        skip_tags: null,
      })
    );

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.disassociateLabel).toHaveBeenCalledWith(
        6,
        { name: 'Label 1', id: 1 }
      )
    );
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.associateLabel).toHaveBeenCalledTimes(1)
    );
  });

  test('handleCancel navigates the user to the /templates', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe(
      '/templates/workflow_job_template/6/details'
    );
  });

  test('throwing error renders FormSubmitError component', async () => {
    const error = {
      message: 'An error occurred',
      response: {
        config: {
          method: 'patch',
          url: '/api/v2/workflow_job_templates/',
        },
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(WorkflowJobTemplatesAPI.update).mockRejectedValue(error);
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.update).toHaveBeenCalled()
    );
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  test('system admin can edit a workflow without provide an org', async () => {
    const templateWithoutOrg = {
      id: 6,
      name: 'Foo',
      description: 'Foo description',
      summary_fields: {
        inventory: { id: 1, name: 'Inventory 1' },
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
    };

    // A system admin with org-admin rights gets the organization resolved to
    // their single admin org ({ id: 1 }) even though the template carries no
    // organization, so the update succeeds and navigates despite the failing
    // OrganizationsAPI.read.
    setSubmitValues({
      name: 'Foo',
      description: 'bar',
      inventory: { id: 1 },
      organization: { id: 1 },
      scm_branch: 'devel',
      limit: '5000',
      extra_vars: '---',
      webhook_credential: null,
      webhook_url: '',
      webhook_service: '',
      allow_simultaneous: false,
      ask_inventory_on_launch: false,
      ask_limit_on_launch: false,
      ask_scm_branch_on_launch: false,
      ask_variables_on_launch: false,
      ask_labels_on_launch: false,
      ask_skip_tags_on_launch: false,
      ask_tags_on_launch: false,
      job_tags: '',
      skip_tags: '',
      labels: [
        { name: 'Label 1', id: 1 },
        { name: 'Label 2', id: 2 },
      ],
    });

    vi.mocked(OrganizationsAPI.read).mockRejectedValue({
      response: {
        config: {
          method: 'get',
          url: '/api/v2/organizations/',
        },
        data: { detail: 'An error occurred' },
      },
    });
    vi.mocked(WorkflowJobTemplatesAPI.update).mockResolvedValue(
      undefined as unknown as ApiResponse<unknown>
    );

    const { user } = await renderEdit(templateWithoutOrg);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.update).toHaveBeenCalledWith(6, {
        allow_simultaneous: false,
        ask_inventory_on_launch: false,
        ask_labels_on_launch: false,
        ask_limit_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_skip_tags_on_launch: false,
        ask_tags_on_launch: false,
        ask_variables_on_launch: false,
        description: 'bar',
        extra_vars: '---',
        inventory: 1,
        job_tags: null,
        limit: '5000',
        name: 'Foo',
        organization: 1,
        scm_branch: 'devel',
        skip_tags: null,
        webhook_credential: null,
        webhook_service: '',
        webhook_url: '',
      })
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/templates/workflow_job_template/6/details'
      )
    );
  });
});
