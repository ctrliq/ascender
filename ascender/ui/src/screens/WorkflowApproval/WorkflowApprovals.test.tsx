import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowApprovals from './WorkflowApprovals';

vi.mock('../../api/models/WorkflowApprovals');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
vi.mock('./WorkflowApprovalList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'WorkflowApprovalList'),
  };
});
vi.mock('./WorkflowApproval', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'WorkflowApproval detail'),
  };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/approvals/*" element={<WorkflowApprovals />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<WorkflowApprovals />', () => {
  test('renders the list at /approvals', async () => {
    renderAt('/approvals');
    expect(await screen.findByText('WorkflowApprovalList')).toBeInTheDocument();
  });

  test('renders the detail subtree at /approvals/:id', async () => {
    renderAt('/approvals/1/details');
    expect(
      await screen.findByText('WorkflowApproval detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('WorkflowApprovalList')).not.toBeInTheDocument();
  });
});
