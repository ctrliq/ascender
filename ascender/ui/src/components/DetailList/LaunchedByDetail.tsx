import type { AnyJob, SummaryFields } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import getScheduleUrl from 'util/getScheduleUrl';
import Detail from './Detail';

export interface LaunchedByDetailProps {
  /** A job of any kind: what it reports here is the same for all of them. */
  job: AnyJob;
  dataCy?: string;
}

export default function LaunchedByDetail({
  job,
  dataCy,
}: LaunchedByDetailProps) {
  const { t } = useLingui();

  const getLaunchedByDetails = () => {
    const {
      created_by: createdBy,
      job_template: jobTemplate,
      workflow_job_template: workflowJT,
      schedule,
    } = job.summary_fields ?? ({} as SummaryFields);

    if (!createdBy && !schedule) {
      return {};
    }

    let link;
    let value;

    switch (job.launch_type) {
      case 'webhook':
        value = t`Webhook`;
        link =
          (jobTemplate &&
            `/templates/job_template/${jobTemplate.id}/details`) ||
          (workflowJT &&
            `/templates/workflow_job_template/${workflowJT.id}/details`);
        break;
      case 'scheduled':
        value = schedule?.name;
        link = getScheduleUrl(job);
        break;
      case 'manual':
        link = `/users/${createdBy?.id}/details`;
        value = createdBy?.username;
        break;
      default:
        link = createdBy && `/users/${createdBy.id}/details`;
        value = createdBy && createdBy.username;
        break;
    }

    return { link, value };
  };

  const { value: launchedByValue, link: launchedByLink } =
    getLaunchedByDetails() || {};

  return (
    <Detail
      dataCy={dataCy}
      label={t`Launched By`}
      value={
        launchedByLink ? (
          <Link to={`${launchedByLink}`}>{launchedByValue}</Link>
        ) : (
          launchedByValue
        )
      }
    />
  );
}
