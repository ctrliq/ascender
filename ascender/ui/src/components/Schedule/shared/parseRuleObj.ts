import type { Schedule } from 'types/api';
import { RRule, RRuleSet, rrulestr, type Weekday } from 'rrule';
import { dateToInputDateTime } from 'util/dates';
import { DateTime } from 'luxon';
import type {
  FrequencyOptions,
  RunOnTheDay,
  ScheduleFormValues,
  ScheduleFrequency,
} from './types';
import sortFrequencies from './sortFrequencies';

export class UnsupportedRRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedRRuleError';
  }
}

/**
 * What the parser reads off a schedule: the rule itself, when it starts, and
 * the zone both are in. A form's own draft carries these before it is saved,
 * which is what the preview is built from.
 */
export type ScheduleRule = Partial<Schedule> & {
  rrule?: string | null;
  dtstart?: string | null;
  timezone?: string | null;
};

export default function parseRuleObj(
  schedule: ScheduleRule
): ScheduleFormValues {
  let values: ScheduleFormValues = {
    frequency: [],
    frequencyOptions: {},
    exceptionFrequency: [],
    exceptionOptions: {},
    timezone: schedule.timezone,
  };
  // forceset makes this an RRuleSet rather than a bare RRule, which is what
  // gives one string per DTSTART, RRULE and EXRULE line below.
  const ruleset = rrulestr((schedule.rrule ?? '').replace(' ', '\n'), {
    forceset: true,
  }) as RRuleSet;

  const ruleStrings = ruleset.valueOf();
  ruleStrings.forEach((ruleString: string) => {
    // Every line of a serialised ruleset opens with its type in capitals.
    const type = (ruleString.match(/^[A-Z]+/) as RegExpMatchArray)[0];
    switch (type) {
      case 'DTSTART':
        values = parseDtstart(schedule, values);
        break;
      case 'RRULE':
        values = parseRrule(ruleString, schedule, values);
        break;
      case 'EXRULE':
        values = parseExRule(ruleString, schedule, values);
        break;
      default:
        throw new UnsupportedRRuleError(`Unsupported rrule type: ${type}`);
    }
  });

  if (isSingleOccurrence(values)) {
    values.frequency = [];
    values.frequencyOptions = {};
  }

  return values;
}

function isSingleOccurrence(values: ScheduleFormValues) {
  if (values.frequency.length > 1) {
    return false;
  }
  if (values.frequency[0] !== 'minute') {
    return false;
  }
  const options = values.frequencyOptions.minute;
  return options?.end === 'after' && options?.occurrences === 1;
}

function parseDtstart(
  schedule: ScheduleRule,
  values: ScheduleFormValues
): ScheduleFormValues {
  // TODO: should this rely on DTSTART in rruleset rather than schedule.dtstart?
  const [startDate, startTime] = dateToInputDateTime(
    schedule.dtstart ?? '',
    schedule.timezone ?? undefined
  );
  return {
    ...values,
    startDate,
    startTime,
  };
}

const frequencyTypes: Record<number, ScheduleFrequency> = {
  [RRule.MINUTELY]: 'minute',
  [RRule.HOURLY]: 'hour',
  [RRule.DAILY]: 'day',
  [RRule.WEEKLY]: 'week',
  [RRule.MONTHLY]: 'month',
  [RRule.YEARLY]: 'year',
};

function parseRrule(
  rruleString: string,
  schedule: ScheduleRule,
  values: ScheduleFormValues
): ScheduleFormValues {
  const { frequency, options } = parseRule(rruleString, schedule);

  if (values.frequencyOptions[frequency]) {
    throw new UnsupportedRRuleError(
      'Duplicate exception frequency types not supported'
    );
  }

  return {
    ...values,
    frequency: [...values.frequency, frequency].sort(sortFrequencies),
    frequencyOptions: {
      ...values.frequencyOptions,
      [frequency]: options,
    },
  };
}

function parseExRule(
  exruleString: string,
  schedule: ScheduleRule,
  values: ScheduleFormValues
): ScheduleFormValues {
  const { frequency, options } = parseRule(exruleString, schedule);

  if (values.exceptionOptions[frequency]) {
    throw new UnsupportedRRuleError(
      'Duplicate exception frequency types not supported'
    );
  }

  return {
    ...values,
    exceptionFrequency: [...values.exceptionFrequency, frequency].sort(
      sortFrequencies
    ),
    exceptionOptions: {
      ...values.exceptionOptions,
      [frequency]: options,
    },
  };
}

