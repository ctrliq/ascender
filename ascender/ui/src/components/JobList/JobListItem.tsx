import type {
  JobStack,
  JobStatusGroup,
  SummaryFieldRef,
  UnifiedJob,
} from 'types/api';
import React from 'react';
import { Link } from 'react-router';

import type { QSConfig, QSParams } from 'util/qs';

import { useLingui } from '@lingui/react/macro';
import { Label, Button } from '@patternfly/react-core';

import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { RocketIcon } from '@patternfly/react-icons';
import { formatDateString } from 'util/dates';
import {
  canForceRelaunchNodeSuccess,
  canOverwriteRelaunchVars,
  isJobRunning,
} from 'util/jobs';
import getScheduleUrl from 'util/getScheduleUrl';
import { ActionsTd, ActionItem, TdBreakWord } from '../PaginatedTable';
import {
  LaunchButton,
  ReLaunchDropDown,
  WorkflowReLaunchDropDown,
} from '../LaunchButton';
import StatusLabel from '../StatusLabel';
import {
  DetailList,
  Detail,
  DeletedDetail,
  LaunchedByDetail,
} from '../DetailList';
import ChipGroup from '../ChipGroup';
import CredentialChip from '../CredentialChip';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';
import JobCancelButton from '../JobCancelButton';
import StackCancelButton from './StackCancelButton';
import {
  buildStatusFilteredUrl,
  buildTemplateFilteredUrl,
  STACK_STATUS_ORDER,
  type StackStatus,
} from './stacks';
import useJobTypeLabels from './useJobTypeLabels';
import './JobListItem.css';

export interface JobListItemProps {
  isExpanded: boolean;
  onExpand: () => void;
  job: UnifiedJob;
  rowIndex: number;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  showTypeColumn?: boolean;
  isSuperUser?: boolean;
  /** The source types the api offers, as value and label pairs. */
  inventorySourceLabels: [string | number | null, string][];
  /** Query string configuration, needed to build stack links. */
  qsConfig?: QSConfig;
  /** The current search string, needed to build stack links. */
  search?: string;
  /** Parsed query params, needed by the stack cancel request. */
  params?: QSParams;
  [key: string]: unknown;
}

