import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowApprovalButton from './WorkflowApprovalButton';
import mockData from '../data.workflowApprovals.json';

jest.mock('api');

const mockApprovalList = mockData.results;

describe('<WorkflowApprovalButton/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially render successfully', () => {
    renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={mockApprovalList[0]}
        onHandleToast={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  test('should be disabled', () => {
    renderWithContexts(
      <WorkflowApprovalButton
        workflowApproval={mockApprovalList[2]}
        onHandleToast={jest.fn()}
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
        workflowApproval={mockApprovalList[0]}
        onHandleToast={jest.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.approve).toHaveBeenCalledWith(218)
    );
  });
});
