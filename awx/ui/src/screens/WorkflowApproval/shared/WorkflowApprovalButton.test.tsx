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
