import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';

import { WorkflowApprovalsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import type { ResponseOf } from '../../../testUtils/responseOf';
import usePendingApprovalCount, {
  APPROVAL_REFRESH_INTERVAL,
} from './usePendingApprovalCount';

vi.mock('../../api');

// The websocket side is covered by its own test; here it hands back the count
// and keeps the re-read it was given, so a test can play a burst of messages.
let wsRefetch: () => void = () => {};
vi.mock('./useWsPendingApprovalCount', () => ({
  default: (count: number, refetch: () => void) => {
    wsRefetch = refetch;
    return count;
  },
}));

function Probe() {
  return <div data-testid="count">{usePendingApprovalCount()}</div>;
}

// Shaped as /api/v2/workflow_approvals/ answers: user_capabilities carries
// start and delete only, and the approve right is can_approve_or_deny.
function approval(
  id: number,
  canApprove: boolean,
  voted = false
): Record<string, unknown> {
  return {
    id,
    type: 'workflow_approval',
    name: `Approval ${id}`,
    status: 'pending',
    summary_fields: { user_capabilities: { delete: true, start: true } },
    can_approve_or_deny: canApprove,
    can_cancel_workflow: false,
    required_approvals: 2,
    approvals_received: voted ? 1 : 0,
    user_has_voted: voted,
  };
}

function page(
  results: Record<string, unknown>[],
  count: number,
  next: string | null = null
) {
  return {
    data: { count, next, previous: null, results },
  } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.read>;
}

const notSuperuser = { config: { me: { id: 7, is_superuser: false } } };

describe('usePendingApprovalCount', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  test('counts the approvals this user can still decide', async () => {
    vi.mocked(WorkflowApprovalsAPI.read)
      .mockResolvedValueOnce(page([approval(1, true)], 4))
      .mockResolvedValueOnce(
        page(
          [
            approval(1, true),
            approval(2, true),
            approval(3, false),
            approval(4, true, true),
          ],
          4
        )
      );

    renderWithContexts(<Probe />, { context: notSuperuser });

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2')
    );
    expect(WorkflowApprovalsAPI.read).toHaveBeenNthCalledWith(1, {
      status: 'pending',
      not__votes__user: 7,
      page_size: 1,
    });
  });

  test('reads every page rather than stopping at the first', async () => {
    vi.mocked(WorkflowApprovalsAPI.read)
      .mockResolvedValueOnce(page([approval(1, true)], 3))
      .mockResolvedValueOnce(
        page([approval(1, true), approval(2, true)], 3, '/next/')
      )
      .mockResolvedValueOnce(page([approval(3, true)], 3));

    renderWithContexts(<Probe />, { context: notSuperuser });

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('3')
    );
    expect(WorkflowApprovalsAPI.read).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, page_size: 200 })
    );
  });

  test('stops at the one row read when nothing is pending', async () => {
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValue(page([], 0));

    renderWithContexts(<Probe />, { context: notSuperuser });

    await waitFor(() => expect(WorkflowApprovalsAPI.read).toHaveBeenCalled());
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(1);
  });

  test('a superuser gets the count of the one row read', async () => {
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValue(
      page([approval(1, true)], 250)
    );

    renderWithContexts(<Probe />, {
      context: { config: { me: { id: 1, is_superuser: true } } },
    });

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('250')
    );
    expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(1);
  });

  test('a burst of websocket re-reads becomes two reads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValue(page([], 0));

    renderWithContexts(<Probe />, { context: notSuperuser });
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(1)
    );

    act(() => {
      wsRefetch();
      wsRefetch();
      wsRefetch();
      wsRefetch();
    });
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(2)
    );

    await act(async () => {
      vi.advanceTimersByTime(APPROVAL_REFRESH_INTERVAL);
    });
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(3)
    );
    expect(WorkflowApprovalsAPI.read).toHaveBeenCalledTimes(3);
  });
});
