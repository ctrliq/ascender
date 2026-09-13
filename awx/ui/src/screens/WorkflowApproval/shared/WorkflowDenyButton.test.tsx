import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowDenyButton from './WorkflowDenyButton';
import mockData from '../data.workflowApprovals.json';
import type { WorkflowApproval } from '../../../types/api';

vi.mock('api');

const mockApprovalList = mockData.results;

describe('<WorkflowDenyButton/>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially render successfully', () => {
    renderWithContexts(
      <WorkflowDenyButton
        workflowApproval={mockApprovalList[0] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  test('should be disabled', () => {
    renderWithContexts(
      <WorkflowDenyButton
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

  test('should handle deny', async () => {
    const { user } = renderWithContexts(
      <WorkflowDenyButton
        workflowApproval={mockApprovalList[0] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.deny).toHaveBeenCalledWith(218)
    );
  });

  test('Should handle deny error', async () => {
    vi.mocked(WorkflowApprovalsAPI.deny).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/workflow',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <WorkflowDenyButton
        workflowApproval={mockApprovalList[0] as unknown as WorkflowApproval}
        onHandleToast={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });
});
