import { RRule } from 'rrule';
import {
  dateToInputDateTime,
  formatDateString,
  getRRuleDayConstants,
  secondsToDays,
  secondsToHHMMSS,
} from './dates';

const i18n = {
  _: (key) => {
    if (key.values) {
      Object.entries(key.values).forEach(([k, v]) => {
        key.id = key.id.replace(new RegExp(`\\{${k}\\}`), v);
      });
    }
    return key.id;
  },
};

describe('formatDateString', () => {
  test('it returns the expected value', () => {
    expect(formatDateString(null)).toEqual(null);
    expect(formatDateString('')).toEqual('Invalid DateTime');
    expect(formatDateString({})).toEqual('Invalid DateTime');
    expect(formatDateString(undefined)).toEqual('Invalid DateTime');
    expect(formatDateString('foobar')).toEqual('Invalid DateTime');
    expect(formatDateString('2018-011-31T01:14:52.969227Z', undefined)).toEqual(
      'Invalid DateTime'
    );
    expect(formatDateString('2018-01-31T01:14:52.969227Z')).toEqual(
      '1/31/2018, 1:14:52 AM'
    );
    expect(
      formatDateString('2018-01-31T01:14:52.969227Z', 'America/Los_Angeles')
    ).toEqual('1/30/2018, 5:14:52 PM');
  });
});

describe('secondsToDays', () => {
  test('it returns the expected value', () => {
    expect(secondsToDays(604800)).toEqual('7');
    expect(secondsToDays(0)).toEqual('0');
  });
});

describe('secondsToHHMMSS', () => {
  test('it returns the expected value', () => {
    expect(secondsToHHMMSS(50000)).toEqual('13:53:20');
  });
});

describe('dateToInputDateTime', () => {
  test('it returns the expected value', () => {
    expect(dateToInputDateTime('2018-01-31T01:14:52.969227Z')).toEqual([
      '2018-01-31',
      '1:14 AM',
    ]);
  });
});

describe('getRRuleDayConstants', () => {
  test('it returns the expected value', () => {
    expect(getRRuleDayConstants('monday')).toEqual(RRule.MO);
    expect(getRRuleDayConstants('tuesday')).toEqual(RRule.TU);
    expect(getRRuleDayConstants('wednesday')).toEqual(RRule.WE);
    expect(getRRuleDayConstants('thursday')).toEqual(RRule.TH);
    expect(getRRuleDayConstants('friday')).toEqual(RRule.FR);
    expect(getRRuleDayConstants('saturday')).toEqual(RRule.SA);
    expect(getRRuleDayConstants('sunday')).toEqual(RRule.SU);
    expect(getRRuleDayConstants('day')).toEqual([
      RRule.MO,
      RRule.TU,
      RRule.WE,
      RRule.TH,
      RRule.FR,
      RRule.SA,
      RRule.SU,
    ]);
    expect(getRRuleDayConstants('weekday')).toEqual([
      RRule.MO,
      RRule.TU,
      RRule.WE,
      RRule.TH,
      RRule.FR,
    ]);
    expect(getRRuleDayConstants('weekendDay')).toEqual([
      RRule.SA,
      RRule.SU,
    ]);
    expect(() => getRRuleDayConstants('foobar')).toThrow();
  });
});
