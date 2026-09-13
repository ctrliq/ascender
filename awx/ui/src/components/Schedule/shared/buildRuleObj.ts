import { RRule, type Options } from 'rrule';
import { DateTime } from 'luxon';
import { t } from '@lingui/core/macro';
import { getRRuleDayConstants } from 'util/dates';
import type { DtStartValues, RuleValues } from './types';

declare global {
  interface Window {
    RRule: typeof RRule;
    DateTime: typeof DateTime;
  }
}

// Both are here so the rrule and luxon builders can be driven from the browser
// console while a schedule is being debugged. Present since the initial import.
window.RRule = RRule;
window.DateTime = DateTime;

const parseTime = (time: string) => [
  DateTime.fromFormat(time, 'h:mm a').hour,
  DateTime.fromFormat(time, 'h:mm a').minute,
];

export function buildDtStartObj(values: DtStartValues) {
  // Dates are formatted like "YYYY-MM-DD"
  const [startYear, startMonth, startDay] = (values.startDate as string).split(
    '-'
  );
  // Times are formatted like "HH:MM:SS" or "HH:MM" if no seconds
  // have been specified
  const [startHour, startMinute] = parseTime(values.startTime as string);

  const dateString = `${startYear}${pad(startMonth)}${pad(startDay)}T${pad(
    startHour
  )}${pad(startMinute)}00`;
  const rruleString = values.timezone
    ? `DTSTART;TZID=${values.timezone}:${dateString}`
    : `DTSTART:${dateString}Z`;
  const rule = RRule.fromString(rruleString);

  return rule;
}

function pad(num: string | number | undefined) {
  if (typeof num === 'string') {
    return num;
  }
  return (num as number) < 10 ? `0${num}` : num;
}

export default function buildRuleObj(
  values: RuleValues,
  includeStart?: boolean
): Partial<Options> {
  const ruleObj: Partial<Options> = {
    interval: values.interval,
  };

  if (includeStart) {
    ruleObj.dtstart = buildDateTime(
      values.startDate as string,
      values.startTime as string,
      values.timezone
    );
  }

  switch (values.frequency) {
    case 'none':
      ruleObj.count = 1;
      ruleObj.freq = RRule.MINUTELY;
      break;
    case 'minute':
      ruleObj.freq = RRule.MINUTELY;
      break;
    case 'hour':
      ruleObj.freq = RRule.HOURLY;
      break;
    case 'day':
      ruleObj.freq = RRule.DAILY;
      break;
    case 'week':
      ruleObj.freq = RRule.WEEKLY;
      ruleObj.byweekday = values.daysOfWeek;
      break;
    case 'month':
      ruleObj.freq = RRule.MONTHLY;
      if (values.runOn === 'day') {
        ruleObj.bymonthday = values.runOnDayNumber;
      } else if (values.runOn === 'the') {
        ruleObj.bysetpos = parseInt(String(values.runOnTheOccurrence), 10);
        ruleObj.byweekday = getRRuleDayConstants(values.runOnTheDay as string);
      }
      break;
    case 'year':
      ruleObj.freq = RRule.YEARLY;
      if (values.runOn === 'day') {
        ruleObj.bymonth = parseInt(String(values.runOnDayMonth), 10);
        ruleObj.bymonthday = values.runOnDayNumber;
      } else if (values.runOn === 'the') {
        ruleObj.bysetpos = parseInt(String(values.runOnTheOccurrence), 10);
        ruleObj.byweekday = getRRuleDayConstants(values.runOnTheDay as string);
        ruleObj.bymonth = parseInt(String(values.runOnTheMonth), 10);
      }
      break;
    default:
      throw new Error(t`Frequency did not match an expected value`);
  }

  if (values.frequency !== 'none') {
    switch (values.end) {
      case 'never':
        break;
      case 'after':
        ruleObj.count = values.occurrences;
        break;
      case 'onDate': {
        ruleObj.until = buildDateTime(
          values.endDate as string,
          values.endTime as string,
          values.timezone
        );
        break;
      }
      default:
        throw new Error(
          t`End did not match an expected value (${String(values.end)})`
        );
    }
  }

  return ruleObj;
}

function buildDateTime(
  dateString: string,
  timeString: string,
  timezone?: string
) {
  const localDate = DateTime.fromISO(`${dateString}T000000`, {
    zone: timezone,
  });
  const [hour, minute] = parseTime(timeString);
  const localTime = localDate.set({
    hour,
    minute,
    second: 0,
  });
  return localTime.toJSDate();
}
