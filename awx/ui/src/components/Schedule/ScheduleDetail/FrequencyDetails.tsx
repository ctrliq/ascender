import type { Untyped } from 'types/api';
import React from 'react';
import styled from 'styled-components';
import { Plural, SelectOrdinal, useLingui } from '@lingui/react/macro';
import { msg } from '@lingui/core/macro';
import { DateTime } from 'luxon';
import type { Weekday } from 'rrule';
import { formatDateString } from 'util/dates';
import { DetailList, Detail } from '../../DetailList';
import type { FrequencyOptions, ScheduleFrequency } from '../shared/types';

const Label = styled.div`
  margin-bottom: var(--pf-v6-global--spacer--sm);
  font-weight: var(--pf-v6-global--FontWeight--bold);
`;

const DAY_LABELS = {
  sunday: msg`Sunday`,
  monday: msg`Monday`,
  tuesday: msg`Tuesday`,
  wednesday: msg`Wednesday`,
  thursday: msg`Thursday`,
  friday: msg`Friday`,
  saturday: msg`Saturday`,
};

// rrule weekday indexes (0 = Monday)
const RRULE_WEEKDAY_LABELS = {
  0: DAY_LABELS.monday,
  1: DAY_LABELS.tuesday,
  2: DAY_LABELS.wednesday,
  3: DAY_LABELS.thursday,
  4: DAY_LABELS.friday,
  5: DAY_LABELS.saturday,
  6: DAY_LABELS.sunday,
};

const RUN_ON_DAY_LABELS = {
  ...DAY_LABELS,
  day: msg`day`,
  weekday: msg`weekday`,
  weekendDay: msg`weekend day`,
};

const MONTH_LABELS = {
  1: msg`January`,
  2: msg`February`,
  3: msg`March`,
  4: msg`April`,
  5: msg`May`,
  6: msg`June`,
  7: msg`July`,
  8: msg`August`,
  9: msg`September`,
  10: msg`October`,
  11: msg`November`,
  12: msg`December`,
};

export interface FrequencyDetailsProps {
  type: Untyped;
  label: React.ReactNode;
  options: Untyped;
  timezone: Untyped;
  isException?: boolean;
  [key: string]: unknown;
}

export default function FrequencyDetails({
  type,
  label,
  options,
  timezone,
  isException,
}: FrequencyDetailsProps) {
  const { t, i18n } = useLingui();
  const getRunEveryLabel = () => {
    const { interval } = options;
    switch (type) {
      case 'minute':
        return <Plural value={interval} one="# minute" other="# minutes" />;
      case 'hour':
        return <Plural value={interval} one="# hour" other="# hours" />;
      case 'day':
        return <Plural value={interval} one="# day" other="# days" />;
      case 'week':
        return <Plural value={interval} one="# week" other="# weeks" />;
      case 'month':
        return <Plural value={interval} one="# month" other="# months" />;
      case 'year':
        return <Plural value={interval} one="# year" other="# years" />;
      default:
        throw new Error(t`Frequency did not match an expected value`);
    }
  };

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
              .map((d: Weekday) =>
                i18n._(
                  RRULE_WEEKDAY_LABELS[
                    d.weekday as keyof typeof RRULE_WEEKDAY_LABELS
                  ]
                )
              )
              .join(', ')}
            dataCy={`${prefix}-days-of-week`}
          />
        ) : null}
        <RunOnDetail type={type} options={options} prefix={prefix} />
        <EndDetail options={options} timezone={timezone} prefix={prefix} />
      </DetailList>
    </div>
  );
}

function sortWeekday(a: Weekday, b: Weekday) {
  if (a.weekday === 6) return -1;
  if (b.weekday === 6) return 1;
  return a.weekday - b.weekday;
}

interface FrequencyDetailPartProps {
  type?: ScheduleFrequency;
  options: FrequencyOptions;
  timezone?: string;
  /** Prefixes each detail's data-cy, so the exception rules do not collide. */
  prefix: string;
}

function RunOnDetail({
  type,
  options,
  prefix,
}: Omit<FrequencyDetailPartProps, 'timezone'>) {
  const { t, i18n } = useLingui();

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
    const dayOfWeek = i18n._(
      RUN_ON_DAY_LABELS[options.runOnTheDay as keyof typeof RUN_ON_DAY_LABELS]
    );
    return (
      <Detail
        label={t`Run on`}
        value={
          options.runOnTheOccurrence === -1 ? (
            t`The last ${dayOfWeek}`
          ) : (
            // No `other` clause, which ICU wants and the checked in message
            // catalogues do not carry either, so an occurrence past the fifth
            // renders nothing. Adding one would change the msgid in every
            // locale, which is a translation change rather than a typing one.
            // @ts-expect-error missing `other`, as described above
            <SelectOrdinal
              value={options.runOnTheOccurrence as number}
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
    const month = i18n._(
      MONTH_LABELS[options.runOnTheMonth as keyof typeof MONTH_LABELS]
    );
    if (options.runOn === 'day') {
      return (
        <Detail
          label={t`Run on`}
          value={`${month} ${options.runOnDayMonth}`}
          dataCy={`${prefix}-run-on-day`}
        />
      );
    }
    const weekday = i18n._(
      RUN_ON_DAY_LABELS[options.runOnTheDay as keyof typeof RUN_ON_DAY_LABELS]
    );
    return (
      <Detail
        label={t`Run on`}
        value={
          options.runOnTheOccurrence === -1 ? (
            t`The last ${weekday} of ${month}`
          ) : (
            // Same missing `other` clause as above.
            // @ts-expect-error missing `other`, as described above
            <SelectOrdinal
              value={options.runOnTheOccurrence as number}
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

function EndDetail({
  options,
  timezone,
  prefix,
}: Omit<FrequencyDetailPartProps, 'type'>) {
  const { t } = useLingui();
  let value;
  if (options.end === 'never') {
    value = t`Never`;
  } else if (options.end === 'after') {
    const numOccurrences = options.occurrences;
    value = (
      <Plural
        value={numOccurrences}
        one="After # occurrence"
        other="After # occurrences"
      />
    );
  } else {
    const date = DateTime.fromFormat(
      `${options.endDate} ${options.endTime}`,
      'yyyy-MM-dd h:mm a',
      {
        zone: timezone,
      }
    );
    value = formatDateString(date.toISO(), timezone);
  }
  return <Detail label={t`End`} value={value} dataCy={`${prefix}-end`} />;
}
