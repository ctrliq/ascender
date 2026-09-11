import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { WorkflowApprovalsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockWorkflowApprovals from './data.workflowApprovals.json';
import WorkflowApproval from './WorkflowApproval';

vi.mock('../../api/models/WorkflowApprovals');

// Marker for the routed detail panel, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./WorkflowApprovalDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'WorkflowApprovalDetail'),
  };
});

// WorkflowApproval uses paths relative to its parent route, so mount it under
// the same /workflow_approvals/:id/* route that WorkflowApprovals.js gives it.
function renderAt(path: Untyped) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/workflow_approvals/:id/*"
        element={<WorkflowApproval setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<WorkflowApproval />', () => {
  beforeEach(() => {
    vi.mocked(WorkflowApprovalsAPI.readDetail).mockResolvedValue({
      data: mockWorkflowApprovals.results[0],
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the workflow approval detail', async () => {
    renderAt('/workflow_approvals/1/details');
    expect(
      await screen.findByText('WorkflowApprovalDetail')
    ).toBeInTheDocument();
    // real route params are strings (route params are always strings under react-router)
    expect(WorkflowApprovalsAPI.readDetail).toHaveBeenCalledWith('1');
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/workflow_approvals/1');
    expect(
      await screen.findByText('WorkflowApprovalDetail')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/workflow_approvals/1/details')
    );
  });

  test('shows a not-found error on an unknown sub-route', async () => {
    renderAt('/workflow_approvals/1/foobar');
    expect(
      await screen.findByText('View Workflow Approval Details')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('WorkflowApprovalDetail')
    ).not.toBeInTheDocument();
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(WorkflowApprovalsAPI.readDetail).mockRejectedValue(err);
    renderAt('/workflow_approvals/1/details');
    expect(
      await screen.findByText('Workflow Approval not found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('WorkflowApprovalDetail')
    ).not.toBeInTheDocument();
  });
});
