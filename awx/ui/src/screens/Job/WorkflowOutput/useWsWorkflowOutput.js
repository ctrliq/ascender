import { useState, useEffect, useCallback, useRef } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import { WorkflowJobsAPI } from 'api';

const fetchWorkflowNodes = async (jobId, pageNo = 1, nodes = []) => {
  const { data } = await WorkflowJobsAPI.readNodes(jobId, {
    page_size: 200,
    page: pageNo,
  });

  if (data.next) {
    return fetchWorkflowNodes(jobId, pageNo + 1, nodes.concat(data.results));
  }
  return nodes.concat(data.results);
};

// Job statuses ordered earliest-to-latest, so a lagging full re-fetch never
// downgrades a node that has already advanced in the live view (which would
// drop its blue running animation).
const STATUS_RANK = {
  pending: 1,
  waiting: 1,
  running: 2,
  successful: 3,
  failed: 3,
  error: 3,
  canceled: 3,
};
const statusRank = (status) => STATUS_RANK[status] || 0;

export default function useWsWorkflowOutput(workflowJobId, initialNodes) {
  const [nodes, setNodes] = useState(initialNodes);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  const refreshNodeObjects = useCallback(async () => {
    const updatedNodeObjects = await fetchWorkflowNodes(workflowJobId);
    // the fetch is async; the component may have unmounted while it was in flight
    if (!isMounted.current) {
      return;
    }
    const updatedNodeObjectsMap = updatedNodeObjects.reduce((map, node) => {
      map[node.id] = node;
      return map;
    }, {});
    setNodes((prevNodes) =>
      (prevNodes || []).map((node) => {
        if (node.id === 1) {
          // This is our artificial start node
          return { ...node };
        }
        const refreshed = updatedNodeObjectsMap[node.originalNodeObject?.id];
        if (!refreshed) {
          return node;
        }
        // The fetch can lag a node that just started running; keep the
        // already-advanced in-memory status so the snapshot does not undo a
        // running node back to pending and drop its animation.
        const currentStatus =
          node.originalNodeObject?.summary_fields?.job?.status;
        const refreshedStatus = refreshed?.summary_fields?.job?.status;
        if (
          currentStatus &&
          statusRank(currentStatus) > statusRank(refreshedStatus)
        ) {
          return node;
        }
        return { ...node, originalNodeObject: refreshed };
      })
    );
  }, [workflowJobId]);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  // When a workflow (re)loads, its first node can start running before the node
  // list is ready, so that running message is dropped and the node never
  // animates — most visible on a full relaunch, where the first node starts
  // immediately. Re-fetch shortly after load to recover any status change that
  // happened during that window. The status-rank merge means this can only
  // advance node states, never undo a node that is already running/finished.
  useEffect(() => {
    const timer = setTimeout(refreshNodeObjects, 2000);
    return () => clearTimeout(timer);
  }, [workflowJobId, refreshNodeObjects]);

  useEffect(
    () => {
      if (
        lastMessage?.unified_job_id === workflowJobId &&
        ['successful', 'failed', 'error', 'canceled'].includes(
          lastMessage.status
        )
      ) {
        refreshNodeObjects();
      } else {
        if (lastMessage?.workflow_job_id !== workflowJobId) {
          return;
        }
        if (
          ['successful', 'failed', 'error', 'canceled'].includes(
            lastMessage.status
          )
        ) {
          // When a node finishes, re-fetch the nodes so its elapsed time shows
          // right away rather than only once the whole workflow finishes — the
          // status_changed message carries no elapsed value to patch in.
          refreshNodeObjects();
        } else {
          // Functional update so rapid back-to-back messages (e.g. a node going
          // waiting -> running) can't clobber one another through a stale closure
          // and lose the running state.
          setNodes((prevNodes) => {
            if (!prevNodes) {
              return prevNodes;
            }
            const index = prevNodes.findIndex(
              (node) =>
                node?.originalNodeObject?.id === lastMessage.workflow_node_id
            );
            return index > -1
              ? updateNode(prevNodes, index, lastMessage)
              : prevNodes;
          });
        }
      }
    },
    [lastMessage] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return nodes;
}

function updateNode(nodes, index, message) {
  const node = {
    ...nodes[index],
    originalNodeObject: {
      ...nodes[index]?.originalNodeObject,
      job: message.unified_job_id,
      summary_fields: {
        ...nodes[index]?.originalNodeObject?.summary_fields,
        job: {
          ...nodes[index]?.originalNodeObject?.summary_fields?.job,
          id: message.unified_job_id,
          status: message.status,
          type: message.type,
        },
      },
    },
    job: {
      ...nodes[index]?.job,
      id: message.unified_job_id,
      status: message.status,
      type: message.type,
    },
  };

  return [...nodes.slice(0, index), node, ...nodes.slice(index + 1)];
}
