import type { SystemJobTemplate } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { useConfig } from 'contexts/Config';
import { CardActionsRow, CardBody } from 'components/Card';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import StatusLabel from 'components/StatusLabel';
import { formatDateString } from 'util/dates';
import ManagementJobLaunchButton from '../ManagementJobLaunchButton';

/** The summary fields this screen reads off a cleanup job. */
interface CleanupJobSummary {
  last_job?: { id: number; status: string };
  resolved_environment?: { id: number; name: string };
}

export interface ManagementJobDetailProps {
  systemJobTemplate: SystemJobTemplate;
}

/**
 * What a cleanup job is, and when it last ran and runs next.
 *
 * Nothing here is editable: the api creates these and takes no changes to them,
 * so the one action is Launch, where every runnable resource keeps its own at
 * the foot of its details.
 */
function ManagementJobDetail({ systemJobTemplate }: ManagementJobDetailProps) {
  const { t } = useLingui();
  const { name, description, last_job_run, next_job_run, created, modified } =
    systemJobTemplate;
  const summary = (systemJobTemplate.summary_fields ?? {}) as CleanupJobSummary;
  const lastJob = summary.last_job;
  const environment = summary.resolved_environment;
  const { me } = useConfig();

  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail
          label={t`Last Job Status`}
          value={
            lastJob && (
              <Link to={`/runs/management/${lastJob.id}/output`}>
                <StatusLabel status={lastJob.status} />
              </Link>
            )
          }
          dataCy="management-job-detail-last-status"
        />
        <Detail
          label={t`Name`}
          value={name}
          dataCy="management-job-detail-name"
        />
        <Detail
          label={t`Description`}
          value={description}
          dataCy="management-job-detail-description"
        />
        <Detail
          label={t`Execution Environment`}
          value={
            environment && (
              <Link to={`/execution_environments/${environment.id}/details`}>
                {environment.name}
              </Link>
            )
          }
          dataCy="management-job-detail-execution-environment"
        />
        <Detail
          label={t`Last Run`}
          value={last_job_run ? formatDateString(last_job_run) : null}
          dataCy="management-job-detail-last-run"
        />
        <Detail
          label={t`Next Run`}
          value={next_job_run ? formatDateString(next_job_run) : null}
          dataCy="management-job-detail-next-run"
        />
        <UserDateDetail label={t`Created`} date={created} />
        <UserDateDetail label={t`Last Modified`} date={modified} />
      </DetailList>
      {me?.is_superuser && (
        <CardActionsRow>
          <ManagementJobLaunchButton
            systemJobTemplate={systemJobTemplate}
            ouiaId="management-job-detail-launch-button"
          />
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default ManagementJobDetail;
