import type { Project, SummaryFieldRef } from 'types/api';
import React, { useState, useCallback } from 'react';
import { Button, ClipboardCopy } from '@patternfly/react-core';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { formatDateString, timeOfDay } from 'util/dates';
import { ProjectsAPI } from 'api';
import { DetailList, Detail, DeletedDetail } from 'components/DetailList';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import StatusLabel from 'components/StatusLabel';
import { toTitleCase } from 'util/strings';
import { getRunActionLabels, isJobCancelable, isJobRunning } from 'util/jobs';
import useCanCancelSync from 'hooks/useCanCancelSync';
import CopyButton from 'components/CopyButton';
import JobCancelButton from 'components/JobCancelButton';
import Tooltip from 'components/Tooltip';
import ProjectSyncButton from '../shared/ProjectSyncButton';
import './ProjectListItem.css';

export interface ProjectListItemProps {
  isExpanded: boolean;
  onExpand: () => void;
  project: Project;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  onCopy: (id: number) => void;
  detailUrl: string;
  /** Re-reads the page once the copy has landed. */
  fetchProjects: () => unknown;
  rowIndex: number;
}

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
}: ProjectListItemProps) {
  const { t, i18n } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);

  const copyProject = useCallback(async () => {
    const response = await ProjectsAPI.copy(project.id, {
      name: `${project.name} @ ${timeOfDay()}`,
    });
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchProjects();
  }, [project.id, project.name, fetchProjects, onCopy]);

  const generateLastJobTooltip = (
    job: SummaryFieldRef & { status?: string; finished?: string | null }
  ) => (
    <>
      <div>{t`MOST RECENT SYNC`}</div>
      <div>
        {t`JOB ID:`} {job.id}
      </div>
      <div>
        {t`STATUS:`} {job.status?.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {t`FINISHED:`} {formatDateString(job.finished)}
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
    /* A sync under way: the revision the cell holds is about to be replaced,
       so it says what is happening rather than showing a revision that no
       longer stands. Only while the sync is unfinished, since a sync that
       ended in an error sends no finish time and so brings no read of the
       row, which kept a row saying Syncing long after its sync was over. */
    if (isJobRunning(project.summary_fields?.current_job?.status)) {
      return (
        <span
          className="ascender-project-list-item__label"
          aria-label={t`The project is syncing, and its revision follows the sync.`}
        >
          {t`Syncing`}
        </span>
      );
    }

    if (project.scm_revision) {
      return (
        <ClipboardCopy
          data-cy={`project-copy-revision-${project.id}`}
          variant="inline-compact"
          clickTip={t`Successfully copied to clipboard!`}
          hoverTip={t`Copy full revision to clipboard.`}
          onCopy={() =>
            navigator.clipboard.writeText(project.scm_revision.toString())
          }
        >
          {project.scm_revision.substring(0, 7)}
        </ClipboardCopy>
      );
    }

    return (
      <span
        className="ascender-project-list-item__label"
        aria-label={t`The project must be synced before a revision is available.`}
      >
        {t`Sync for revision`}
      </span>
    );
  };

  const labelId = `check-action-${project.id}`;

  let job = null;

  if (project.summary_fields?.current_job) {
    job = project.summary_fields.current_job;
  } else if (project.summary_fields?.last_job) {
    job = project.summary_fields.last_job;
  }
  const canCancelSync = useCanCancelSync(
    'project_update',
    job?.id,
    job?.status,
    project.summary_fields?.user_capabilities?.edit
  );

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
            isDisabled: isJobRunning(job?.status),
          }}
          dataLabel={t`Selected`}
        />
        <TdBreakWord id={labelId} dataLabel={t`Name`}>
          <span>
            <Link to={`${detailUrl}`}>
              <b>{project.name}</b>
            </Link>
          </span>
        </TdBreakWord>
        <Td dataLabel={t`Status`}>
          {job ? (
            <Tooltip
              position="top"
              content={generateLastJobTooltip(job)}
              key={job.id}
            >
              <Link to={`/runs/project/${job.id}`}>
                <StatusLabel status={job.status} />
              </Link>
            </Tooltip>
          ) : (
            <Tooltip
              position="top"
              content={t`Unable to load last job update`}
              key={project.id}
            >
              <StatusLabel status={project?.status} />
            </Tooltip>
          )}
        </Td>
        <Td dataLabel={t`Type`}>
          {project.scm_type === '' ? t`Manual` : toTitleCase(project.scm_type)}
        </Td>
        <Td dataLabel={t`Revision`}>{renderRevision()}</Td>
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem
            visible={project.summary_fields.user_capabilities?.edit}
            tooltip={t`Edit Project`}
          >
            <Button
              icon={<PencilAltIcon />}
              ouiaId={`${project.id}-edit-button`}
              isDisabled={isDisabled}
              aria-label={t`Edit Project`}
              variant="plain"
              component={Link}
              to={`/projects/${project.id}/edit`}
            />
          </ActionItem>
          <ActionItem
            tooltip={t`Copy Project`}
            visible={project.summary_fields.user_capabilities?.copy}
          >
            <CopyButton
              copyItem={copyProject}
              isDisabled={isDisabled}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              errorMessage={t`Failed to copy project.`}
            />
          </ActionItem>
          {/* Last, since a manual project has no sync: ahead of edit and copy
              it would leave those rows opening with an empty slot. */}
          {isJobCancelable(job?.status) ? (
            <ActionItem visible={canCancelSync}>
              <JobCancelButton
                job={{ id: job?.id, type: 'project_update' }}
                /* The shared wording for this kind of run, the one the runs
                   list and the run's own page use. */
                title={i18n._(getRunActionLabels('project_update').cancel)}
                showIconButton
              />
            </ActionItem>
          ) : (
            <ActionItem
              visible={project.summary_fields.user_capabilities?.start}
              tooltip={t`Sync Project`}
            >
              <ProjectSyncButton
                projectId={project.id}
                lastJobStatus={job && job.status}
              />
            </ActionItem>
          )}
        </ActionsTd>
      </Tr>
      <Tr isExpanded={isExpanded} id={`expanded-project-row-${project.id}`}>
        <Td colSpan={2} />
        <Td colSpan={5}>
          <ExpandableRowContent>
            <DetailList>
              <Detail
                label={t`Description`}
                value={project.description}
                dataCy={`project-${project.id}-description`}
              />
              {project.summary_fields.organization ? (
                <Detail
                  label={t`Organization`}
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
                <DeletedDetail label={t`Organization`} />
              )}
              <ExecutionEnvironmentDetail
                executionEnvironment={
                  project.summary_fields?.default_environment
                }
                isDefaultEnvironment
              />
              <Detail
                label={t`Last Modified`}
                value={formatDateString(project.modified)}
                dataCy={`project-${project.id}-last-modified`}
              />
              <Detail
                label={t`Last Used`}
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
