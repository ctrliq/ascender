import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Badge, Tooltip } from '@patternfly/react-core';
import './HostStatusBar.css';

// A segment's colour and share of the bar are per host status, so they stay
// on the element rather than becoming a class apiece.
const segmentStyle = (color: string | undefined, count: number) => ({
  backgroundColor: color || 'inherit',
  flexGrow: count || 0,
});

export interface HostStatusBarProps {
  /** How many hosts ended in each state, as the job's summary reports. */
  counts?: Record<string, number>;
  [key: string]: unknown;
}

const HostStatusBar = ({ counts = {} }: HostStatusBarProps) => {
  const { t } = useLingui();
  const noData = Object.keys(counts).length === 0;
  const hostStatus = {
    ok: {
      color: '#12a66f',
      label: t`OK`,
    },
    skipped: {
      color: '#73BCF7',
      label: t`Skipped`,
    },
    changed: {
      color: '#F0AB00',
      label: t`Changed`,
    },
    failures: {
      color: '#f04438',
      label: t`Failed`,
    },
    dark: {
      color: '#8F4700',
      label: t`Unreachable`,
    },
  };

  const barSegments = Object.keys(hostStatus).map((key) => {
    const count = counts[key] ?? 0;
    return (
      <Tooltip
        key={key}
        content={
          <div className="ascender-host-status-bar__tooltip-content">
            {hostStatus[key as keyof typeof hostStatus].label}
            <Badge isRead>{count}</Badge>
          </div>
        }
      >
        <div
          key={key}
          className="ascender-host-status-bar__segment"
          style={segmentStyle(
            hostStatus[key as keyof typeof hostStatus].color,
            count
          )}
        />
      </Tooltip>
    );
  });

  if (noData) {
    return (
      <div className="host-status-bar ascender-host-status-bar__wrapper">
        <Tooltip
          content={t`Host status information for this job is unavailable.`}
        >
          <div
            className="ascender-host-status-bar__segment"
            style={segmentStyle(undefined, 1)}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="host-status-bar ascender-host-status-bar__wrapper">
      {barSegments}
    </div>
  );
};

export default HostStatusBar;
