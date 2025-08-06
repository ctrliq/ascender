import React from 'react';
import { Link } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import getScheduleUrl from 'util/getScheduleUrl';
import Detail from './Detail';

const getLaunchedByDetails = (job, i18n) => {
  const {
    created_by: createdBy,
    job_template: jobTemplate,
    workflow_job_template: workflowJT,
    schedule,
  } = job.summary_fields;

  if (!createdBy && !schedule) {
    return {};
  }

  let link;
  let value;

  switch (job.launch_type) {
    case 'webhook':
      value = i18n._(t`Webhook`);
      link =
        (jobTemplate && `/templates/job_template/${jobTemplate.id}/details`) ||
        (workflowJT &&
          `/templates/workflow_job_template/${workflowJT.id}/details`);
      break;
    case 'scheduled':
      value = schedule.name;
      link = getScheduleUrl(job);
      break;
    case 'manual':
      link = `/users/${createdBy.id}/details`;
      value = createdBy.username;
      break;
    default:
      link = createdBy && `/users/${createdBy.id}/details`;
      value = createdBy && createdBy.username;
      break;
  }

  return { link, value };
};

export default function LaunchedByDetail({ job, dataCy = null }) {
  const { i18n } = useLingui();
  const { value: launchedByValue, link: launchedByLink } =
    getLaunchedByDetails(job, i18n) || {};

  return (
    <Detail
      dataCy={dataCy}
      label={i18n._(t`Launched By`)}
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
