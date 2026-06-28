import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowApprovals from './WorkflowApprovals';

jest.mock('../../api/models/WorkflowApprovals');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./WorkflowApprovalList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'WorkflowApprovalList'),
  };
});
jest.mock('./WorkflowApproval', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'WorkflowApproval detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/workflow_approvals/*" element={<WorkflowApprovals />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<WorkflowApprovals />', () => {
  test('renders the list at /workflow_approvals', async () => {
    renderAt('/workflow_approvals');
    expect(await screen.findByText('WorkflowApprovalList')).toBeInTheDocument();
  });

  test('renders the detail subtree at /workflow_approvals/:id', async () => {
    renderAt('/workflow_approvals/1/details');
    expect(
      await screen.findByText('WorkflowApproval detail')
    ).toBeInTheDocument();
    expect(screen.queryByText('WorkflowApprovalList')).not.toBeInTheDocument();
  });
});
