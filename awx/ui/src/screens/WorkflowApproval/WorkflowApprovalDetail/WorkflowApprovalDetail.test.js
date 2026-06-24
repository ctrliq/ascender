import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkflowApprovalsAPI, WorkflowJobsAPI } from 'api';
import { formatDateString } from 'util/dates';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import WorkflowApprovalDetail from './WorkflowApprovalDetail';
import mockWorkflowApprovals from '../data.workflowApprovals.json';

const workflowApproval = mockWorkflowApprovals.results[0];

jest.mock('../../../api');
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 218,
  }),
}));

jest.mock('@lingui/react/macro', () => ({
  ...jest.requireActual('@lingui/react/macro'),
  useLingui: () => ({
    t: (template, values) => {
      // Handle template literals properly
      if (typeof template === 'string') {
        return template;
      }
      if (Array.isArray(template)) {
        // Template literal: t`Never` becomes template = ['Never'], values = undefined
        return template[0] || '';
      }
      return String(template) || '';
    },
  }),
}));

// react-ace does not render its value into the DOM under jsdom, so surface the
// value VariablesDetail receives as plain text to keep the original assertion.
jest.mock('components/CodeEditor', () => ({
  ...jest.requireActual('components/CodeEditor'),
  VariablesDetail: ({ label, value }) => (
    <div>
      <div>{label}</div>
      <div data-testid="variables-detail-value">{value}</div>
    </div>
  ),
}));

jest.mock('../shared/WorkflowApprovalUtils', () => ({
  ...jest.requireActual('../shared/WorkflowApprovalUtils'),
  getDetailPendingLabel: (workflowApproval, t) => {
    if (!workflowApproval.approval_expiration) {
      return 'Never';
    }
    return jest
      .requireActual('util/dates')
      .formatDateString(workflowApproval.approval_expiration);
  },
  getStatus: (workflowApproval) => {
    if (workflowApproval.status === 'successful') {
      return 'approved';
    }
    return workflowApproval.status;
  },
}));

const workflowJob = {
  id: 111,
  type: 'workflow_job',
  url: '/api/v2/workflow_jobs/111/',
  related: {
    created_by: '/api/v2/users/1/',
    modified_by: '/api/v2/users/1/',
    unified_job_template: '/api/v2/workflow_job_templates/8/',
    workflow_job_template: '/api/v2/workflow_job_templates/8/',
    notifications: '/api/v2/workflow_jobs/111/notifications/',
    workflow_nodes: '/api/v2/workflow_jobs/111/workflow_nodes/',
    labels: '/api/v2/workflow_jobs/111/labels/',
    activity_stream: '/api/v2/workflow_jobs/111/activity_stream/',
    relaunch: '/api/v2/workflow_jobs/111/relaunch/',
    cancel: '/api/v2/workflow_jobs/111/cancel/',
  },
  summary_fields: {
    inventory: {
      id: 1,
      name: 'Demo Inventory',
      description: '',
      has_active_failures: false,
      total_hosts: 2,
      hosts_with_active_failures: 0,
      total_groups: 0,
      has_inventory_sources: false,
      total_inventory_sources: 0,
      inventory_sources_with_failures: 0,
      organization_id: 1,
      kind: '',
    },
    workflow_job_template: {
      id: 8,
      name: '00',
      description: '',
    },
    unified_job_template: {
      id: 8,
      name: '00',
      description: '',
      unified_job_type: 'workflow_job',
    },
    created_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
    modified_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
    user_capabilities: {
      delete: true,
      start: true,
    },
    labels: {
      count: 1,
      results: [
        {
          id: 2,
          name: 'Test2',
        },
      ],
    },
  },
  created: '2022-05-10T15:26:45.730965Z',
  modified: '2022-05-10T15:26:46.150107Z',
  name: '00',
  description: '',
  unified_job_template: 8,
  launch_type: 'manual',
  status: 'successful',
  failed: false,
  started: '2022-05-10T15:26:46.149825Z',
  finished: '2022-05-10T17:29:52.978531Z',
  canceled_on: null,
  elapsed: 7386.829,
  job_args: '',
  job_cwd: '',
  job_env: {},
  job_explanation: '',
  result_traceback: '',
  launched_by: {
    id: 1,
    name: 'admin',
    type: 'user',
    url: '/api/v2/users/1/',
  },
  work_unit_id: null,
  workflow_job_template: 8,
  extra_vars: '{"foo": "bar", "baz": "qux", "first_one": 10}',
  allow_simultaneous: true,
  job_template: null,
  is_sliced_job: false,
  inventory: 1,
  limit: 'localhost',
  scm_branch: 'main',
  webhook_service: '',
  webhook_credential: null,
  webhook_guid: '',
};

async function renderDetail(approval, props = {}) {
  const utils = renderWithContexts(
    <WorkflowApprovalDetail workflowApproval={approval} {...props} />
  );
  // wait for the workflow job fetch to resolve and the card body to render
  await screen.findByText('Workflow job details');
  return utils;
}


