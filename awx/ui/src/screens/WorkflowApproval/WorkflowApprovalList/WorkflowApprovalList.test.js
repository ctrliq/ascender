import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import WorkflowApprovalList from './WorkflowApprovalList';
import mockWorkflowApprovals from '../data.workflowApprovals.json';

jest.mock('../../../api');

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
    WorkflowApprovalsAPI.read.mockResolvedValue({
      data: {
        count: mockWorkflowApprovals.results.length,
        results: mockWorkflowApprovals.results,
      },
    });

    WorkflowApprovalsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should load and render workflow approvals', async () => {
    await renderList();
    // header row + 4 data rows
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  test('should select workflow approval when checked', async () => {
    const { user } = await renderList();

    const row = screen.getByRole('link', { name: deletableRowName }).closest('tr');
    const checkbox = within(row).getByRole('checkbox');
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

    const row = screen.getByRole('link', { name: deletableRowName }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  test('should call delete api', async () => {
    const { user } = await renderList();

    const row = screen.getByRole('link', { name: deletableRowName }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

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
    WorkflowApprovalsAPI.destroy.mockRejectedValue(
      new Error({
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

    const row = screen.getByRole('link', { name: deletableRowName }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

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
});
