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

  /*
   * A run nobody launched by hand, such as the project sync a job starts
   * before it runs, has no user or schedule behind it; the API names what
   * started it in launched_by instead, which reads better than an empty
   * detail. The generated schema types that field as a string, but the
   * serializer returns the resource's id, name and type.
   */
  const getLaunchingResource = (): { link?: string; value?: string } => {
    // Only for the runs another run starts on its own behalf. A job a
    // workflow ran keeps its detail hidden, as it always has.
    const launchedBy = (job as { launched_by?: unknown }).launched_by;
    if (
      !['sync', 'dependency', 'scm'].includes(job.launch_type ?? '') ||
      !launchedBy ||
      typeof launchedBy !== 'object'
    ) {
      return {};
    }
    const { id, name, type } = launchedBy as {
      id?: number;
      name?: string;
      type?: string;
    };
    const paths: Record<string, string> = {
      user: `/users/${id}/details`,
      project: `/projects/${id}/details`,
      job_template: `/templates/job_template/${id}/details`,
      workflow_job_template: `/templates/workflow_job_template/${id}/details`,
    };
    return { link: (type && paths[type]) || undefined, value: name };
  };

  const getLaunchedByDetails = () => {
    const {
      created_by: createdBy,
      job_template: jobTemplate,
      workflow_job_template: workflowJT,
      schedule,
    } = job.summary_fields ?? ({} as SummaryFields);

    if (!createdBy && !schedule) {
      return getLaunchingResource();
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
