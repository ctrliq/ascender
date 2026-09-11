import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkflowApprovalsAPI, WorkflowJobsAPI } from 'api';
import { formatDateString } from 'util/dates';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import WorkflowApprovalDetail from './WorkflowApprovalDetail';
import mockWorkflowApprovals from '../data.workflowApprovals.json';

const workflowApproval = mockWorkflowApprovals.results[0];

vi.mock('../../../api');
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 218,
  }),
}));

vi.mock('@lingui/react/macro', async () => ({
  ...(await vi.importActual<typeof import('@lingui/react/macro')>(
    '@lingui/react/macro'
  )),
  useLingui: () => ({
    t: (template: Untyped, _values: Untyped) => {
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
vi.mock('components/CodeEditor', async () => ({
  ...(await vi.importActual<typeof import('components/CodeEditor')>(
    'components/CodeEditor'
  )),
  VariablesDetail: ({ label, value }: Untyped) => (
    <div>
      <div>{label}</div>
      <div data-testid="variables-detail-value">{value}</div>
    </div>
  ),
}));

vi.mock('../shared/WorkflowApprovalUtils', async () => {
  const actual = await vi.importActual<
    typeof import('../shared/WorkflowApprovalUtils')
  >('../shared/WorkflowApprovalUtils');
  // Resolved here rather than inside the callback: importActual is async, and
  // the callback this stands in for is called synchronously during render.
  const dates =
    await vi.importActual<typeof import('util/dates')>('util/dates');
  return {
    ...actual,
    getDetailPendingLabel: (workflowApproval: Untyped) => {
      if (!workflowApproval.approval_expiration) {
        return 'Never';
      }
      return dates.formatDateString(workflowApproval.approval_expiration);
    },
    getStatus: (workflowApproval: Untyped) => {
      if (workflowApproval.status === 'successful') {
        return 'approved';
      }
      return workflowApproval.status;
    },
  };
});

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

async function renderDetail(approval: Untyped, props = {}) {
  const utils = renderWithContexts(
    <WorkflowApprovalDetail
      fetchWorkflowApproval={() => {}}
      workflowApproval={approval}
      {...props}
    />
  );
  // wait for the workflow job fetch to resolve and the card body to render
  await screen.findByText('Workflow job details');
  return utils;
}

describe('<WorkflowApprovalDetail />', () => {
  beforeEach(() => {
    vi.mocked(WorkflowJobsAPI.readDetail).mockResolvedValue({
      data: workflowJob,
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readDetail>);
    vi.mocked(WorkflowApprovalsAPI.readVotes).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.readVotes>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render Details', async () => {
    await renderDetail(workflowApproval);

    assertDetail('Name', workflowApproval!.name);
    assertDetail('Description', workflowApproval!.description);
    assertDetail('Expires', 'Never');
    assertDetail(
      'Workflow Job',
      `${workflowApproval!.summary_fields.workflow_job.id} - ${workflowApproval!.summary_fields.workflow_job!.name}`
    );
    assertDetail(
      'Workflow Job Template',
      workflowApproval!.summary_fields.workflow_job_template.name
    );

    const createdLabel = screen.getByText('Created');
    expect(createdLabel.nextElementSibling).toHaveTextContent(
      formatDateString('2020-10-09T17:13:12.067947Z')!
    );
    expect(createdLabel.nextElementSibling).toHaveTextContent('admin');

    assertDetail('Last Modified', formatDateString(workflowApproval!.modified));
    assertDetail('Elapsed', '00:00:22');
    assertDetail('Limit', 'localhost');
    assertDetail('Source Control Branch', 'main');

    const inventoryLabel = screen.getByText('Inventory');
    const inventoryLink = within(
      inventoryLabel.nextElementSibling as unknown as HTMLElement
    ).getByRole('link');
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

  test('should show quorum progress and votes', async () => {
    vi.mocked(WorkflowApprovalsAPI.readVotes).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            vote: 'approve',
            comment: 'looks good',
            created: '2020-10-09T18:00:00.067947Z',
            user_name: 'alice',
            summary_fields: { user: { id: 3, username: 'alice' } },
          },
        ],
      },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.readVotes>);
    await renderDetail({
      ...workflowApproval,
      required_approvals: 2,
      approvals_received: 1,
    });
    assertDetail('Approvals', '1/2');
    const votesLabel = screen.getByText('Votes');
    expect(votesLabel.nextElementSibling).toHaveTextContent('alice');
    expect(votesLabel.nextElementSibling).toHaveTextContent('approved');
    expect(votesLabel.nextElementSibling).toHaveTextContent('looks good');
  });

  test('should show on timeout resolution when a timeout is set', async () => {
    await renderDetail({
      ...workflowApproval,
      timeout: 60,
      on_timeout: 'approve',
    });
    assertDetail('On Timeout', 'Approve');
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
        ...workflowApproval!.summary_fields,
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
        ...workflowApproval!.summary_fields,
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
    vi.mocked(WorkflowJobsAPI.readDetail).mockResolvedValue({
      data: {
        ...workflowApproval,
        summary_fields: {
          ...workflowApproval!.summary_fields,
          labels: {
            results: [],
          },
        },
      },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readDetail>);

    await renderDetail(workflowApproval);
    // when there are no labels the Detail is empty and not rendered
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });

  test('Error dialog shown for failed approval', async () => {
    vi.mocked(WorkflowApprovalsAPI.approve).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail(workflowApproval, {
      fetchWorkflowApproval: vi.fn(),
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
    vi.mocked(WorkflowApprovalsAPI.deny).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail(workflowApproval, {
      fetchWorkflowApproval: vi.fn(),
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
    vi.mocked(WorkflowApprovalsAPI.destroy).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDetail({
      ...workflowApproval,
      status: 'successful',
      summary_fields: {
        ...workflowApproval!.summary_fields,
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
