import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';

/**
 * Keeps the pending approval count in the navigation in step with the
 * websocket.
 *
 * Args:
 *   initialCount: the count the container last fetched.
 *   fetchApprovalsCount: re-reads it, throttled to once a second.
 *
 * Returns:
 *   The count, re-read whenever a workflow approval changes.
 */
export default function useWsPendingApprovalCount(
  initialCount: number,
  fetchApprovalsCount: () => void
) {
  const [pendingApprovalCount, setPendingApprovalCount] =
    useState(initialCount);
  const [reloadCount, setReloadCount] = useState(false);
  const throttledFetch = useThrottle(reloadCount, 1000);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setPendingApprovalCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    (async () => {
      if (!throttledFetch) {
        return;
      }
      setReloadCount(false);
      fetchApprovalsCount();
    })();
  }, [throttledFetch, fetchApprovalsCount]);

  useEffect(() => {
    if (lastMessage?.type === 'workflow_approval') {
      setReloadCount(true);
    }
  }, [lastMessage]);

  return pendingApprovalCount;
}
