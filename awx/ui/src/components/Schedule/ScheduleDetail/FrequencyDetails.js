import React from 'react';
import styled from 'styled-components';
import { msg, SelectOrdinal } from '@lingui/macro';
import { useLingui } from '@lingui/react';
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
  const { i18n } = useLingui();
  const getRunEveryLabel = () => {
    const { interval } = options;
    switch (type) {
      case 'minute':
        return i18n._(msg`{interval, plural, one {# minute} other {# minutes}}`, { interval });
      case 'hour':
        return i18n._(msg`{interval, plural, one {# hour} other {# hours}}`, { interval });
      case 'day':
        return i18n._(msg`{interval, plural, one {# day} other {# days}}`, { interval });
      case 'week':
        return i18n._(msg`{interval, plural, one {# week} other {# weeks}}`, { interval });
      case 'month':
        return i18n._(msg`{interval, plural, one {# month} other {# months}}`, { interval });
      case 'year':
        return i18n._(msg`{interval, plural, one {# year} other {# years}}`, { interval });
      default:
        throw new Error(i18n._(msg`Frequency did not match an expected value`));
    }
  };

  const weekdays = React.useMemo(() => ({
    0: i18n._(msg`Monday`),
    1: i18n._(msg`Tuesday`),
    2: i18n._(msg`Wednesday`),
    3: i18n._(msg`Thursday`),
    4: i18n._(msg`Friday`),
    5: i18n._(msg`Saturday`),
    6: i18n._(msg`Sunday`),
  }), [i18n]);

  const prefix = isException ? `exception-${type}` : `frequency-${type}`;

  return (
    <div>
      <Label>{label}</Label>
      <DetailList gutter="sm">
        <Detail
          label={isException ? i18n._(msg`Skip every`) : i18n._(msg`Run every`)}
          value={getRunEveryLabel()}
          dataCy={`${prefix}-run-every`}
        />
        {type === 'week' && options.daysOfWeek ? (
          <Detail
            label={i18n._(msg`On days`)}
            value={options.daysOfWeek
              .sort(sortWeekday)
              .map((d) => weekdays[d.weekday])
              .join(', ')}
            dataCy={`${prefix}-days-of-week`}
          />
        ) : null}
        <RunOnDetail type={type} options={options} prefix={prefix} i18n={i18n} />
        <Detail
          label={i18n._(msg`End`)}
          value={getEndValue(type, options, timezone, i18n)}
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

function RunOnDetail({ type, options, prefix, i18n }) {
  const weekdays = React.useMemo(() => ({
    sunday: i18n._(msg`Sunday`),
    monday: i18n._(msg`Monday`),
    tuesday: i18n._(msg`Tuesday`),
    wednesday: i18n._(msg`Wednesday`),
    thursday: i18n._(msg`Thursday`),
    friday: i18n._(msg`Friday`),
    saturday: i18n._(msg`Saturday`),
    day: i18n._(msg`day`),
    weekday: i18n._(msg`weekday`),
    weekendDay: i18n._(msg`weekend day`),
  }), [i18n]);

  if (type === 'month') {
    if (options.runOn === 'day') {
      return (
        <Detail
          label={i18n._(msg`Run on`)}
          value={i18n._(msg`Day {num}`, { num: options.runOnDayNumber })}
          dataCy={`${prefix}-run-on-day`}
        />
      );
    }
    const dayOfWeek = weekdays[options.runOnTheDay];
    return (
      <Detail
        label={i18n._(msg`Run on`)}
        value={
          options.runOnTheOccurrence === -1 ? (
            i18n._(msg`The last ${dayOfWeek}`)
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
      1: i18n._(msg`January`),
      2: i18n._(msg`February`),
      3: i18n._(msg`March`),
      4: i18n._(msg`April`),
      5: i18n._(msg`May`),
      6: i18n._(msg`June`),
      7: i18n._(msg`July`),
      8: i18n._(msg`August`),
      9: i18n._(msg`September`),
      10: i18n._(msg`October`),
      11: i18n._(msg`November`),
      12: i18n._(msg`December`),
    };
    if (options.runOn === 'day') {
      return (
        <Detail
          label={i18n._(msg`Run on`)}
          value={`${months[options.runOnTheMonth]} ${options.runOnDayMonth}`}
          dataCy={`${prefix}-run-on-day`}
        />
      );
    }
    const weekday = weekdays[options.runOnTheDay];
    const month = months[options.runOnTheMonth];
    return (
      <Detail
        label={i18n._(msg`Run on`)}
        value={
          options.runOnTheOccurrence === -1 ? (
            i18n._(msg`The last ${weekday} of ${month}`)
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

function getEndValue(type, options, timezone, i18n) {
  if (options.end === 'never') {
    return i18n._(msg`Never`);
  }
  if (options.end === 'after') {
    const numOccurrences = options.occurrences;
    return i18n._(msg`After {numOccurrences, plural, one {# occurrence} other {# occurrences}}`, { numOccurrences });
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
