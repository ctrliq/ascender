import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import { WorkflowApprovalsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import WorkflowApprovalList from './WorkflowApprovalList';
import mockWorkflowApprovals from '../data.workflowApprovals.json';

vi.mock('../../../api');

// Row id=221 ("220 - approval copy") is failed + deletable: the only row used
// in the delete tests below.
const deletableRowName = '220 - approval copy';

async function renderList() {
  const utils = renderWithContexts(<WorkflowApprovalList />);
  await screen.findByRole('link', { name: deletableRowName });
  return utils;
}

describe('<WorkflowApprovalList />', () => {
  beforeEach(() => {
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValue({
      data: {
        count: mockWorkflowApprovals.results.length,
        results: mockWorkflowApprovals.results,
      },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.read>);

    vi.mocked(WorkflowApprovalsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should load and render workflow approvals', async () => {
    await renderList();
    // header row + 4 data rows
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  test('should select workflow approval when checked', async () => {
    const { user } = await renderList();

    const row = screen
      .getByRole('link', { name: deletableRowName })
      .closest('tr');
    const checkbox = within(row!).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const { user } = await renderList();

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(4);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('Delete button is active', async () => {
    const { user } = await renderList();

    const row = screen
      .getByRole('link', { name: deletableRowName })
      .closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  test('should call delete api', async () => {
    const { user } = await renderList();

    const row = screen
      .getByRole('link', { name: deletableRowName })
      .closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(WorkflowApprovalsAPI.destroy).toHaveBeenCalledTimes(1)
    );

    // confirming delete closes the modal and refocuses the Tooltip-wrapped
    // toolbar Delete button
    await settleTooltips();
  });

  test('should show deletion error', async () => {
    vi.mocked(WorkflowApprovalsAPI.destroy).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/workflow_approvals/221',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = await renderList();
    expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(1);

    const row = screen
      .getByRole('link', { name: deletableRowName })
      .closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    // closing the modal refocuses the Tooltip-wrapped toolbar Delete button
    await settleTooltips();
  });

  /*
   * The selection is a copy of each row taken when it was ticked. When an
   * approval is acted on elsewhere the list reads itself again, and the
   * toolbar must decide on the approval as it is now rather than offer an
   * Approve or Deny the api would refuse.
   */
  test('stops offering Approve and Deny once a ticked approval is acted on', async () => {
    WS.clean();
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    try {
      const { user } = await renderList();
      await mockServer.connected;

      // The pending approval, id 218, is the first of the two rows its
      // workflow gives the same link text.
      const row = screen
        .getAllByRole('link', { name: '216 - approval' })[0]!
        .closest('tr');
      await user.click(within(row!).getByRole('checkbox'));
      // The rows carry Approve and Deny of their own, so the toolbar's are
      // found by their ouia ids.
      const toolbarButton = (id: string) =>
        document.querySelector(`[data-ouia-component-id="${id}"]`);
      const approve = () => toolbarButton('workflow-approval-approve-button');
      const deny = () => toolbarButton('workflow-approval-deny-button');
      expect(approve()).toBeEnabled();
      expect(deny()).toBeEnabled();

      vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValue({
        data: {
          count: mockWorkflowApprovals.results.length,
          results: mockWorkflowApprovals.results.map((approval) =>
            approval.id === 218
              ? {
                  ...approval,
                  status: 'successful',
                  can_approve_or_deny: false,
                }
              : approval
          ),
        },
      } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.read>);
      await act(async () => {
        mockServer.send(
          JSON.stringify({
            unified_job_id: 218,
            type: 'workflow_approval',
            status: 'successful',
          })
        );
      });

      await waitFor(() => expect(approve()).toBeDisabled(), { timeout: 4000 });
      expect(deny()).toBeDisabled();
      expect(within(row!).getByRole('checkbox')).toBeChecked();
    } finally {
      mockServer.close();
      WS.clean();
    }
  });
});
