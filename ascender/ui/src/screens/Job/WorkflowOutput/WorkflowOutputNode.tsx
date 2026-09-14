import type {
  WorkflowNode,
  WorkflowState,
} from 'components/Workflow/workflowReducer';
import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { WorkflowStateContext } from 'contexts/Workflow';
import type { NodePositions } from 'components/Workflow/WorkflowUtils';
import StatusIcon from 'components/StatusIcon';
import { WorkflowNodeTypeLetter } from 'components/Workflow';
import { secondsToHHMMSS } from 'util/dates';
import { stringIsUUID } from 'util/strings';
import { constants as wfConstants } from 'components/Workflow/WorkflowUtils';
import './WorkflowOutputNode.css';

// $hasJob is transient: the job object itself used to be forwarded to the <g>
// and land in the DOM as an attribute.

export interface WorkflowOutputNodeProps {
  mouseEnter: () => void;
  mouseLeave: () => void;
  node: WorkflowNode;
  [key: string]: unknown;
}

function WorkflowOutputNode({
  mouseEnter,
  mouseLeave,
  node,
}: WorkflowOutputNodeProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  // Asserted because a node is only rendered once the graph has laid itself
  // out, which is what fills the positions in.
  const { nodePositions } = useContext(
    WorkflowStateContext
  ) as WorkflowState & { nodePositions: NodePositions };
  const job = node?.originalNodeObject?.summary_fields?.job;
  // A node carried forward by "relaunch from failed" succeeded in the prior
  // run and spawns no job of its own; show it as successful (green).
  const priorRunSucceeded = node?.originalNodeObject?.prior_run_succeeded;
  const priorRunElapsed = node?.originalNodeObject?.prior_run_elapsed;

  // Live-ticking elapsed time while the node runs. Use the job's started time
  // when known; for a node that starts while watching (its websocket message
  // carries no started) count from when it was first seen running.
  const isRunning = job?.status === 'running';
  const jobStarted = job?.started;
  const [runningElapsed, setRunningElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (!isRunning) {
      setRunningElapsed(null);
      return undefined;
    }
    const startedAt = jobStarted ? new Date(jobStarted).getTime() : Date.now();
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setRunningElapsed(secondsToHHMMSS(seconds));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isRunning, jobStarted]);

  let borderColor = 'var(--pf-t--global--border--color--default)';

  if (job) {
    if (job.status === 'failed' || job.status === 'error') {
      borderColor = 'var(--pf-t--global--color--status--danger--default)';
    }
    if (job.status === 'canceled') {
      borderColor = 'var(--ascender-status-canceled-color)';
    }
    if (job.status === 'successful' || job.status === 'ok') {
      borderColor = 'var(--pf-t--global--color--status--success--default)';
    }
    if (job.status === 'running') {
      borderColor = 'var(--ascender-status-running-color)';
    }
  } else if (priorRunSucceeded) {
    borderColor = 'var(--pf-t--global--color--status--success--default)';
  }

  const handleNodeClick = () => {
    if (job) {
      const basePath =
        job.type !== 'workflow_approval' ? 'jobs' : 'workflow_approvals';
      navigate(`/${basePath}/${job.id}/details`);
    }
  };

  let nodeName;

  if (
    node?.identifier ||
    (node?.originalNodeObject?.identifier &&
      !stringIsUUID(node.originalNodeObject.identifier))
  ) {
    nodeName = node?.identifier
      ? node?.identifier
      : node?.originalNodeObject?.identifier;
  } else {
    nodeName =
      node?.fullUnifiedJobTemplate?.name ||
      node?.originalNodeObject?.summary_fields?.unified_job_template?.name ||
      t`DELETED`;
  }

  const nodePosition = nodePositions[node.id] as NodePositions[number];
  const rootPosition = nodePositions[1] as NodePositions[number];

  return (
    <g
      id={`node-${node.id}`}
      transform={`translate(${nodePosition.x},${
        nodePosition.y - rootPosition.y
      })`}
      className={job ? 'ascender-workflow-output-node__node-g--has-job' : undefined}
      onClick={handleNodeClick}
      onMouseEnter={mouseEnter}
      onMouseLeave={mouseLeave}
    >
      {(node.all_parents_must_converge ||
        node?.originalNodeObject?.all_parents_must_converge) && (
        <>
          <rect
            fill={borderColor}
            height={wfConstants.nodeH / 4}
            rx={2}
            ry={2}
            x={wfConstants.nodeW / 2 - wfConstants.nodeW / 10}
            y={-wfConstants.nodeH / 4 + 2}
            stroke={borderColor}
            strokeWidth="2px"
            width={wfConstants.nodeW / 5}
          />
          <foreignObject
            height={wfConstants.nodeH / 4}
            width={wfConstants.nodeW / 5}
            x={wfConstants.nodeW / 2 - wfConstants.nodeW / 10 + 7}
            y={-wfConstants.nodeH / 4 - 1}
          >
            <p className="ascender-workflow-output-node__convergence-label">{t`ALL`}</p>
          </foreignObject>
        </>
      )}
      <rect
        fill="var(--ascender-workflow-node-bg)"
        height={wfConstants.nodeH}
        rx="2"
        ry="2"
        stroke={borderColor}
        strokeWidth="2px"
        width={wfConstants.nodeW}
      />
      <foreignObject height="58" width="178" x="1" y="1">
        <div className="ascender-workflow-output-node__contents">
          {(() => {
            if (job) {
              let elapsedText = null;
              if (isRunning && runningElapsed) {
                elapsedText = runningElapsed;
              } else if (job.elapsed) {
                // The api serializes the decimal as a string.
                elapsedText = secondsToHHMMSS(Number(job.elapsed));
              }
              return (
                <>
                  <div className="ascender-workflow-output-node__job-top-line">
                    {job.status && job.status !== 'pending' && (
                      <StatusIcon status={job.status} />
                    )}
                    <p>{nodeName}</p>
                  </div>
                  {elapsedText && (
                    <div className="ascender-workflow-output-node__elapsed">
                      {elapsedText}
                    </div>
                  )}
                </>
              );
            }
            if (priorRunSucceeded) {
              return (
                <>
                  <div className="ascender-workflow-output-node__job-top-line">
                    <StatusIcon status="successful" />
                    <p>{nodeName}</p>
                  </div>
                  {priorRunElapsed != null && (
                    <div className="ascender-workflow-output-node__elapsed">
                      {secondsToHHMMSS(priorRunElapsed)}
                    </div>
                  )}
                </>
              );
            }
            return (
              <p className="ascender-workflow-output-node__default-label">
                {nodeName}
              </p>
            );
          })()}
        </div>
      </foreignObject>
      {(node.unifiedJobTemplate ||
        node.fullUnifiedJobTemplate ||
        node?.originalNodeObject?.summary_fields?.unified_job_template ||
        job ||
        priorRunSucceeded) && <WorkflowNodeTypeLetter node={node} />}
    </g>
  );
}

export default WorkflowOutputNode;
