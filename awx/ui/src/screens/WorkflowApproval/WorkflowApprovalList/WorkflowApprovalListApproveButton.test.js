import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowApprovalListApproveButton from './WorkflowApprovalListApproveButton';

const workflowApproval = {
  id: 1,
  name: 'Foo',
  can_approve_or_deny: true,
  url: '/api/v2/workflow_approvals/218/',
};

describe('<WorkflowApprovalListApproveButton />', () => {
  test('should render button', () => {
    renderWithContexts(
      <WorkflowApprovalListApproveButton onApprove={() => {}} selectedItems={[]} />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test('should invoke onApprove prop', async () => {
    const onApprove = jest.fn();
    const { user } = renderWithContexts(
      <WorkflowApprovalListApproveButton
        onApprove={onApprove}
        selectedItems={[workflowApproval]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalled();
  });

  test('should disable button when no approve/deny permissions', () => {
    renderWithContexts(
      <WorkflowApprovalListApproveButton
        onApprove={() => {}}
        selectedItems={[{ ...workflowApproval, can_approve_or_deny: false }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  test('should render tooltip', async () => {
    const { user } = renderWithContexts(
      <WorkflowApprovalListApproveButton
        onApprove={() => {}}
        selectedItems={[workflowApproval]}
      />
    );
    await user.hover(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('Approve')
    );
  });
});
