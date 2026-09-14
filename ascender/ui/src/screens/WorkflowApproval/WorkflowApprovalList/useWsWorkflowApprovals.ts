import type { WorkflowApproval } from 'types/api';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';

export default function useWsWorkflowApprovals(
  initialWorkflowApprovals: WorkflowApproval[],
  fetchWorkflowApprovals: () => void
) {
  const [workflowApprovals, setWorkflowApprovals] = useState(
    initialWorkflowApprovals
  );
  const [reloadEntireList, setReloadEntireList] = useState(false);
  const throttledListRefresh = useThrottle(reloadEntireList, 1000);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setWorkflowApprovals(initialWorkflowApprovals);
  }, [initialWorkflowApprovals]);

  useEffect(() => {
    (async () => {
      if (!throttledListRefresh) {
        return;
      }
      setReloadEntireList(false);
      fetchWorkflowApprovals();
    })();
  }, [throttledListRefresh, fetchWorkflowApprovals]);

  useEffect(() => {
    if (!(lastMessage?.type === 'workflow_approval')) {
      return;
    }

    setWorkflowApprovals((currentWorkflowApprovals) => {
      const index = currentWorkflowApprovals.findIndex(
        (p) => p.id === lastMessage.unified_job_id
      );

      if (
        (index > -1 &&
          !['new', 'pending', 'waiting', 'running'].includes(
            lastMessage.status as string
          )) ||
        (index === -1 && lastMessage.status === 'pending')
      ) {
        setReloadEntireList(true);
      }

      return currentWorkflowApprovals;
    });
  }, [lastMessage]);

  return workflowApprovals;
}