function JobListItem({
  isExpanded,
  onExpand,
  job,
  rowIndex,
  isSelected,
  onSelect,
  showTypeColumn = false,
  isSuperUser = false,
  inventorySourceLabels,
  qsConfig,
  search,
  params,
}: JobListItemProps) {
  const { t } = useLingui();
  const jobTypes = useJobTypeLabels(job.job_type);
  const labelId = `check-action-${job.id}`;

  if (job.stack && qsConfig && search && params) {
    return (
      <StackRow
        job={job as UnifiedJob & { stack: NonNullable<UnifiedJob['stack']> }}
        isExpanded={isExpanded}
        onExpand={onExpand}
        showTypeColumn={showTypeColumn}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );
  }

  if (job.status_group && qsConfig && search) {
    return (
      <StatusGroupRow
        job={job as UnifiedJob & { status_group: JobStatusGroup }}
        showTypeColumn={showTypeColumn}
        qsConfig={qsConfig}
        search={search}
      />
    );
  }

  // a workflow that did not fully succeed (failed / errored / canceled) offers
  // the relaunch-from-failed dropdown so successful nodes can be skipped
  const isWorkflowFromFailed =
    job.type === 'workflow_job' &&
    ['failed', 'error', 'canceled'].includes(job.status);

  const {
    credentials,
    execution_environment,
    inventory,
    job_template,
    labels,
    project,
    schedule,
    source_workflow_job,
    workflow_job_template,
  } = job.summary_fields;

  const {
    job_slice_number: jobSliceNumber,
    job_slice_count: jobSliceCount,
    is_sliced_job: isSlicedJob,
  } = job;

  return (
    <>
      <Tr id={`job-row-${job.id}`} ouiaId={`job-row-${job.id}`}>
        <Td
          expand={{
            rowIndex: job.id,
            isExpanded,
            onToggle: onExpand,
          }}
        />
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={t`Select`}
        />
        <Td dataLabel={t`ID`} modifier="fitContent">
          {job.id}
        </Td>
        <TdBreakWord id={labelId} dataLabel={t`Name`}>
          <span>
            <Link to={`/jobs/${JOB_TYPE_URL_SEGMENTS[job.type]}/${job.id}`}>
              <b>{job.name || job.id}</b>
            </Link>
          </span>
        </TdBreakWord>
        <Td dataLabel={t`Status`}>
          {job.status && <StatusLabel status={job.status} />}
        </Td>
        {showTypeColumn && (
          <Td dataLabel={t`Type`}>
            {jobTypes[job.type as keyof typeof jobTypes]}
          </Td>
        )}
        <Td dataLabel={t`Start Time`}>{formatDateString(job.started)}</Td>
        <Td dataLabel={t`Finish Time`}>
          {job.finished ? formatDateString(job.finished) : ''}
        </Td>
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem
            visible={
              ['pending', 'waiting', 'running'].includes(job.status) &&
              (job.type === 'system_job' ? isSuperUser : true)
            }
          >
            <JobCancelButton
              job={job}
              errorTitle={t`Job Cancel Error`}
              title={t`Cancel ${job.name}`}
              errorMessage={t`Failed to cancel ${job.name}`}
              showIconButton
            />
          </ActionItem>
          <ActionItem
            visible={
              job.type !== 'system_job' &&
              job.summary_fields?.user_capabilities?.start
            }
            tooltip={(() => {
              if (job.status === 'failed' && job.type === 'job') {
                return t`Relaunch using host parameters`;
              }
              return t`Relaunch Job`;
            })()}
          >
            {job.status === 'failed' && job.type === 'job' && (
              <LaunchButton resource={job}>
                {({ handleRelaunch, isLaunching }) => (
                  <ReLaunchDropDown
                    handleRelaunch={handleRelaunch}
                    isLaunching={isLaunching}
                    id={`relaunch-job-${job.id}`}
                  />
                )}
              </LaunchButton>
            )}
            {isWorkflowFromFailed && (
              <LaunchButton resource={job}>
                {({ handleRelaunch, isLaunching }) => (
                  <WorkflowReLaunchDropDown
                    handleRelaunch={handleRelaunch}
                    isLaunching={isLaunching}
                    id={`relaunch-workflow-${job.id}`}
                    ouiaId={`relaunch-workflow-${job.id}`}
                    status={job.status}
                    canOverwriteVars={canOverwriteRelaunchVars(job)}
                    canForceSuccess={canForceRelaunchNodeSuccess(job)}
                    jobId={job.id}
                  />
                )}
              </LaunchButton>
            )}
            {!(
              (job.status === 'failed' && job.type === 'job') ||
              isWorkflowFromFailed
            ) && (
              <LaunchButton resource={job}>
                {({ handleRelaunch, isLaunching }) => (
                  <Button
                    icon={<RocketIcon />}
                    ouiaId={`${job.id}-relaunch-button`}
                    variant="plain"
                    onClick={() => handleRelaunch()}
                    aria-label={t`Relaunch`}
                    isDisabled={isLaunching}
                  />
                )}
              </LaunchButton>
            )}
          </ActionItem>
        </ActionsTd>
      </Tr>
      <Tr
        isExpanded={isExpanded}
        id={`expanded-job-row-${job.id}`}
        ouiaId={`expanded-job-row-${job.id}`}
      >
        <Td colSpan={2} />
        <Td colSpan={showTypeColumn ? 7 : 6}>
          <ExpandableRowContent>
            <DetailList>
              {job.type === 'inventory_update' && (
                <Detail
                  dataCy="job-inventory-source-type"
                  label={t`Source`}
                  value={inventorySourceLabels?.map(([value, label]) =>
                    value === job.source ? label : null
                  )}
                  isEmpty={inventorySourceLabels?.length === 0}
                />
              )}
              <LaunchedByDetail job={job} />
              {job.launch_type === 'scheduled' &&
                (schedule ? (
                  <Detail
                    dataCy="job-schedule"
                    label={t`Schedule`}
                    value={
                      <Link to={getScheduleUrl(job) as string}>
                        {schedule.name}
                      </Link>
                    }
                  />
                ) : (
                  <DeletedDetail label={t`Schedule`} />
                ))}
              {job_template && (
                <Detail
                  label={t`Job Template`}
                  value={
                    <Link to={`/templates/job_template/${job_template.id}`}>
                      {job_template.name}
                    </Link>
                  }
                />
              )}
              {workflow_job_template && (
                <Detail
                  label={t`Workflow Job Template`}
                  value={
                    <Link
                      to={`/templates/workflow_job_template/${workflow_job_template.id}`}
                    >
                      {workflow_job_template.name}
                    </Link>
                  }
                />
              )}
              {source_workflow_job && (
                <Detail
                  label={t`Source Workflow Job`}
                  value={
                    <Link to={`/jobs/workflow/${source_workflow_job.id}`}>
                      {source_workflow_job.id} - {source_workflow_job.name}
                    </Link>
                  }
                />
              )}
              {inventory && (
                <Detail
                  label={t`Inventory`}
                  value={
                    <Link
                      to={
                        inventory.kind === 'smart'
                          ? `/inventories/smart_inventory/${inventory.id}`
                          : `/inventories/inventory/${inventory.id}`
                      }
                    >
                      {inventory.name}
                    </Link>
                  }
                />
              )}
              {project && (
                <Detail
                  label={t`Project`}
                  value={
                    <Link to={`/projects/${project.id}/details`}>
                      {project.name}
                    </Link>
                  }
                  dataCy={`job-${job.id}-project`}
                />
              )}
              {job.type !== 'workflow_job' &&
                !isJobRunning(job.status) &&
                job.status !== 'canceled' && (
                  <ExecutionEnvironmentDetail
                    executionEnvironment={execution_environment}
                    verifyMissingVirtualEnv={false}
                    dataCy={`execution-environment-detail-${job.id}`}
                  />
                )}
              {credentials && (
                <Detail
                  fullWidth
                  label={t`Credentials`}
                  dataCy={`job-${job.id}-credentials`}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={credentials?.length ?? 0}
                      ouiaId={`job-${job.id}-credential-chips`}
                    >
                      {credentials.map((c: SummaryFieldRef) => (
                        <CredentialChip
                          credential={c}
                          isReadOnly
                          key={c.id}
                          ouiaId={`credential-${c.id}-chip`}
                        />
                      ))}
                    </ChipGroup>
                  }
                  isEmpty={credentials.length === 0}
                />
              )}
              {labels && (labels.count ?? 0) > 0 && (
                <Detail
                  fullWidth
                  label={t`Labels`}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={labels.results?.length ?? 0}
                      ouiaId={`job-${job.id}-label-chips`}
                    >
                      {labels.results.map((l: SummaryFieldRef) => (
                        <Label
                          variant="outline"
                          key={l.id}

                          data-ouia-component-id={`label-${l.id}-chip`}
                        >
                          {l.name}
                        </Label>
                      ))}
                    </ChipGroup>
                  }
                />
              )}
              {job.job_explanation && (
                <Detail
                  fullWidth
                  label={t`Explanation`}
                  value={job.job_explanation}
                />
              )}
              {typeof jobSliceNumber === 'number' &&
                typeof jobSliceCount === 'number' && (
                  <Detail
                    label={t`Job Slice`}
                    value={`${jobSliceNumber}/${jobSliceCount}`}
                  />
                )}
              {job.type === 'workflow_job' && isSlicedJob && (
                <Detail label={t`Job Slice Parent`} value={t`True`} />
              )}
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </>
  );
}

