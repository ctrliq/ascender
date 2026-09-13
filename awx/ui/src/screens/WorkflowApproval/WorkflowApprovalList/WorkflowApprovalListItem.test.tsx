import type { WorkflowApproval } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowApprovalListItem from './WorkflowApprovalListItem';
import mockWorkflowApprovals from '../data.workflowApprovals.json';

/** The fixture as the row takes it, which is what the api sends. */
const workflowApproval = mockWorkflowApprovals
  .results[0] as unknown as WorkflowApproval;

vi.mock('../../../api/models/WorkflowApprovals');

function renderItem(approval: WorkflowApproval) {
  return renderWithContexts(
    <table>
      <tbody>
        <WorkflowApprovalListItem
          isSelected={false}
          detailUrl={`/workflow_approvals/${approval.id}`}
          onSelect={() => {}}
          rowIndex={0}
          workflowApproval={approval}
        />
      </tbody>
    </table>
  );
}

describe('<WorkflowApprovalListItem />', () => {
  test('should display never expires status', () => {
    renderItem(workflowApproval);
    // For pending status with no expiration, StatusLabel shows "Never expires"
    expect(screen.getByText('Never expires')).toBeInTheDocument();
  });

  test('should display timed out status', () => {
    renderItem({
      ...workflowApproval,
      status: 'failed',
      timed_out: true,
    });
    expect(screen.getByText('Timed out')).toBeInTheDocument();
  });

  test('should display canceled status', () => {
    renderItem({
      ...workflowApproval,
      canceled_on: '2020-10-09T19:59:26.974046Z',
      status: 'canceled',
    });
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  test('should display approved status', () => {
    renderItem({
      ...workflowApproval,
      status: 'successful',
      summary_fields: {
        ...workflowApproval!.summary_fields,
        approved_or_denied_by: {
          id: 1,
          username: 'admin',
          first_name: '',
          last_name: '',
        },
      },
    });
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  test('should display denied status', () => {
    renderItem({
      ...workflowApproval,
      failed: true,
      status: 'failed',
      summary_fields: {
        ...workflowApproval!.summary_fields,
        approved_or_denied_by: {
          id: 1,
          username: 'admin',
          first_name: '',
          last_name: '',
        },
      },
    });
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });
});
