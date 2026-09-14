import type {
  WorkflowAction,
  WorkflowState,
  WorkflowNode,
} from 'components/Workflow/workflowReducer';
import type { AnyJob } from 'types/api';
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
import StatusLabel from 'components/StatusLabel';
import { calculateElapsed, secondsToHHMMSS } from 'util/dates';
import JobCancelButton from 'components/JobCancelButton';
import DeleteButton from 'components/DeleteButton';
import {
  LaunchButton,
  WorkflowReLaunchDropDown,
} from 'components/LaunchButton';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import './WorkflowOutputToolbar.css';

// matches the 20px gap the job output toolbar puts before each info badge group

// width, spacing and hover styling come from ToolbarActions; only the toggled
// active state is specific to these buttons

export interface WorkflowOutputToolbarProps {
  job: AnyJob;
  onDelete?: () => void;
  isDeleteDisabled?: boolean;
  [key: string]: unknown;
}

function WorkflowOutputToolbar({
  job,
  onDelete = () => {},
  isDeleteDisabled = false,
}: WorkflowOutputToolbarProps) {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const navigate = useNavigate();
  const { nodes, showLegend, showTools } = useContext(
    WorkflowStateContext
  ) as WorkflowState;
  // The api names the template as an object here and as a list elsewhere.
  const workflowTemplate = job.summary_fields?.workflow_job_template as
    { id?: number } | { id?: number }[] | undefined;
  const workflowTemplateId = Array.isArray(workflowTemplate)
    ? workflowTemplate[0]?.id
    : workflowTemplate?.id;

  const [activeJobElapsedTime, setActiveJobElapsedTime] = React.useState(
    calculateElapsed(job.started)
  );

  React.useEffect(() => {
    let secTimer: ReturnType<typeof setInterval>;
    if (job.started && !job.finished) {
      secTimer = setInterval(() => {
        setActiveJobElapsedTime(calculateElapsed(job.started));
      }, 1000);
    }
    return () => clearInterval(secTimer);
  }, [job.started, job.finished]);

  const totalNodes =
    nodes.reduce(
      (n: number, node: WorkflowNode) => n + (node.isDeleted ? 0 : 1),
      0
    ) - 1;
  // a workflow that did not fully succeed (failed / errored / canceled) has
  // re-runnable nodes, so it gets the relaunch-from-failed dropdown
  const canRelaunchFromFailed = ['failed', 'error', 'canceled'].includes(
    job.status ?? ''
  );
  const navToWorkflow = () => {
    if (workflowTemplateId) {
      navigate(
        `/templates/workflow_job_template/${workflowTemplateId}/visualizer`
      );
    }
  };
  return (
    <div
      className="awx-workflow-output-toolbar__toolbar"
      id="workflow-output-toolbar"
    >
      <div className="awx-workflow-output-toolbar__job">
        <h1>{job.name}</h1>
        <StatusLabel status={job.status} />
      </div>
      <div className="awx-workflow-output-toolbar__actions">
        {workflowTemplateId && (
          <Tooltip content={t`Edit workflow`} position="top">
            <Button
              className="awx-workflow-output-toolbar__action-button"
              ouiaId="edit-workflow"
              aria-label={t`Edit workflow`}
              id="edit-workflow"
              variant="plain"
              onClick={navToWorkflow}
            >
              <ProjectDiagramIcon />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={t`Toggle Legend`} position="top">
          <Button
            id="workflow-output-toggle-legend"
            className={`awx-workflow-output-toolbar__action-button ${showLegend ? 'pf-m-active' : undefined}`}
            onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
            variant="plain"
          >
            <CompassIcon />
          </Button>
        </Tooltip>
        <Tooltip content={t`Toggle Tools`} position="top">
          <Button
            id="workflow-output-toggle-tools"
            className={`awx-workflow-output-toolbar__action-button ${showTools ? 'pf-m-active' : undefined}`}
            onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
            variant="plain"
          >
            <WrenchIcon />
          </Button>
        </Tooltip>

        <div className="awx-workflow-output-toolbar__badge-label">{t`Total Nodes`}</div>
        <PFBadge className="awx-workflow-output-toolbar__badge" isRead>
          {totalNodes}
        </PFBadge>

        <div className="awx-workflow-output-toolbar__badge-label">{t`Elapsed`}</div>
        <Tooltip content={t`Elapsed time that the job ran`} position="top">
          <PFBadge
            className="awx-workflow-output-toolbar__badge awx-workflow-output-toolbar__elapsed-badge"
            isRead
            id="workflow-elapsed-badge"
          >
            {job.finished && job.elapsed != null
              ? secondsToHHMMSS(Number(job.elapsed))
              : activeJobElapsedTime}
          </PFBadge>
        </Tooltip>

        {['new', 'pending', 'waiting', 'running'].includes(job?.status ?? '') &&
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
                  <Button
                    className="awx-workflow-output-toolbar__action-button"
                    ouiaId="workflow-output-relaunch-button"
                    variant="plain"
                    aria-label={t`Relaunch`}
                    isDisabled={isLaunching}
                    onClick={() => handleRelaunch()}
                  >
                    <RocketIcon />
                  </Button>
                </Tooltip>
              )}
            </LaunchButton>
          ))}

        {job?.summary_fields?.user_capabilities?.delete &&
          ['new', 'successful', 'failed', 'error', 'canceled'].includes(
            job.status ?? ''
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
      </div>
    </div>
  );
}

export default WorkflowOutputToolbar;