interface StackRowProps {
  job: UnifiedJob & { stack: JobStack };
  isExpanded: boolean;
  onExpand: () => void;
  showTypeColumn: boolean;
  qsConfig: QSConfig;
  search: string;
  params: QSParams;
}

function StackRow({
  job,
  isExpanded,
  onExpand,
  showTypeColumn,
  qsConfig,
  search,
  params,
}: StackRowProps) {
  const { t } = useLingui();
  const jobTypes = useJobTypeLabels(job.job_type);
  const stack = job.stack;
  const stackUrl = buildTemplateFilteredUrl(
    qsConfig,
    search,
    stack.template.id
  );

  return (
    <>
      <Tr id={`job-row-${job.id}`} ouiaId={`job-row-${job.id}`}>
        <Td
          expand={{
            rowIndex: job.id,
            isExpanded,
            onToggle: onExpand,
          }}
        />
        <Td dataLabel={t`Select`} />
        <Td dataLabel={t`ID`} modifier="fitContent">
          {job.id}
        </Td>
        <TdBreakWord dataLabel={t`Name`}>
          <span>
            <Link to={stackUrl}>
              <b>{job.name || job.id}</b>
            </Link>
          </span>
        </TdBreakWord>
        <Td dataLabel={t`Status`}>
          <div className="stack-status-chips">
            {STACK_STATUS_ORDER.map((status: StackStatus) => {
              const count = stack.status_counts[status];
              if (!count) return null;
              return <StatusLabel key={status} status={status} count={count} />;
            })}
          </div>
        </Td>
        {showTypeColumn && (
          <Td dataLabel={t`Type`}>
            {jobTypes[job.type as keyof typeof jobTypes]}
          </Td>
        )}
        <Td dataLabel={t`Start Time`}>{formatDateString(job.started)}</Td>
        <Td dataLabel={t`Finish Time`} />
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem visible>
            <StackCancelButton
              templateId={stack.template.id}
              templateName={stack.template.name}
              count={stack.count}
              params={params}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      <Tr
        isExpanded={isExpanded}
        id={`expanded-job-row-${job.id}`}
        ouiaId={`expanded-job-row-${job.id}`}
      >
        <Td colSpan={2} />
        <Td colSpan={showTypeColumn ? 7 : 6}>
          <ExpandableRowContent>
            <DetailList>
              <Detail
                label={t`Job Template`}
                value={
                  stack.template.name ? (
                    <Link
                      to={`/templates/${
                        job.type === 'workflow_job'
                          ? 'workflow_job_template'
                          : 'job_template'
                      }/${stack.template.id}`}
                    >
                      {stack.template.name}
                    </Link>
                  ) : (
                    `Template ${stack.template.id}`
                  )
                }
              />
              {stack.template.project && (
                <Detail
                  label={t`Project`}
                  value={
                    <Link to={`/projects/${stack.template.project.id}/details`}>
                      {stack.template.project.name}
                    </Link>
                  }
                />
              )}
              {stack.template.organization && (
                <Detail
                  label={t`Organization`}
                  value={
                    <Link
                      to={`/organizations/${stack.template.organization.id}/details`}
                    >
                      {stack.template.organization.name}
                    </Link>
                  }
                />
              )}
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </>
  );
}

