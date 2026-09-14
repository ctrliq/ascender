import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { AngleDownIcon, AngleRightIcon } from '@patternfly/react-icons';
import './JobEventLineToggle.css';

export interface JobEventLineToggleProps {
  canToggle?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
  [key: string]: unknown;
}

export default function JobEventLineToggle({
  canToggle,
  isCollapsed,
  onToggle,
}: JobEventLineToggleProps) {
  const { t } = useLingui();
  if (!canToggle) {
    return <div className="awx-job-event-line-toggle__wrapper" />;
  }
  return (
    <div className="awx-job-event-line-toggle__wrapper">
      <button
        className="awx-job-event-line-toggle__button"
        onClick={onToggle}
        type="button"
      >
        {isCollapsed ? (
          <AngleRightIcon title={t`Expand section`} />
        ) : (
          <AngleDownIcon title={t`Collapse section`} />
        )}
      </button>
    </div>
  );
}