describe('<WorkflowApprovalDetail />', () => {
  beforeEach(() => {
    WorkflowJobsAPI.readDetail.mockResolvedValue({ data: workflowJob });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render Details', async () => {
    await renderDetail(workflowApproval);

    assertDetail('Name', workflowApproval.name);
    assertDetail('Description', workflowApproval.description);
    assertDetail('Expires', 'Never');
    assertDetail(
      'Workflow Job',
      `${workflowApproval.summary_fields.workflow_job.id} - ${workflowApproval.summary_fields.workflow_job.name}`
    );
    assertDetail(
      'Workflow Job Template',
      workflowApproval.summary_fields.workflow_job_template.name
    );

    const createdLabel = screen.getByText('Created');
    expect(createdLabel.nextElementSibling).toHaveTextContent(
      formatDateString('2020-10-09T17:13:12.067947Z')
    );
    expect(createdLabel.nextElementSibling).toHaveTextContent('admin');

    assertDetail('Last Modified', formatDateString(workflowApproval.modified));
    assertDetail('Elapsed', '00:00:22');
    assertDetail('Limit', 'localhost');
    assertDetail('Source Control Branch', 'main');

    const inventoryLabel = screen.getByText('Inventory');
    const inventoryLink = within(inventoryLabel.nextElementSibling).getByRole(
      'link'
    );
    expect(inventoryLink).toHaveAttribute(
      'href',
      '/inventories/inventory/1/details'
    );

    assertDetail('Labels', 'Test2');

    expect(screen.getByTestId('variables-detail-value')).toHaveTextContent(
      '{"foo": "bar", "baz": "qux", "first_one": 10}'
    );
  });

  test('should show expiration date/time', async () => {
    await renderDetail({
      ...workflowApproval,
      approval_expiration: '2020-10-10T17:13:12.067947Z',
    });
    assertDetail('Expires', formatDateString('2020-10-10T17:13:12.067947Z'));
  });

  test('should show finished date/time', async () => {
    await renderDetail({
      ...workflowApproval,
      finished: '2020-10-10T17:13:12.067947Z',
    });
    assertDetail('Finished', formatDateString('2020-10-10T17:13:12.067947Z'));
  });

  test('should show canceled date/time', async () => {
    await renderDetail({
      ...workflowApproval,
      canceled_on: '2020-10-10T17:13:12.067947Z',
    });
    assertDetail('Canceled', formatDateString('2020-10-10T17:13:12.067947Z'));
  });

  test('should show explanation', async () => {
    await renderDetail({
      ...workflowApproval,
      job_explanation: 'Some explanation text',
    });
    assertDetail('Explanation', 'Some explanation text');
  });

  test('should show status when not pending', async () => {
    await renderDetail({
      ...workflowApproval,
      status: 'successful',
      summary_fields: {
        ...workflowApproval.summary_fields,
        approved_or_denied_by: {
          id: 1,
          username: 'Foobar',
        },
      },
    });
    const statusLabel = screen.getByText('Status');
    expect(statusLabel.nextElementSibling).toHaveTextContent('Approved');
  });

  test('should show actor when available', async () => {
    await renderDetail({
      ...workflowApproval,
      summary_fields: {
        ...workflowApproval.summary_fields,
        approved_or_denied_by: {
          id: 1,
          username: 'Foobar',
        },
      },
    });
    assertDetail('Actor', 'Foobar');
  });

  test('action buttons should be hidden when user cannot approve or deny', async () => {
    await renderDetail({
      ...workflowApproval,
      can_approve_or_deny: false,
    });
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deny' })
    ).not.toBeInTheDocument();
  });

  test('only the delete button should render when approval is not pending', async () => {
    await renderDetail({
      ...workflowApproval,
      can_approve_or_deny: true,
      status: 'successful',
    });
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should not load Labels', async () => {
    WorkflowJobsAPI.readDetail.mockResolvedValue({
      data: {
        ...workflowApproval,
        summary_fields: {
          ...workflowApproval.summary_fields,
          labels: {
            results: [],
          },
        },
      },
    });

    await renderDetail(workflowApproval);
    // when there are no labels the Detail is empty and not rendered
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });

  test('Error dialog shown for failed approval', async () => {
    WorkflowApprovalsAPI.approve.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail(workflowApproval, {
      fetchWorkflowApproval: jest.fn(),
    });
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(WorkflowApprovalsAPI.approve).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('Error dialog shown for failed denial', async () => {
    WorkflowApprovalsAPI.deny.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail(workflowApproval, {
      fetchWorkflowApproval: jest.fn(),
    });
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(WorkflowApprovalsAPI.deny).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('Error dialog shown for failed deletion', async () => {
    WorkflowApprovalsAPI.destroy.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail({
      ...workflowApproval,
      status: 'successful',
      summary_fields: {
        ...workflowApproval.summary_fields,
        approved_or_denied_by: {
          id: 1,
          username: 'Foobar',
        },
      },
    });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('should fetch its workflow job details', async () => {
    await renderDetail(workflowApproval);
    expect(WorkflowJobsAPI.readDetail).toHaveBeenCalledTimes(1);
    expect(WorkflowJobsAPI.readDetail).toHaveBeenCalledWith(216);
  });
});
