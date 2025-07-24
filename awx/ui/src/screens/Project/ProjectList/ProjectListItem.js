import 'styled-components/macro';
import React, { useState, useCallback } from 'react';
import { string, bool, func } from 'prop-types';
import { Button, ClipboardCopy, Tooltip } from '@patternfly/react-core';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';
import {
  PencilAltIcon,
  ExclamationTriangleIcon as PFExclamationTriangleIcon,
  UndoIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { formatDateString, timeOfDay } from 'util/dates';
import { ProjectsAPI } from 'api';
import { DetailList, Detail, DeletedDetail } from 'components/DetailList';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import StatusLabel from 'components/StatusLabel';
import { toTitleCase } from 'util/strings';
import { isJobRunning } from 'util/jobs';
import CopyButton from 'components/CopyButton';
import { Project } from 'types';
import JobCancelButton from 'components/JobCancelButton';
import ProjectSyncButton from '../shared/ProjectSyncButton';

const Label = styled.span`
  color: var(--pf-global--disabled-color--100);
`;

const ExclamationTriangleIcon = styled(PFExclamationTriangleIcon)`
  color: var(--pf-global--warning-color--100);
  margin-left: 18px;
`;

function ProjectListItem({
  isExpanded,
  onExpand,
  project,
  isSelected,
  onSelect,
  onCopy,
  detailUrl,
  fetchProjects,
  rowIndex,
  onRefreshRow,
}) {
  const { i18n } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);
  ProjectListItem.propTypes = {
    project: Project.isRequired,
    detailUrl: string.isRequired,
    isSelected: bool.isRequired,
    onSelect: func.isRequired,
  };

  const copyProject = useCallback(async () => {
    const response = await ProjectsAPI.copy(project.id, {
      name: `${project.name} @ ${timeOfDay()}`,
    });
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchProjects();
  }, [project.id, project.name, fetchProjects, onCopy]);

  const generateLastJobTooltip = (job) => (
    <>
      <div>{i18n._(msg`MOST RECENT SYNC`)}</div>
      <div>
        {i18n._(msg`JOB ID:`)} {job.id}
      </div>
      <div>
        {i18n._(msg`STATUS:`)} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {i18n._(msg`FINISHED:`)} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  const handleCopyStart = useCallback(() => {
    setIsDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsDisabled(false);
  }, []);

  const renderRevision = () => {
    if (!project.summary_fields?.current_job || project.scm_revision) {
      return project.scm_revision ? (
        <ClipboardCopy
          data-cy={`project-copy-revision-${project.id}`}
          variant="inline-compact"
          clickTip={i18n._(msg`Successfully copied to clipboard!`)}
          hoverTip={i18n._(msg`Copy full revision to clipboard.`)}
          onCopy={() =>
            navigator.clipboard.writeText(project.scm_revision.toString())
          }
        >
          {project.scm_revision.substring(0, 7)}
        </ClipboardCopy>
      ) : (
        <Label
          aria-label={i18n._(
            msg`The project must be synced before a revision is available.`
          )}
        >
          {i18n._(msg`Sync for revision`)}
        </Label>
      );
    }

    if (
      isJobRunning(project.summary_fields.current_job.status) &&
      !project.scm_revision
    ) {
      return (
        <Label
          aria-label={i18n._(
            msg`The project is currently syncing and the revision will be available after the sync is complete.`
          )}
        >
          {i18n._(msg`Syncing`)}
        </Label>
      );
    }

    return (
      <>
        <Label
          aria-label={i18n._(
            msg`The project revision is currently out of date.  Please refresh to fetch the most recent revision.`
          )}
        >
          {i18n._(msg`Refresh for revision`)}
        </Label>
        <Tooltip content={i18n._(msg`Refresh project revision`)}>
          <Button
            ouiaId={`project-refresh-revision-${project.id}`}
            variant="plain"
            onClick={() => onRefreshRow(project.id)}
          >
            <UndoIcon />
          </Button>
        </Tooltip>
      </>
    );
  };

  const labelId = `check-action-${project.id}`;

  const missingExecutionEnvironment =
    project.custom_virtualenv && !project.default_environment;

  let job = null;

  if (project.summary_fields?.current_job) {
    job = project.summary_fields.current_job;
  } else if (project.summary_fields?.last_job) {
    job = project.summary_fields.last_job;
  }

  return (
    <>
      <Tr id={`${project.id}`} ouiaId={`project-row-${project.id}`}>
        <Td
          expand={{
            rowIndex,
            isExpanded,
            onToggle: onExpand,
          }}
        />
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
            disable: isJobRunning(job?.status),
          }}
          dataLabel={i18n._(msg`Selected`)}
        />
        <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
          <span>
            <Link to={`${detailUrl}`}>
              <b>{project.name}</b>
            </Link>
          </span>
          {missingExecutionEnvironment && (
            <span>
              <Tooltip
                content={i18n._(
                  msg`Custom virtual environment ${project.custom_virtualenv} must be replaced by an execution environment.`
                )}
                position="right"
                className="missing-execution-environment"
              >
                <ExclamationTriangleIcon />
              </Tooltip>
            </span>
          )}
        </TdBreakWord>
        <Td dataLabel={i18n._(msg`Status`)}>
          {job ? (
            <Tooltip
              position="top"
              content={generateLastJobTooltip(job)}
              key={job.id}
            >
              <Link to={`/jobs/project/${job.id}`}>
                <StatusLabel status={job.status} />
              </Link>
            </Tooltip>
          ) : (
            <Tooltip
              position="top"
              content={i18n._(msg`Unable to load last job update`)}
              key={project.id}
            >
              <StatusLabel status={project?.status} />
            </Tooltip>
          )}
        </Td>
        <Td dataLabel={i18n._(msg`Type`)}>
          {project.scm_type === ''
            ? i18n._(msg`Manual`)
            : toTitleCase(project.scm_type)}
        </Td>
        <Td dataLabel={i18n._(msg`Revision`)}>{renderRevision()}</Td>
        <ActionsTd dataLabel={i18n._(msg`Actions`)}>
          {['running', 'pending', 'waiting'].includes(job?.status) ? (
            <ActionItem
              visible={project.summary_fields.user_capabilities.start}
            >
              <JobCancelButton
                job={{ id: job.id, type: 'project_update' }}
                errorTitle={i18n._(msg`Project Sync Error`)}
                title={i18n._(msg`Cancel Project Sync`)}
                showIconButton
                errorMessage={i18n._(msg`Failed to cancel Project Sync`)}
              />
            </ActionItem>
          ) : (
            <ActionItem
              visible={project.summary_fields.user_capabilities.start}
              tooltip={i18n._(msg`Sync Project`)}
            >
              <ProjectSyncButton
                projectId={project.id}
                lastJobStatus={job && job.status}
              />
            </ActionItem>
          )}
          <ActionItem
            visible={project.summary_fields.user_capabilities.edit}
            tooltip={i18n._(msg`Edit Project`)}
          >
            <Button
              ouiaId={`${project.id}-edit-button`}
              isDisabled={isDisabled}
              aria-label={i18n._(msg`Edit Project`)}
              variant="plain"
              component={Link}
              to={`/projects/${project.id}/edit`}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
          <ActionItem
            tooltip={i18n._(msg`Copy Project`)}
            visible={project.summary_fields.user_capabilities.copy}
          >
            <CopyButton
              copyItem={copyProject}
              isDisabled={isDisabled}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              errorMessage={i18n._(msg`Failed to copy project.`)}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      <Tr isExpanded={isExpanded} id={`expanded-project-row-${project.id}`}>
        <Td colSpan={2} />
        <Td colSpan={5}>
          <ExpandableRowContent>
            <DetailList>
              <Detail
                label={i18n._(msg`Description`)}
                value={project.description}
                dataCy={`project-${project.id}-description`}
              />
              {project.summary_fields.organization ? (
                <Detail
                  label={i18n._(msg`Organization`)}
                  value={
                    <Link
                      to={`/organizations/${project.summary_fields.organization.id}/details`}
                    >
                      {project.summary_fields.organization.name}
                    </Link>
                  }
                  dataCy={`project-${project.id}-organization`}
                />
              ) : (
                <DeletedDetail label={i18n._(msg`Organization`)} />
              )}
              <ExecutionEnvironmentDetail
                virtualEnvironment={project.custom_virtualenv}
                executionEnvironment={
                  project.summary_fields?.default_environment
                }
                isDefaultEnvironment
              />
              <Detail
                label={i18n._(msg`Last modified`)}
                value={formatDateString(project.modified)}
                dataCy={`project-${project.id}-last-modified`}
              />
              <Detail
                label={i18n._(msg`Last used`)}
                value={formatDateString(project.last_job_run)}
                dataCy={`project-${project.id}-last-used`}
              />
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </>
  );
}
export default ProjectListItem;
