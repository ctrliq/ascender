import type { RecentJob } from 'types/api';
import React from 'react';

import { Link as _Link } from 'react-router';
import { Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import { formatDateString } from 'util/dates';
import StatusIcon from '../StatusIcon';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';

/* eslint-disable react/jsx-pascal-case */
const Link = styled((props) => <_Link {...props} />)`
  margin-right: 5px;
`;

const Wrapper = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
`;
/* eslint-enable react/jsx-pascal-case */

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
        aria-label={t`View job ${job.id}`}
        to={`/jobs/${JOB_TYPE_URL_SEGMENTS[job.type as string]}/${job.id}`}
      >
        <StatusIcon status={job.status as string} />
      </Link>
    </Tooltip>
  ));

  return <Wrapper>{statusIcons}</Wrapper>;
};

export default Sparkline;
