import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { WorkflowStateContext } from 'contexts/Workflow';
import StatusIcon from 'components/StatusIcon';
import { WorkflowNodeTypeLetter } from 'components/Workflow';
import { secondsToHHMMSS } from 'util/dates';
import { stringIsUUID } from 'util/strings';
import { constants as wfConstants } from 'components/Workflow/WorkflowUtils';

const NodeG = styled.g`
  cursor: ${(props) => (props.job ? 'pointer' : 'default')};
`;

const JobTopLine = styled.div`
  align-items: center;
  display: flex;
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  p {
    margin-left: 10px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
`;

const Elapsed = styled.div`
  margin-top: 5px;
  text-align: center;

  span {
    font-size: 12px;
    font-weight: bold;
    background-color: var(--pf-v6-global--BackgroundColor--200);
    padding: 3px 12px;
    border-radius: 14px;
  }
`;

const NodeContents = styled.div`
  font-size: 13px;
  padding: 0px 10px;
`;

const NodeDefaultLabel = styled.p`
  margin-top: 20px;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConvergenceLabel = styled.p`
  font-size: 12px;
  color: #ffffff;
`;

Elapsed.displayName = 'Elapsed';

function WorkflowOutputNode({ mouseEnter, mouseLeave, node }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { nodePositions } = useContext(WorkflowStateContext);
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
  const [runningElapsed, setRunningElapsed] = useState(null);
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

  let borderColor = "var(--pf-t--global--border--color--default)";

  if (job) {
    if (job.status === 'failed' || job.status === 'error') {
      borderColor = "var(--pf-t--global--color--status--danger--default)";
    }
    if (job.status === 'canceled') {
      borderColor = "var(--ascender-status-canceled-color)";
    }
    if (job.status === 'successful' || job.status === 'ok') {
      borderColor = "var(--pf-t--global--color--status--success--default)";
    }
    if (job.status === 'running') {
      borderColor = "var(--ascender-status-running-color)";
    }
  } else if (priorRunSucceeded) {
    borderColor = "var(--pf-t--global--color--status--success--default)";
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

  return (
    <NodeG
      id={`node-${node.id}`}
      transform={`translate(${nodePositions[node.id].x},${
        nodePositions[node.id].y - nodePositions[1].y
      })`}
      job={job}
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
            <ConvergenceLabel>{t`ALL`}</ConvergenceLabel>
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
        <NodeContents>
          {(() => {
            if (job) {
              let elapsedText = null;
              if (isRunning && runningElapsed) {
                elapsedText = runningElapsed;
              } else if (job.elapsed) {
                elapsedText = secondsToHHMMSS(job.elapsed);
              }
              return (
                <>
                  <JobTopLine>
                    {job.status !== 'pending' && (
                      <StatusIcon status={job.status} />
                    )}
                    <p>{nodeName}</p>
                  </JobTopLine>
                  {elapsedText && <Elapsed>{elapsedText}</Elapsed>}
                </>
              );
            }
            if (priorRunSucceeded) {
              return (
                <>
                  <JobTopLine>
                    <StatusIcon status="successful" />
                    <p>{nodeName}</p>
                  </JobTopLine>
                  {priorRunElapsed != null && (
                    <Elapsed>{secondsToHHMMSS(priorRunElapsed)}</Elapsed>
                  )}
                </>
              );
            }
            return <NodeDefaultLabel>{nodeName}</NodeDefaultLabel>;
          })()}
        </NodeContents>
      </foreignObject>
      {(node.unifiedJobTemplate ||
        node.fullUnifiedJobTemplate ||
        node?.originalNodeObject?.summary_fields?.unified_job_template ||
        job ||
        priorRunSucceeded) && <WorkflowNodeTypeLetter node={node} />}
    </NodeG>
  );
}

export default WorkflowOutputNode;
