import { RRule, RRuleSet } from 'rrule';
import buildRuleObj, { buildDtStartObj } from './buildRuleObj';
import type { ScheduleFormValues, ScheduleFrequency } from './types';

declare global {
  interface Window {
    RRuleSet: typeof RRuleSet;
  }
}

// Exposed for the browser console alongside the two in buildRuleObj.
window.RRuleSet = RRuleSet;

const frequencies: ScheduleFrequency[] = [
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'year',
];

export default function buildRuleSet(
  values: ScheduleFormValues,
  useUTCStart?: boolean
) {
  const set = new RRuleSet();

  if (!useUTCStart) {
    const startRule = buildDtStartObj({
      startDate: values.startDate,
      startTime: values.startTime,
      timezone: values.timezone,
    });
    set.rrule(startRule);
  }

  if (values.frequency.length === 0) {
    const rule = buildRuleObj(
      {
        startDate: values.startDate,
        startTime: values.startTime,
        timezone: values.timezone,
        frequency: 'none',
        interval: 1,
      },
      useUTCStart
    );
    set.rrule(new RRule(rule));
  }

  frequencies.forEach((frequency) => {
    if (!values.frequency.includes(frequency)) {
      return;
    }
    const rule = buildRuleObj(
      {
        startDate: values.startDate,
        startTime: values.startTime,
        timezone: values.timezone,
        frequency,
        ...values.frequencyOptions[frequency],
      },
      useUTCStart
    );
    set.rrule(new RRule(rule));
  });

  frequencies.forEach((frequency) => {
    if (!values.exceptionFrequency?.includes(frequency)) {
      return;
    }
    const rule = buildRuleObj(
      {
        startDate: values.startDate,
        startTime: values.startTime,
        timezone: values.timezone,
        frequency,
        ...values.exceptionOptions[frequency],
      },
      useUTCStart
    );
    set.exrule(new RRule(rule));
  });

  return set;
}
