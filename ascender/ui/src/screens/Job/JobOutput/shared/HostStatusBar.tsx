import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Badge } from '@patternfly/react-core';
import './HostStatusBar.css';
import Tooltip from 'components/Tooltip';

// A segment's colour and share of the bar are per host status, so they stay
// on the element rather than becoming a class apiece.
const segmentStyle = (color: string | undefined, count: number) => ({
  backgroundColor: color || 'inherit',
  flexGrow: count || 0,
});

export interface HostStatusBarProps {
  /** How many hosts ended in each state, as the job's summary reports. */
  counts?: Record<string, number>;
  /**
   * What the run itself came to, which is what the bar shows where the run
   * has no hosts to report: a command, a sync and a cleanup job all end
   * without a play, so the bar would otherwise be a grey line on every one
   * of them whatever they came to.
   */
  jobStatus?: string;
  [key: string]: unknown;
}

const HostStatusBar = ({ counts = {}, jobStatus }: HostStatusBarProps) => {
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
    /*
     * A run with no hosts still came to something, and this is the only band
     * of colour the output carries: it says the result, in the colours the
     * segments above use for a host that ended the same way. A run still
     * going says nothing, since there is nothing to say yet.
     */
    const outcomes: Record<string, { color: string; label: string }> = {
      successful: { color: hostStatus.ok.color, label: t`Successful` },
      failed: { color: hostStatus.failures.color, label: t`Failed` },
      error: { color: hostStatus.failures.color, label: t`Error` },
      canceled: { color: '#f0ab00', label: t`Canceled` },
    };
    const outcome = outcomes[jobStatus as keyof typeof outcomes];
    return (
      <div className="host-status-bar ascender-host-status-bar__wrapper">
        <Tooltip
          content={
            outcome
              ? outcome.label
              : t`Host status information for this job is unavailable.`
          }
        >
          <div
            className="ascender-host-status-bar__segment"
            style={segmentStyle(outcome?.color, 1)}
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
