import type { ScheduleFrequency } from './types';

/**
 * The order the frequencies are shown in, which is shortest interval first.
 *
 * A schedule may hold several frequencies at once, and the form lists them in
 * this order rather than the order they were added, so editing one twice does
 * not move it about.
 */
const ORDER: Record<ScheduleFrequency, number> = {
  none: 0,
  minute: 1,
  hour: 2,
  day: 3,
  week: 4,
  month: 5,
  year: 6,
};

/** Comparator putting two frequencies in the order above. */
export default function sortFrequencies(
  a: ScheduleFrequency,
  b: ScheduleFrequency
) {
  if (ORDER[a] < ORDER[b]) {
    return -1;
  }
  if (ORDER[a] > ORDER[b]) {
    return 1;
  }
  return 0;
}
