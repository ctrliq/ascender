import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import {
  WorkflowJobTemplatesAPI,
  OrganizationsAPI,
  LabelsAPI,
  UsersAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowJobTemplateAdd from './WorkflowJobTemplateAdd';

jest.mock('../../../api');

// Values the (stubbed) form submits. They mirror the form's initialValues for a
// brand new template plus the user typing a name and selecting one label, so the
// container's handleSubmit produces the create payload asserted below.
const submittedValues = {
  name: 'Alex Singh',
  description: '',
  allow_simultaneous: false,
  ask_inventory_on_launch: false,
  ask_labels_on_launch: false,
  ask_limit_on_launch: false,
  ask_scm_branch_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_tags_on_launch: false,
  ask_variables_on_launch: false,
  extra_vars: '---',
  webhook_service: '',
  webhook_url: '',
  labels: [{ name: 'Label 3', id: 3 }],
  inventory: null,
  organization: null,
  webhook_credential: null,
  limit: '',
  job_tags: '',
  skip_tags: '',
  scm_branch: '',
};

// The form is exercised on its own in WorkflowJobTemplateForm.test.js; here we
// only care about the container's submit/cancel/error handling, so stub the form
// with controls that invoke its props.
jest.mock('../shared/WorkflowJobTemplateForm', () =>
  function MockWorkflowJobTemplateForm({
    handleSubmit,
    handleCancel,
    submitError,
  }) {
    return (
      <div>
        {submitError ? (
          <div data-testid="form-submit-error">{submitError.message}</div>
        ) : null}
        <button type="button" onClick={() => handleSubmit(submittedValues)}>
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<WorkflowJobTemplateAdd/>', () => {
  let history;

  beforeEach(() => {
    WorkflowJobTemplatesAPI.create.mockResolvedValue({ data: { id: 1 } });
    OrganizationsAPI.read.mockResolvedValue({ data: { results: [{ id: 1 }] } });
    LabelsAPI.read.mockResolvedValue({
      data: {
        results: [
          { name: 'Label 1', id: 1 },
          { name: 'Label 2', id: 2 },
          { name: 'Label 3', id: 3 },
        ],
      },
    });
    UsersAPI.readAdminOfOrganizations.mockResolvedValue({
      data: { count: 0, results: [] },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const renderAdd = async () => {
    history = createMemoryHistory({
      initialEntries: ['/templates/workflow_job_template/add'],
    });
    const result = renderWithContexts(<WorkflowJobTemplateAdd />, {
      context: { router: { history } },
    });
    // wait for the user-role fetch to resolve and the form (stub) to render
    await screen.findByRole('button', { name: 'Submit' });
    return result;
  };

  test('initially renders successfully', async () => {
    await renderAdd();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  test('calls workflowJobTemplatesAPI with correct information on submit', async () => {
    const { user } = await renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.create).toHaveBeenCalledWith({
        name: 'Alex Singh',
        allow_simultaneous: false,
        ask_inventory_on_launch: false,
        ask_labels_on_launch: false,
        ask_limit_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_skip_tags_on_launch: false,
        ask_tags_on_launch: false,
        ask_variables_on_launch: false,
        description: '',
        extra_vars: '---',
        inventory: undefined,
        job_tags: null,
        limit: null,
        organization: undefined,
        scm_branch: null,
        skip_tags: null,
        webhook_credential: undefined,
        webhook_service: '',
        webhook_url: '',
      })
    );

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.associateLabel).toHaveBeenCalledTimes(1)
    );
  });

  test('handleCancel navigates the user to the /templates', async () => {
    const { user } = await renderAdd();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe('/templates');
  });

  test('throwing error renders FormSubmitError component', async () => {
    const error = {
      message: 'An error occurred',
      response: {
        config: {
          method: 'post',
          url: '/api/v2/workflow_job_templates/',
        },
        data: { detail: 'An error occurred' },
      },
    };

    WorkflowJobTemplatesAPI.create.mockRejectedValue(error);
    const { user } = await renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(WorkflowJobTemplatesAPI.create).toHaveBeenCalled();
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });

  test('throwing error prevents navigation away from form', async () => {
    OrganizationsAPI.read.mockRejectedValue({
      response: {
        config: {
          method: 'get',
          url: '/api/v2/organizations/',
        },
        data: 'An error occurred',
      },
    });
    WorkflowJobTemplatesAPI.update.mockResolvedValue();

    const { user } = await renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      await screen.findByRole('button', { name: 'Submit' })
    ).toBeInTheDocument();
    await waitFor(() => expect(OrganizationsAPI.read).toHaveBeenCalled());
    expect(history.location.pathname).toBe(
      '/templates/workflow_job_template/add'
    );
  });
});
