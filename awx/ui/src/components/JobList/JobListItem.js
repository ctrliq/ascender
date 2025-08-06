import React from 'react';
import { Link } from 'react-router-dom';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Button, Chip } from '@patternfly/react-core';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { RocketIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { formatDateString } from 'util/dates';
import { isJobRunning } from 'util/jobs';
import getScheduleUrl from 'util/getScheduleUrl';
import { ActionsTd, ActionItem, TdBreakWord } from '../PaginatedTable';
import { LaunchButton, ReLaunchDropDown } from '../LaunchButton';
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

const Dash = styled.span``;
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
}) {
  const { i18n } = useLingui();
  const labelId = `check-action-${job.id}`;

  const jobTypes = {
    project_update: i18n._(t`Source Control Update`),
    inventory_update: i18n._(t`Inventory Sync`),
    job:
      job.job_type === 'check'
        ? i18n._(t`Playbook Check`)
        : i18n._(t`Playbook Run`),
    ad_hoc_command: i18n._(t`Command`),
    system_job: i18n._(t`Management Job`),
    workflow_job: i18n._(t`Workflow Job`),
  };

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
          dataLabel={i18n._(t`Select`)}
        />
        <TdBreakWord id={labelId} dataLabel={i18n._(t`Name`)}>
          <span>
            <Link to={`/jobs/${JOB_TYPE_URL_SEGMENTS[job.type]}/${job.id}`}>
              <b>
                {job.id} <Dash>&mdash;</Dash> {job.name}
              </b>
            </Link>
          </span>
        </TdBreakWord>
        <Td dataLabel={i18n._(t`Status`)}>
          {job.status && <StatusLabel status={job.status} />}
        </Td>
        {showTypeColumn && (
          <Td dataLabel={i18n._(t`Type`)}>{jobTypes[job.type]}</Td>
        )}
        <Td dataLabel={i18n._(t`Start Time`)}>
          {formatDateString(job.started)}
        </Td>
        <Td dataLabel={i18n._(t`Finish Time`)}>
          {job.finished ? formatDateString(job.finished) : ''}
        </Td>
        <ActionsTd dataLabel={i18n._(t`Actions`)}>
          <ActionItem
            visible={
              ['pending', 'waiting', 'running'].includes(job.status) &&
              (job.type === 'system_job' ? isSuperUser : true)
            }
          >
            <JobCancelButton
              job={job}
              errorTitle={i18n._(t`Job Cancel Error`)}
              title={i18n._(t`Cancel ${job.name}`)}
              errorMessage={i18n._(t`Failed to cancel ${job.name}`)}
              showIconButton
            />
          </ActionItem>
          <ActionItem
            visible={
              job.type !== 'system_job' &&
              job.summary_fields?.user_capabilities?.start
            }
            tooltip={
              job.status === 'failed' && job.type === 'job'
                ? i18n._(t`Relaunch using host parameters`)
                : i18n._(t`Relaunch Job`)
            }
          >
            {job.status === 'failed' && job.type === 'job' ? (
              <LaunchButton resource={job}>
                {({ handleRelaunch, isLaunching }) => (
                  <ReLaunchDropDown
                    handleRelaunch={handleRelaunch}
                    isLaunching={isLaunching}
                    id={`relaunch-job-${job.id}`}
                  />
                )}
              </LaunchButton>
            ) : (
              <LaunchButton resource={job}>
                {({ handleRelaunch, isLaunching }) => (
                  <Button
                    ouiaId={`${job.id}-relaunch-button`}
                    variant="plain"
                    onClick={() => handleRelaunch()}
                    aria-label={i18n._(t`Relaunch`)}
                    isDisabled={isLaunching}
                  >
                    <RocketIcon />
                  </Button>
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
        <Td colSpan={showTypeColumn ? 6 : 5}>
          <ExpandableRowContent>
            <DetailList>
              {job.type === 'inventory_update' && (
                <Detail
                  dataCy="job-inventory-source-type"
                  label={i18n._(t`Source`)}
                  value={inventorySourceLabels?.map(([string, label]) =>
                    string === job.source ? label : null
                  )}
                  isEmpty={inventorySourceLabels?.length === 0}
                />
              )}
              <LaunchedByDetail job={job} />
              {job.launch_type === 'scheduled' &&
                (schedule ? (
                  <Detail
                    dataCy="job-schedule"
                    label={i18n._(t`Schedule`)}
                    value={
                      <Link to={getScheduleUrl(job)}>{schedule.name}</Link>
                    }
                  />
                ) : (
                  <DeletedDetail label={i18n._(t`Schedule`)} />
                ))}
              {job_template && (
                <Detail
                  label={i18n._(t`Job Template`)}
                  value={
                    <Link to={`/templates/job_template/${job_template.id}`}>
                      {job_template.name}
                    </Link>
                  }
                />
              )}
              {workflow_job_template && (
                <Detail
                  label={i18n._(t`Workflow Job Template`)}
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
                  label={i18n._(t`Source Workflow Job`)}
                  value={
                    <Link to={`/jobs/workflow/${source_workflow_job.id}`}>
                      {source_workflow_job.id} - {source_workflow_job.name}
                    </Link>
                  }
                />
              )}
              {inventory && (
                <Detail
                  label={i18n._(t`Inventory`)}
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
                  label={i18n._(t`Project`)}
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
                  label={i18n._(t`Credentials`)}
                  dataCy={`job-${job.id}-credentials`}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={credentials.length}
                      ouiaId={`job-${job.id}-credential-chips`}
                    >
                      {credentials.map((c) => (
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
              {labels && labels.count > 0 && (
                <Detail
                  fullWidth
                  label={i18n._(t`Labels`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={labels.results.length}
                      ouiaId={`job-${job.id}-label-chips`}
                    >
                      {labels.results.map((l) => (
                        <Chip
                          key={l.id}
                          isReadOnly
                          ouiaId={`label-${l.id}-chip`}
                        >
                          {l.name}
                        </Chip>
                      ))}
                    </ChipGroup>
                  }
                />
              )}
              {job.job_explanation && (
                <Detail
                  fullWidth
                  label={i18n._(t`Explanation`)}
                  value={job.job_explanation}
                />
              )}
              {typeof jobSliceNumber === 'number' &&
                typeof jobSliceCount === 'number' && (
                  <Detail
                    label={i18n._(t`Job Slice`)}
                    value={`${jobSliceNumber}/${jobSliceCount}`}
                  />
                )}
              {job.type === 'workflow_job' && isSlicedJob && (
                <Detail
                  label={i18n._(t`Job Slice Parent`)}
                  value={i18n._(t`True`)}
                />
              )}
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </>
  );
}

export { JobListItem as _JobListItem };
export default JobListItem;
