import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowApprovalListDenyButton from './WorkflowApprovalListDenyButton';

const workflowApproval = {
  id: 1,
  name: 'Foo',
  can_approve_or_deny: true,
  url: '/api/v2/workflow_approvals/218/',
};

describe('<WorkflowApprovalListDenyButton />', () => {
  test('should render button', () => {
    renderWithContexts(
      <WorkflowApprovalListDenyButton onDeny={() => {}} selectedItems={[]} />
    );
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
  });

  test('should invoke onDeny prop', async () => {
    const onDeny = jest.fn();
    const { user } = renderWithContexts(
      <WorkflowApprovalListDenyButton
        onDeny={onDeny}
        selectedItems={[workflowApproval]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDeny).toHaveBeenCalled();
  });

  test('should disable button when no approve/deny permissions', () => {
    renderWithContexts(
      <WorkflowApprovalListDenyButton
        onDeny={() => {}}
        selectedItems={[{ ...workflowApproval, can_approve_or_deny: false }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
  });

  test('should render tooltip', async () => {
    const { user } = renderWithContexts(
      <WorkflowApprovalListDenyButton
        onDeny={() => {}}
        selectedItems={[workflowApproval]}
      />
    );
    await user.hover(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('Deny')
    );
  });
});
