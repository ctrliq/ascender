import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import 'styled-components/macro';
import { msg } from '@lingui/macro';
import {
  SearchIcon,
  ExclamationCircleIcon as PFExclamationCircleIcon,
} from '@patternfly/react-icons';
import ContentEmpty from 'components/ContentEmpty';
import { useLingui } from '@lingui/react';

import styled from 'styled-components';

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  color: var(--pf-global--danger-color--100);
`;

export default function EmptyOutput({
  hasQueryParams,
  isJobRunning,
  onUnmount,
  job,
}) {
  const { i18n } = useLingui();
  let title;
  let message;
  let icon;
  const { typeSegment, id } = useParams();

  useEffect(() => onUnmount);

  if (hasQueryParams) {
    title = i18n._(msg`The search filter did not produce any results…`);
    message = i18n._(msg`Please try another search using the filter above`);
    icon = SearchIcon;
  } else if (isJobRunning) {
    title = i18n._(msg`Waiting for job output…`);
  } else if (job.status === 'failed') {
    title = i18n._(msg`This job failed and has no output.`);
    message = React.createElement(
      React.Fragment,
      null,
      i18n._(msg`Return to`),
      ' ',
      React.createElement(
        Link,
        { to: `/jobs/${typeSegment}/${id}/details` },
        i18n._(msg`details.`)
      ),
      React.createElement('br'),
      job.job_explanation &&
        React.createElement(
          React.Fragment,
          null,
          i18n._(msg`Failure Explanation:`),
          ' ',
          `${job.job_explanation}`
        )
    );
    icon = ExclamationCircleIcon;
  } else {
    title = i18n._(msg`No output found for this job.`);
  }

  return (
    <ContentEmpty
      css="height: 100%"
      title={title}
      message={message}
      icon={icon}
    />
  );
}
