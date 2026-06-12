
import { t } from '@lingui/react/macro';
import { RRule } from 'rrule';
import { DateTime, Duration } from 'luxon';

export function formatDateString(dateObj, tz = null) {
  if (dateObj === null) {
    return null;
  }

  return tz !== null
    ? DateTime.fromISO(dateObj, { zone: tz }).toLocaleString(
        DateTime.DATETIME_SHORT_WITH_SECONDS
      )
    : DateTime.fromISO(dateObj).toLocaleString(
        DateTime.DATETIME_SHORT_WITH_SECONDS
      );
}

export function secondsToHHMMSS(seconds) {
  return Duration.fromObject({ seconds }).toFormat('hh:mm:ss');
}

export function calculateElapsed(started) {
  if (!started) return '00:00:00';
  const duration = DateTime.now()
    .diff(DateTime.fromISO(`${started}`), [
      'milliseconds',
      'seconds',
      'minutes',
      'hours',
    ])
    .toObject();

  return Duration.fromObject({ ...duration }).toFormat('hh:mm:ss');
}

export function secondsToDays(seconds) {
  return Duration.fromObject({ seconds }).toFormat('d');
}

export function timeOfDay() {
  const dateTime = DateTime.local();
  return dateTime.toFormat('hh:mm:ss:ms a');
}

export function dateToInputDateTime(dt, tz = null) {
  let dateTime;
  if (tz) {
    dateTime = DateTime.fromISO(dt, { zone: tz });
  } else {
    dateTime = DateTime.fromISO(dt);
  }
  return [dateTime.toFormat('yyyy-LL-dd'), dateTime.toFormat('h:mm a')];
}

export function getRRuleDayConstants(dayString) {
  switch (dayString) {
    case 'sunday':
      return RRule.SU;
    case 'monday':
      return RRule.MO;
    case 'tuesday':
      return RRule.TU;
    case 'wednesday':
      return RRule.WE;
    case 'thursday':
      return RRule.TH;
    case 'friday':
      return RRule.FR;
    case 'saturday':
      return RRule.SA;
    case 'day':
      return [
        RRule.MO,
        RRule.TU,
        RRule.WE,
        RRule.TH,
        RRule.FR,
        RRule.SA,
        RRule.SU,
      ];
    case 'weekday':
      return [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
    case 'weekendDay':
      return [RRule.SA, RRule.SU];
    default:
      throw new Error(t`Unrecognized day string`);
  }
}
