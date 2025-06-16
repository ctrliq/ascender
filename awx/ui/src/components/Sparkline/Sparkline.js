import React from 'react';
import { arrayOf } from 'prop-types';

import { Link as _Link } from 'react-router-dom';
import { Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { formatDateString } from 'util/dates';
import { Job } from 'types';
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

const Sparkline = ({ jobs }) => {
  const { i18n } = useLingui();
  const generateTooltip = (job) => (
    <>
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

  const statusIcons = jobs.map((job) => (
    <Tooltip position="top" content={generateTooltip(job)} key={job.id}>
      <Link
        aria-label={i18n._(msg`View job ${job.id}`)}
        to={`/jobs/${JOB_TYPE_URL_SEGMENTS[job.type]}/${job.id}`}
      >
        <StatusIcon status={job.status} />
      </Link>
    </Tooltip>
  ));

  return <Wrapper>{statusIcons}</Wrapper>;
};

Sparkline.propTypes = {
  jobs: arrayOf(Job),
};
Sparkline.defaultProps = {
  jobs: [],
};

export default Sparkline;
