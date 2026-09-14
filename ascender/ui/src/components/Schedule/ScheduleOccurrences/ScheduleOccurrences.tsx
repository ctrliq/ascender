import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';

import { Split, SplitItem, ContentVariants } from '@patternfly/react-core';
import { formatDateString } from 'util/dates';
import { DetailName, DetailValue } from '../../DetailList';
import MultiButtonToggle from '../../MultiButtonToggle';
import './ScheduleOccurrences.css';

// Resolve the browser's time zone once at module load rather than on every
// render. As a `defaultProps` value this was evaluated a single time; an ES
// default parameter re-runs `Intl.DateTimeFormat()` on each render when `tz`
// is omitted, so hoist it to a module constant to preserve the old timing.
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export interface SchedulePreview {
  /** The next few occurrences, in the schedule's own time zone. */
  local: string[];
  utc: string[];
}

export interface ScheduleOccurrencesProps {
  preview?: SchedulePreview;
  /** The zone the local column is rendered in; defaults to the browser's. */
  tz?: string;
}

function ScheduleOccurrences({
  preview = { local: [], utc: [] },
  tz = DEFAULT_TIME_ZONE,
}: ScheduleOccurrencesProps) {
  const { t } = useLingui();
  const [mode, setMode] = useState<'local' | 'utc'>('local');

  if (preview.local.length < 2) {
    return null;
  }

  return (
    <>
      <DetailName
        className="awx-schedule-occurrences__grid-column-1-1"
        component={ContentVariants.dt}
        fullWidth
      >
        <Split hasGutter>
          <SplitItem>
            <div className="awx-schedule-occurrences__label">
              <span>{t`Occurrences`}</span>
              <span>{t`(Limited to first 10)`}</span>
            </div>
          </SplitItem>
          <SplitItem>
            <MultiButtonToggle
              buttons={[
                ['local', t`Local`],
                ['utc', t`UTC`],
              ]}
              value={mode}
              onChange={(newMode: 'local' | 'utc') => setMode(newMode)}
              name="timezone"
            />
          </SplitItem>
        </Split>
      </DetailName>
      <DetailValue
        className="awx-schedule-occurrences__grid-column-margin-top"
        component={ContentVariants.dd}
        fullWidth
      >
        {preview[mode].map((dateStr: string) => (
          <div key={dateStr}>
            {mode === 'local'
              ? formatDateString(dateStr, tz)
              : formatDateString(dateStr, 'UTC')}
          </div>
        ))}
      </DetailValue>
    </>
  );
}

export default ScheduleOccurrences;
