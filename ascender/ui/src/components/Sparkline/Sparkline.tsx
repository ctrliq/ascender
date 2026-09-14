import type { RecentJob } from 'types/api';
import React from 'react';

import { Link } from 'react-router';
import { Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { formatDateString } from 'util/dates';
import StatusIcon from '../StatusIcon';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';
import './Sparkline.css';

export interface SparklineProps {
  jobs?: RecentJob[];
  [key: string]: unknown;
}

const Sparkline = ({ jobs = [] }: SparklineProps) => {
  const { t } = useLingui();
  const generateTooltip = (job: RecentJob) => (
    <>
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

  const statusIcons = jobs.map((job) => (
    <Tooltip position="top" content={generateTooltip(job)} key={job.id}>
      <Link
        className="ascender-sparkline__link"
        aria-label={t`View job ${job.id}`}
        to={`/jobs/${JOB_TYPE_URL_SEGMENTS[job.type as string]}/${job.id}`}
      >
        <StatusIcon status={job.status as string} />
      </Link>
    </Tooltip>
  ));

  return <div className="ascender-sparkline__wrapper">{statusIcons}</div>;
};

export default Sparkline;