function parseRule(
  ruleString: string,
  schedule: ScheduleRule
): { frequency: ScheduleFrequency; options: FrequencyOptions } {
  const {
    origOptions: {
      bymonth,
      bymonthday,
      bysetpos,
      byweekday,
      count,
      freq,
      interval,
      until,
    },
  } = RRule.fromString(ruleString);

  const now = DateTime.now();
  const closestQuarterHour = DateTime.fromMillis(
    Math.ceil(now.toMillis() / 900000) * 900000
  );
  const tomorrow = closestQuarterHour.plus({ days: 1 });
  const [, time] = dateToInputDateTime(closestQuarterHour.toISO() as string);
  const [tomorrowDate] = dateToInputDateTime(tomorrow.toISO() as string);

  const options: FrequencyOptions = {
    endDate: tomorrowDate as string,
    endTime: time as string,
    occurrences: 1,
    interval: 1,
    end: 'never',
  };

  if (until) {
    options.end = 'onDate';
    // RFC 5545: UNTIL without Z is in DTSTART's timezone. The rrule
    // library always parses it as UTC, so strip the Z for non-Z values
    // so dateToInputDateTime interprets the digits in the schedule tz.
    const untilIsUTC = /UNTIL=\d{8}T\d{6}Z/i.test(schedule.rrule ?? '');
    const isoStr = until.toISOString();
    const [endDate, endTime] = dateToInputDateTime(
      untilIsUTC ? isoStr : isoStr.replace('Z', ''),
      schedule.timezone
    );
    options.endDate = endDate as string;
    options.endTime = endTime as string;
  } else if (count) {
    options.end = 'after';
    options.occurrences = count;
  }

  if (interval) {
    options.interval = interval;
  }

  if (typeof freq !== 'number') {
    throw new Error(`Unexpected rrule frequency: ${freq}`);
  }
  const frequency = frequencyTypes[freq] as ScheduleFrequency;

  if (freq === RRule.WEEKLY && byweekday) {
    options.daysOfWeek = byweekday as Weekday[];
  }

  if (freq === RRule.MONTHLY) {
    options.runOn = 'day';
    options.runOnTheOccurrence = 1;
    options.runOnTheDay = 'sunday';
    options.runOnDayNumber = 1;

    if (bymonthday) {
      options.runOnDayNumber = bymonthday;
    }
    if (bysetpos) {
      options.runOn = 'the';
      options.runOnTheOccurrence = bysetpos;
      options.runOnTheDay = generateRunOnTheDay(byweekday as Weekday[]);
    }
  }

  if (freq === RRule.YEARLY) {
    options.runOn = 'day';
    options.runOnTheOccurrence = 1;
    options.runOnTheDay = 'sunday';
    options.runOnTheMonth = 1;
    options.runOnDayMonth = 1;
    options.runOnDayNumber = 1;

    if (bymonthday) {
      options.runOnDayNumber = bymonthday;
      options.runOnDayMonth = bymonth ?? undefined;
    }
    if (bysetpos) {
      options.runOn = 'the';
      options.runOnTheOccurrence = bysetpos;
      options.runOnTheDay = generateRunOnTheDay(byweekday as Weekday[]);
      options.runOnTheMonth = bymonth ?? undefined;
    }
  }

  return {
    frequency,
    options,
  };
}

// rrule hands back its own MO..SU singletons, so identity comparison holds.
function generateRunOnTheDay(days: Weekday[] = []): RunOnTheDay {
  if (
    [
      RRule.MO,
      RRule.TU,
      RRule.WE,
      RRule.TH,
      RRule.FR,
      RRule.SA,
      RRule.SU,
    ].every((element) => days.indexOf(element) > -1)
  ) {
    return 'day';
  }
  if (
    [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR].every(
      (element) => days.indexOf(element) > -1
    )
  ) {
    return 'weekday';
  }
  if ([RRule.SA, RRule.SU].every((element) => days.indexOf(element) > -1)) {
    return 'weekendDay';
  }
  if (days.indexOf(RRule.MO) > -1) {
    return 'monday';
  }
  if (days.indexOf(RRule.TU) > -1) {
    return 'tuesday';
  }
  if (days.indexOf(RRule.WE) > -1) {
    return 'wednesday';
  }
  if (days.indexOf(RRule.TH) > -1) {
    return 'thursday';
  }
  if (days.indexOf(RRule.FR) > -1) {
    return 'friday';
  }
  if (days.indexOf(RRule.SA) > -1) {
    return 'saturday';
  }
  if (days.indexOf(RRule.SU) > -1) {
    return 'sunday';
  }

  return null;
}
