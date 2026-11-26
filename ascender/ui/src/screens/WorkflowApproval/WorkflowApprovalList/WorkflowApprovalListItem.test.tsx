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
          detailUrl={`/approvals/${approval.id}`}
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

  test('offers the actions on a pending approval the user may act on', () => {
    renderItem({
      ...workflowApproval,
      can_approve_or_deny: true,
      can_cancel_workflow: true,
    });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Cancel Workflow Job' })
    ).toBeEnabled();
  });

  test('holds the actions back from a user who may not act on it', () => {
    renderItem({ ...workflowApproval, can_approve_or_deny: false });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel Workflow Job' })
    ).toBeDisabled();
  });

  test('holds Cancel Workflow Job back from an approver who may not cancel it', () => {
    renderItem({
      ...workflowApproval,
      can_approve_or_deny: true,
      can_cancel_workflow: false,
    });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Cancel Workflow Job' })
    ).toBeDisabled();
  });

  test('offers Cancel Workflow Job to a workflow admin who may not vote', () => {
    renderItem({
      ...workflowApproval,
      can_approve_or_deny: false,
      can_cancel_workflow: true,
    });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel Workflow Job' })
    ).toBeEnabled();
  });
});
