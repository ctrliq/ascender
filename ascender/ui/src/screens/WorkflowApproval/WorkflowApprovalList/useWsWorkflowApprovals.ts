import type { WorkflowApproval } from 'types/api';
import { useState, useEffect, useRef } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';

export default function useWsWorkflowApprovals(
  initialWorkflowApprovals: WorkflowApproval[],
  fetchWorkflowApprovals: () => void
) {
  const [workflowApprovals, setWorkflowApprovals] = useState(
    initialWorkflowApprovals
  );
  // The list the next message is checked against. A ref rather than a read
  // inside a state updater: an updater has to be pure, since React may run it
  // twice or at render time, and asking for a reload from inside one was a side
  // effect hidden where nothing expects one.
  const currentApprovals = useRef(initialWorkflowApprovals);
  const [reloadEntireList, setReloadEntireList] = useState(false);
  const throttledListRefresh = useThrottle(reloadEntireList, 1000);
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    currentApprovals.current = initialWorkflowApprovals;
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

  // Every message in the batch is looked at, so an approval that settles in
  // the same tick as another one arrives still has the list re-read.
  useEffect(() => {
    messages.forEach((message) => {
      if (message.type !== 'workflow_approval') {
        return;
      }

      const index = currentApprovals.current.findIndex(
        (p) => p.id === message.unified_job_id
      );

      // One that is listed and has settled, or one that is new and waiting on
      // somebody: either way the list on screen is out of date.
      if (
        (index > -1 &&
          !['new', 'pending', 'waiting', 'running'].includes(
            message.status as string
          )) ||
        (index === -1 && message.status === 'pending')
      ) {
        setReloadEntireList(true);
      }
    });
  }, [messages]);

  return workflowApprovals;
}
