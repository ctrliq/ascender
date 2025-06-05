import 'styled-components/macro';
import React, { useState } from 'react';
import { shape, string } from 'prop-types';
import styled from 'styled-components';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Split, SplitItem, TextListItemVariants } from '@patternfly/react-core';
import { formatDateString } from 'util/dates';
import { DetailName, DetailValue } from '../../DetailList';
import MultiButtonToggle from '../../MultiButtonToggle';

const OccurrencesLabel = styled.div`
  display: inline-block;
  font-size: var(--pf-c-form__label--FontSize);
  font-weight: var(--pf-c-form__label--FontWeight);
  line-height: var(--pf-c-form__label--LineHeight);
  color: var(--pf-c-form__label--Color);

  span:first-of-type {
    font-weight: var(--pf-global--FontWeight--bold);
    margin-right: 10px;
  }
`;

function ScheduleOccurrences({ preview = { local: [], utc: [] }, tz }) {
  const { i18n } = useLingui();
  const [mode, setMode] = useState('local');

  if (preview.local.length < 2) {
    return null;
  }

  return (
    <>
      <DetailName
        component={TextListItemVariants.dt}
        fullWidth
        css="grid-column: 1 / -1"
      >
        <Split hasGutter>
          <SplitItem>
            <OccurrencesLabel>
              <span>{i18n._(msg`Occurrences`)}</span>
              <span>{i18n._(msg`(Limited to first 10)`)}</span>
            </OccurrencesLabel>
          </SplitItem>
          <SplitItem>
            <MultiButtonToggle
              buttons={[
                ['local', i18n._(msg`Local`)],
                ['utc', i18n._(msg`UTC`)],
              ]}
              value={mode}
              onChange={(newMode) => setMode(newMode)}
              name="timezone"
            />
          </SplitItem>
        </Split>
      </DetailName>
      <DetailValue
        component={TextListItemVariants.dd}
        fullWidth
        css="grid-column: 1 / -1; margin-top: -10px"
      >
        {preview[mode].map((dateStr) => (
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

ScheduleOccurrences.propTypes = {
  preview: shape(),
  tz: string,
};

ScheduleOccurrences.defaultProps = {
  preview: { local: [], utc: [] },
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export default ScheduleOccurrences;
