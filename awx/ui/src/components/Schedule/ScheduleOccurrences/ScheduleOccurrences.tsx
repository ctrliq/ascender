import React, { useState } from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react/macro';

import { Split, SplitItem, ContentVariants } from '@patternfly/react-core';
import { formatDateString } from 'util/dates';
import { DetailName, DetailValue } from '../../DetailList';
import MultiButtonToggle from '../../MultiButtonToggle';

const OccurrencesLabel = styled.div`
  display: inline-block;
  font-size: var(--pf-v6-c-form__label--FontSize);
  font-weight: var(--pf-v6-c-form__label--FontWeight);
  line-height: var(--pf-v6-c-form__label--LineHeight);
  color: var(--pf-v6-c-form__label--Color);

  span:first-of-type {
    font-weight: var(--pf-v6-global--FontWeight--bold);
    margin-right: 10px;
  }
`;

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
        component={ContentVariants.dt}
        fullWidth
        css="grid-column: 1 / -1"
      >
        <Split hasGutter>
          <SplitItem>
            <OccurrencesLabel>
              <span>{t`Occurrences`}</span>
              <span>{t`(Limited to first 10)`}</span>
            </OccurrencesLabel>
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
        component={ContentVariants.dd}
        fullWidth
        css="grid-column: 1 / -1; margin-top: -10px"
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