interface StatusGroupRowProps {
  job: UnifiedJob & { status_group: JobStatusGroup };
  showTypeColumn: boolean;
  qsConfig: QSConfig;
  search: string;
}

function StatusGroupRow({
  job,
  showTypeColumn,
  qsConfig,
  search,
}: StatusGroupRowProps) {
  const { t } = useLingui();
  const group = job.status_group;
  const groupUrl = buildStatusFilteredUrl(
    qsConfig,
    search,
    group.status as StackStatus
  );
  const groupTitles = {
    new: t`New jobs`,
    waiting: t`Waiting jobs`,
    pending: t`Pending jobs`,
    running: t`Running jobs`,
  };
  const title =
    groupTitles[group.status as keyof typeof groupTitles] || group.status;

  return (
    <Tr
      id={`job-row-status-${group.status}`}
      ouiaId={`job-row-status-${group.status}`}
    >
      <Td />
      <Td dataLabel={t`Select`} />
      <Td dataLabel={t`ID`} modifier="fitContent" />
      <TdBreakWord dataLabel={t`Name`}>
        <span>
          <Link to={groupUrl}>
            <b>{title}</b>
          </Link>
        </span>
      </TdBreakWord>
      <Td dataLabel={t`Status`}>
        <StatusLabel status={group.status} count={group.count} />
      </Td>
      {showTypeColumn && <Td dataLabel={t`Type`} />}
      <Td dataLabel={t`Start Time`} />
      <Td dataLabel={t`Finish Time`} />
      <Td dataLabel={t`Actions`} />
    </Tr>
  );
}

export { JobListItem as _JobListItem };
export default JobListItem;
