import React from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Badge, Tooltip } from '@patternfly/react-core';

const BarWrapper = styled.div`
  background-color: #d7d7d7;
  display: flex;
  height: 5px;
  margin-top: 16px;
  width: 100%;
`;

const BarSegment = styled.div`
  background-color: ${(props) => props.color || 'inherit'};
  flex-grow: ${(props) => props.count || 0};
`;
BarSegment.displayName = 'BarSegment';

const TooltipContent = styled.div`
  align-items: center;
  display: flex;

  span.pf-c-badge {
    margin-left: 10px;
  }
`;

const HostStatusBar = ({ counts = {} }) => {
  const { i18n } = useLingui();
  const noData = Object.keys(counts).length === 0;
  const hostStatus = {
    ok: {
      color: '#4CB140',
      label: i18n._(msg`OK`),
    },
    skipped: {
      color: '#73BCF7',
      label: i18n._(msg`Skipped`),
    },
    changed: {
      color: '#F0AB00',
      label: i18n._(msg`Changed`),
    },
    failures: {
      color: '#C9190B',
      label: i18n._(msg`Failed`),
    },
    dark: {
      color: '#8F4700',
      label: i18n._(msg`Unreachable`),
    },
  };

  const barSegments = Object.keys(hostStatus).map((key) => {
    const count = counts[key] || 0;
    return (
      <Tooltip
        key={key}
        content={
          <TooltipContent>
            {hostStatus[key].label}
            <Badge isRead>{count}</Badge>
          </TooltipContent>
        }
      >
        <BarSegment key={key} color={hostStatus[key].color} count={count} />
      </Tooltip>
    );
  });

  if (noData) {
    return (
      <BarWrapper>
        <Tooltip
          content={i18n._(
            msg`Host status information for this job is unavailable.`
          )}
        >
          <BarSegment count={1} />
        </Tooltip>
      </BarWrapper>
    );
  }

  return <BarWrapper>{barSegments}</BarWrapper>;
};

export default HostStatusBar;
