import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowApprovalButton from './WorkflowApprovalButton';
import mockData from '../data.workflowApprovals.json';
import type { WorkflowApproval } from '../../../types/api';

vi.mock('api');

const mockApprovalList = mockData.results;

describe('<WorkflowApprovalButton/>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially render successfully', () => {
    renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={mockApprovalList[0] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  test('should be disabled', () => {
    renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={mockApprovalList[2] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', {
        name: 'This workflow has already been acted on',
      })
    ).toBeDisabled();
  });

  /*
   * Deleting a workflow job leaves its pending approvals behind: the api keeps
   * saying they can be voted on, and a vote would move a record nobody reads.
   */
  test('should be disabled once the workflow is deleted', () => {
    const orphaned = {
      ...(mockApprovalList[0] as unknown as WorkflowApproval),
      summary_fields: {
        ...(mockApprovalList[0] as unknown as WorkflowApproval).summary_fields,
        source_workflow_job: undefined,
      },
    };
    renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={orphaned}
        onHandleToast={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'This workflow has been deleted' })
    ).toBeDisabled();
  });

  test('should handle approve', async () => {
    const { user } = renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={mockApprovalList[0] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.approve).toHaveBeenCalledWith(218)
    );
  });
});
