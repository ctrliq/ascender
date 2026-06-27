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
          return { ...node };
        }
        const refreshed = updatedNodeObjectsMap[node.originalNodeObject?.id];
        if (!refreshed) {
          return node;
        }
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

  const hasInitializedRef = useRef(false);

  // Sync chart nodes from the reducer ONCE — the first time initialNodes has
  // real data (more than the artificial START node).  After that the hook owns
  // the node state exclusively; subsequent initialNodes changes (from the
  // reducer echo) are ignored so they cannot overwrite WebSocket / recovery
  // updates.
  //
  // Recovery refetches fire at 500 ms and 2500 ms to catch status changes that
  // happened while the graph was still loading.  The timers are intentionally
  // NOT cleaned up on effect re-run so they survive React strict-mode's
  // unmount/remount cycle; refreshNodeObjects is safe to call after unmount
  // (it checks isMounted).
  useEffect(() => {
    if (hasInitializedRef.current) return;
    if (!initialNodes || initialNodes.length <= 1) return;
    hasInitializedRef.current = true;
    setNodes(initialNodes);
    setTimeout(refreshNodeObjects, 500);
    setTimeout(refreshNodeObjects, 2500);
  }, [initialNodes, refreshNodeObjects]);

  useEffect(() => {
    hasInitializedRef.current = false;
  }, [workflowJobId]);

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
          refreshNodeObjects();
        } else {
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
