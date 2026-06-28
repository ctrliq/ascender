import React, { useContext } from 'react';
import { useNavigate } from 'react-router';
import { Badge as PFBadge, Button, Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import {
  CompassIcon,
  WrenchIcon,
  ProjectDiagramIcon,
  RocketIcon,
  TrashAltIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';
import StatusLabel from 'components/StatusLabel';
import { calculateElapsed, secondsToHHMMSS } from 'util/dates';
import JobCancelButton from 'components/JobCancelButton';
import DeleteButton from 'components/DeleteButton';
import { LaunchButton, WorkflowReLaunchDropDown } from 'components/LaunchButton';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';

const Toolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid var(--pf-v6-global--BorderColor--100);
  display: flex;
  height: 56px;
`;

const ToolbarJob = styled.div`
  display: inline-flex;
  align-items: center;

  h1 {
    font-weight: var(--pf-v6-global--FontWeight--bold);
  }
`;

const ToolbarActions = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: flex-end;

  /* uniform width/spacing for every action button (incl. the relaunch dropdown toggle, which is wider by default) */
  button {
    margin: 0px 6px;
    padding: 6px 10px;
    font-size: 1.1rem;
  }
  /* hover background only on enabled action buttons, so disabled controls
     (relaunch while launching, delete while disabled) don't look interactive
     (badges aren't buttons; modals portal out) */
  button:not(:disabled):not([aria-disabled='true']):hover {
    background-color: var(--pf-v6-global--primary-color--100);
    color: #fff;
  }
  /* whiten the icon; the dropdown toggle colors its icon separately */
  button:not(:disabled):not([aria-disabled='true']):hover svg {
    fill: #fff;
  }
`;

const Badge = styled(PFBadge)`
  align-items: center;
  display: flex;
  justify-content: center;
  margin-left: 10px;
  /* enlarge the badge value from PatternFly's small default */
  font-size: 14px;
`;

const ElapsedBadge = styled(Badge)`
  margin-right: 20px;
  min-width: 70px;
  font-variant-numeric: tabular-nums;
`;

// matches the 20px gap the job output toolbar puts before each info badge group
const BadgeLabel = styled.div`
  margin-left: 20px;
`;

// width, spacing and hover styling come from ToolbarActions; only the toggled
// active state is specific to these buttons
const ActionButton = styled(Button)`
  border: none;

  &.pf-m-active {
    background-color: var(--pf-v6-global--primary-color--100);
    color: #fff;
  }
`;
function WorkflowOutputToolbar({
  job,
  onDelete = () => {},
  isDeleteDisabled = false,
}) {
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
  // a workflow that did not fully succeed (failed / errored / canceled) has
  // re-runnable nodes, so it gets the relaunch-from-failed dropdown
  const canRelaunchFromFailed = ['failed', 'error', 'canceled'].includes(
    job.status
  );
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
        {workflowTemplateId && (
          <Tooltip content={t`Edit workflow`} position="top">
            <ActionButton
              ouiaId="edit-workflow"
              aria-label={t`Edit workflow`}
              id="edit-workflow"
              variant="plain"
              onClick={navToWorkflow}
            >
              <ProjectDiagramIcon />
            </ActionButton>
          </Tooltip>
        )}
        <Tooltip content={t`Toggle Legend`} position="top">
          <ActionButton
            id="workflow-output-toggle-legend"
            className={showLegend ? 'pf-m-active' : undefined}
            onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
            variant="plain"
          >
            <CompassIcon />
          </ActionButton>
        </Tooltip>
        <Tooltip content={t`Toggle Tools`} position="top">
          <ActionButton
            id="workflow-output-toggle-tools"
            className={showTools ? 'pf-m-active' : undefined}
            onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
            variant="plain"
          >
            <WrenchIcon />
          </ActionButton>
        </Tooltip>

        <BadgeLabel>{t`Total Nodes`}</BadgeLabel>
        <Badge isRead>{totalNodes}</Badge>

        <BadgeLabel>{t`Elapsed`}</BadgeLabel>
        <Tooltip content={t`Elapsed time that the job ran`} position="top">
          <ElapsedBadge isRead id="workflow-elapsed-badge">
            {job.finished && job.elapsed != null
              ? secondsToHHMMSS(job.elapsed)
              : activeJobElapsedTime}
          </ElapsedBadge>
        </Tooltip>

        {['new', 'pending', 'waiting', 'running'].includes(job?.status) &&
        job?.summary_fields?.user_capabilities?.start ? (
          <JobCancelButton
            job={job}
            errorTitle={t`Job Cancel Error`}
            title={t`Cancel ${job.name}`}
            errorMessage={t`Failed to cancel ${job.name}`}
            showIconButton
          />
        ) : null}

        {job?.summary_fields?.user_capabilities?.start &&
          (canRelaunchFromFailed ? (
            // Distinct key from the plain-rocket branch below: when a workflow is
            // canceled/fails live, the relaunch control swaps from rocket to
            // dropdown. Without different keys React reconciles the LaunchButtons
            // in place and the tooltip keeps a stale ref to the old button, so it
            // stops showing. A changed key remounts it and rebinds the ref.
            <LaunchButton key="relaunch-from-failed" resource={job}>
              {({ handleRelaunch, isLaunching }) => (
                // Tooltip on top (matches the job toolbar, clear of the
                // down-opening menu). Wrap the dropdown in a span so the tooltip
                // has a DOM ref to anchor to — the dropdown component does not
                // forward one, so an outer tooltip would silently not show.
                <Tooltip position="top" content={t`Relaunch Job`}>
                  <span>
                    <WorkflowReLaunchDropDown
                      handleRelaunch={handleRelaunch}
                      isLaunching={isLaunching}
                      id="workflow-output-relaunch"
                      ouiaId="workflow-output-relaunch"
                      status={job.status}
                    />
                  </span>
                </Tooltip>
              )}
            </LaunchButton>
          ) : (
            <LaunchButton key="relaunch-plain" resource={job}>
              {({ handleRelaunch, isLaunching }) => (
                <Tooltip position="top" content={t`Relaunch Job`}>
                  <ActionButton
                    ouiaId="workflow-output-relaunch-button"
                    variant="plain"
                    aria-label={t`Relaunch`}
                    isDisabled={isLaunching}
                    onClick={() => handleRelaunch()}
                  >
                    <RocketIcon />
                  </ActionButton>
                </Tooltip>
              )}
            </LaunchButton>
          ))}

        {job?.summary_fields?.user_capabilities?.delete &&
          ['new', 'successful', 'failed', 'error', 'canceled'].includes(
            job.status
          ) && (
            <Tooltip content={t`Delete Job`} position="top">
              <DeleteButton
                ouiaId="workflow-output-delete-button"
                name={job.name}
                modalTitle={t`Delete Job`}
                onConfirm={onDelete}
                variant="plain"
                isDisabled={isDeleteDisabled}
              >
                <TrashAltIcon />
              </DeleteButton>
            </Tooltip>
          )}
      </ToolbarActions>
    </Toolbar>
  );
}

export default WorkflowOutputToolbar;
