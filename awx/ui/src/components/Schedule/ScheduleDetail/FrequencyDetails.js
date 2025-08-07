import React from 'react';
import styled from 'styled-components';
import { SelectOrdinal, useLingui } from '@lingui/react/macro';
import { DateTime } from 'luxon';
import { formatDateString } from 'util/dates';
import { DetailList, Detail } from '../../DetailList';

const Label = styled.div`
  margin-bottom: var(--pf-global--spacer--sm);
  font-weight: var(--pf-global--FontWeight--bold);
`;

export default function FrequencyDetails({
  type,
  label,
  options,
  timezone,
  isException,
}) {
  const { t } = useLingui();
  const getRunEveryLabel = () => {
    const { interval } = options;
    switch (type) {
      case 'minute':
        return interval === 1 ? t`${interval} minute` : t`${interval} minutes`;
      case 'hour':
        return interval === 1 ? t`${interval} hour` : t`${interval} hours`;
      case 'day':
        return interval === 1 ? t`${interval} day` : t`${interval} days`;
      case 'week':
        return interval === 1 ? t`${interval} week` : t`${interval} weeks`;
      case 'month':
        return interval === 1 ? t`${interval} month` : t`${interval} months`;
      case 'year':
        return interval === 1 ? t`${interval} year` : t`${interval} years`;
      default:
        throw new Error(t`Frequency did not match an expected value`);
    }
  };

  const weekdays = React.useMemo(
    () => ({
      0: t`Monday`,
      1: t`Tuesday`,
      2: t`Wednesday`,
      3: t`Thursday`,
      4: t`Friday`,
      5: t`Saturday`,
      6: t`Sunday`,
    }),
    [t]
  );

  const prefix = isException ? `exception-${type}` : `frequency-${type}`;

  return (
    <div>
      <Label>{label}</Label>
      <DetailList gutter="sm">
        <Detail
          label={isException ? t`Skip every` : t`Run every`}
          value={getRunEveryLabel()}
          dataCy={`${prefix}-run-every`}
        />
        {type === 'week' && options.daysOfWeek ? (
          <Detail
            label={t`On days`}
            value={options.daysOfWeek
              .sort(sortWeekday)
              .map((d) => weekdays[d.weekday])
              .join(', ')}
            dataCy={`${prefix}-days-of-week`}
          />
        ) : null}
        <RunOnDetail
          type={type}
          options={options}
          prefix={prefix}
          t={t}
        />
        <Detail
          label={t`End`}
          value={getEndValue(type, options, timezone, t)}
          dataCy={`${prefix}-end`}
        />
      </DetailList>
    </div>
  );
}

function sortWeekday(a, b) {
  if (a.weekday === 6) return -1;
  if (b.weekday === 6) return 1;
  return a.weekday - b.weekday;
}

function RunOnDetail({ type, options, prefix, t }) {
  const weekdays = React.useMemo(
    () => ({
      sunday: t`Sunday`,
      monday: t`Monday`,
      tuesday: t`Tuesday`,
      wednesday: t`Wednesday`,
      thursday: t`Thursday`,
      friday: t`Friday`,
      saturday: t`Saturday`,
      day: t`day`,
      weekday: t`weekday`,
      weekendDay: t`weekend day`,
    }),
    [t]
  );

  if (type === 'month') {
    if (options.runOn === 'day') {
      return (
        <Detail
          label={t`Run on`}
          value={t`Day ${options.runOnDayNumber}`}
          dataCy={`${prefix}-run-on-day`}
        />
      );
    }
    const dayOfWeek = weekdays[options.runOnTheDay];
    return (
      <Detail
        label={t`Run on`}
        value={
          options.runOnTheOccurrence === -1 ? (
            t`The last ${dayOfWeek}`
          ) : (
            <SelectOrdinal
              value={options.runOnTheOccurrence}
              one={`The first ${dayOfWeek}`}
              two={`The second ${dayOfWeek}`}
              _3={`The third ${dayOfWeek}`}
              _4={`The fourth ${dayOfWeek}`}
              _5={`The fifth ${dayOfWeek}`}
            />
          )
        }
        dataCy={`${prefix}-run-on-day`}
      />
    );
  }
  if (type === 'year') {
    const months = {
      1: t`January`,
      2: t`February`,
      3: t`March`,
      4: t`April`,
      5: t`May`,
      6: t`June`,
      7: t`July`,
      8: t`August`,
      9: t`September`,
      10: t`October`,
      11: t`November`,
      12: t`December`,
    };
    if (options.runOn === 'day') {
      return (
        <Detail
          label={t`Run on`}
          value={`${months[options.runOnTheMonth]} ${options.runOnDayMonth}`}
          dataCy={`${prefix}-run-on-day`}
        />
      );
    }
    const weekday = weekdays[options.runOnTheDay];
    const month = months[options.runOnTheMonth];
    return (
      <Detail
        label={t`Run on`}
        value={
          options.runOnTheOccurrence === -1 ? (
            t`The last ${weekday} of ${month}`
          ) : (
            <SelectOrdinal
              value={options.runOnTheOccurrence}
              one={`The first ${weekday} of ${month}`}
              two={`The second ${weekday} of ${month}`}
              _3={`The third ${weekday} of ${month}`}
              _4={`The fourth ${weekday} of ${month}`}
              _5={`The fifth ${weekday} of ${month}`}
            />
          )
        }
        dataCy={`${prefix}-run-on-day`}
      />
    );
  }
  return null;
}

function getEndValue(type, options, timezone, t) {
  if (options.end === 'never') {
    return t`Never`;
  }
  if (options.end === 'after') {
    const numOccurrences = options.occurrences;
    return t`After ${numOccurrences} ${numOccurrences === 1 ? 'occurrence' : 'occurrences'}`;
  }
  const date = DateTime.fromFormat(
    `${options.endDate} ${options.endTime}`,
    'yyyy-MM-dd h:mm a',
    {
      zone: timezone,
    }
  );
  return formatDateString(date, timezone);
}
