import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { shape } from 'prop-types';
import { Badge as PFBadge, Button, Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import {
  CompassIcon,
  WrenchIcon,
  ProjectDiagramIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';
import StatusLabel from 'components/StatusLabel';
import { calculateElapsed, secondsToHHMMSS } from 'util/dates';
import JobCancelButton from 'components/JobCancelButton';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';

const Toolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid var(--pf-global--BorderColor--100);
  display: flex;
  height: 56px;
`;

const ToolbarJob = styled.div`
  display: inline-flex;
  align-items: center;

  h1 {
    margin-right: 10px;
    font-weight: var(--pf-global--FontWeight--bold);
  }
`;

const ToolbarActions = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: flex-end;
`;

const Badge = styled(PFBadge)`
  align-items: center;
  display: flex;
  justify-content: center;
  margin-left: 10px;
`;

const ElapsedBadge = styled(Badge)`
  margin-right: 20px;
  min-width: 70px;
  font-variant-numeric: tabular-nums;
`;

const ActionButton = styled(Button)`
  border: none;
  margin: 0px 6px;
  padding: 6px 10px;
  &:hover {
    background-color: var(--pf-global--primary-color--100);
    color: #fff;
  }

  &.pf-m-active {
    background-color: var(--pf-global--primary-color--100);
    color: #fff;
  }
`;
function WorkflowOutputToolbar({ job }) {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const navigate = useNavigate();
  const { nodes, showLegend, showTools } = useContext(WorkflowStateContext);
  const workflowTemplateId =
    job.summary_fields?.workflow_job_template?.id ??
    job.summary_fields?.workflow_job_template?.[0]?.id;

  const [activeJobElapsedTime, setActiveJobElapsedTime] = React.useState(
    calculateElapsed(job.started)
  );

  React.useEffect(() => {
    let secTimer;
    if (job.started && !job.finished) {
      secTimer = setInterval(() => {
        setActiveJobElapsedTime(calculateElapsed(job.started));
      }, 1000);
    }
    return () => clearInterval(secTimer);
  }, [job.started, job.finished]);

  const totalNodes = nodes.reduce((n, node) => n + !node.isDeleted, 0) - 1;
  const navToWorkflow = () => {
    if (workflowTemplateId) {
      navigate(
        `/templates/workflow_job_template/${workflowTemplateId}/visualizer`
      );
    }
  };
  return (
    <Toolbar id="workflow-output-toolbar">
      <ToolbarJob>
        <h1>{job.name}</h1>
        <StatusLabel status={job.status} />
      </ToolbarJob>
      <ToolbarActions>
        {['new', 'pending', 'waiting', 'running'].includes(job?.status) &&
        job?.summary_fields?.user_capabilities?.start ? (
          <JobCancelButton
            style={{ margin: '0px 6px', padding: '6px 10px' }}
            job={job}
            errorTitle={t`Job Cancel Error`}
            title={t`Cancel ${job.name}`}
            errorMessage={t`Failed to cancel ${job.name}`}
            showIconButton
          />
        ) : null}

        {workflowTemplateId && (
          <ActionButton
            ouiaId="edit-workflow"
            aria-label={t`Edit workflow`}
            id="edit-workflow"
            variant="plain"
            onClick={navToWorkflow}
          >
            <ProjectDiagramIcon />
          </ActionButton>
        )}
        <div>{t`Elapsed`}</div>
        <Tooltip content={t`Elapsed time that the job ran`}>
          <ElapsedBadge isRead id="workflow-elapsed-badge">
            {job.finished && job.elapsed != null
              ? secondsToHHMMSS(job.elapsed)
              : activeJobElapsedTime}
          </ElapsedBadge>
        </Tooltip>
        <div>{t`Total Nodes`}</div>
        <Badge isRead>{totalNodes}</Badge>
        <Tooltip content={t`Toggle Legend`} position="bottom">
          <ActionButton
            id="workflow-output-toggle-legend"
            isActive={showLegend}
            onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
            variant="plain"
          >
            <CompassIcon />
          </ActionButton>
        </Tooltip>
        <Tooltip content={t`Toggle Tools`} position="bottom">
          <ActionButton
            id="workflow-output-toggle-tools"
            isActive={showTools}
            onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
            variant="plain"
          >
            <WrenchIcon />
          </ActionButton>
        </Tooltip>
      </ToolbarActions>
    </Toolbar>
  );
}

WorkflowOutputToolbar.propTypes = {
  job: shape().isRequired,
};

export default WorkflowOutputToolbar;
