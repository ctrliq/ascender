import type { Label, LaunchCredential, SummaryFieldRef } from 'types/api';
import type { ByWeekday } from 'rrule';

/**
 * The shape of the schedule form's values, shared by the code that parses an
 * rrule into them and the code that builds an rrule back out of them.
 *
 * The two halves have to agree field for field: anything parseRuleObj writes
 * and buildRuleObj does not read is silently dropped the next time a schedule
 * is saved, which is the class of bug this file exists to make visible.
 */

/** How often a rule repeats, as the form names it rather than as rrule does. */
export type ScheduleFrequency =
  'none' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Which day of the month a monthly or yearly rule lands on. */
export type RunOn = 'day' | 'the';

/**
 * Which day a monthly or yearly "on the Nth ..." rule names. null is what the
 * parser returns for a BYDAY set it cannot describe as one of these.
 */
export type RunOnTheDay =
  | 'day'
  | 'weekday'
  | 'weekendDay'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'
  | null;

/** When a rule stops repeating. */
export type RuleEnd = 'never' | 'onDate' | 'after';

/**
 * The options attached to one frequency. Every frequency carries the first
 * five; the rest apply only to the weekly, monthly and yearly rules, which is
 * why they are optional rather than defaulted.
 */
export interface FrequencyOptions {
  end: RuleEnd;
  endDate: string;
  endTime: string;
  occurrences: number;
  interval: number;
  /** Weekly only: the rrule weekday constants the rule fires on. */
  daysOfWeek?: ByWeekday[];
  /**
   * Monthly and yearly: whether the rule names a date or an occurrence. The
   * four numeric fields are arrays when the rrule names more than one value,
   * which the form renders as a single input but round-trips unchanged.
   */
  runOn?: RunOn;
  runOnTheOccurrence?: number | number[];
  runOnTheDay?: RunOnTheDay;
  runOnTheMonth?: number | number[];
  runOnDayNumber?: number | number[];
  runOnDayMonth?: number | number[];
}

/** The options of every frequency the schedule uses, keyed by frequency. */
export type FrequencyOptionsMap = Partial<
  Record<ScheduleFrequency, FrequencyOptions>
>;

/**
 * What the schedule form holds. The index signature is there because the form
 * carries the schedule's own fields alongside these, name and description among
 * them, and those belong to the schedule serializer rather than to the rrule.
 */
export interface ScheduleFormValues {
  frequency: ScheduleFrequency[];
  frequencyOptions: FrequencyOptionsMap;
  exceptionFrequency: ScheduleFrequency[];
  exceptionOptions: FrequencyOptionsMap;
  timezone?: string;
  startDate?: string;
  startTime?: string;
  name?: string;
  description?: string;
  daysToKeep?: number;
  /** The prompt's own fields, present only where the template asks for them. */
  credentials?: LaunchCredential[];
  labels?: Label[];
  instance_groups?: SummaryFieldRef[];
  inventory?: SummaryFieldRef | null;
  execution_environment?: SummaryFieldRef | null;
  extra_data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * One frequency's options flattened together with the schedule's start, which
 * is what buildRuleObj turns into a single rrule. The options are partial
 * because the "none" frequency, the single occurrence case, carries only an
 * interval.
 */
export interface RuleValues extends Partial<FrequencyOptions> {
  frequency: ScheduleFrequency;
  startDate?: string;
  startTime?: string;
  timezone?: string;
}

/** What buildDtStartObj needs, which is only where the schedule starts. */
export interface DtStartValues {
  startDate?: string;
  startTime?: string;
  timezone?: string;
}
