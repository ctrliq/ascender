import 'styled-components/macro';
import React from 'react';
import styled from 'styled-components';
import { useField } from 'formik';

import { msg, Trans, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { RRule } from 'rrule';
import {
  Checkbox as _Checkbox,
  FormGroup,
  Radio,
  TextInput,
} from '@patternfly/react-core';
import { required, requiredPositiveInteger } from 'util/validators';
import AnsibleSelect from '../../AnsibleSelect';
import FormField from '../../FormField';
import DateTimePicker from './DateTimePicker';

const RunOnRadio = styled(Radio)`
  display: flex;
  align-items: center;

  label {
    display: block;
    width: 100%;
  }

  :not(:last-of-type) {
    margin-bottom: 10px;
  }

  select:not(:first-of-type) {
    margin-left: 10px;
  }
`;

const RunEveryLabel = styled.p`
  display: flex;
  align-items: center;
`;

const Checkbox = styled(_Checkbox)`
  :not(:last-of-type) {
    margin-right: 10px;
  }
`;

const FrequencyDetailSubform = ({ frequency, prefix, isException }) => {
  const { i18n } = useLingui();
  const id = prefix.replace('.', '-');
  const [runOnDayMonth] = useField({
    name: `${prefix}.runOnDayMonth`,
  });
  const [runOnDayNumber] = useField({
    name: `${prefix}.runOnDayNumber`,
  });
  const [runOnTheOccurrence] = useField({
    name: `${prefix}.runOnTheOccurrence`,
  });
  const [runOnTheDay] = useField({
    name: `${prefix}.runOnTheDay`,
  });
  const [runOnTheMonth] = useField({
    name: `${prefix}.runOnTheMonth`,
  });
  const [startDate] = useField(`${prefix}.startDate`);

  const [daysOfWeek, daysOfWeekMeta, daysOfWeekHelpers] = useField({
    name: `${prefix}.daysOfWeek`,
    validate: (val) => {
      if (frequency === 'week') {
        return required(i18n._(msg`Select a value for this field`))(
          val?.length > 0
        );
      }
      return undefined;
    },
  });
  const [end, endMeta] = useField({
    name: `${prefix}.end`,
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  const [interval, intervalMeta] = useField({
    name: `${prefix}.interval`,
    validate: requiredPositiveInteger(),
  });
  const [runOn, runOnMeta] = useField({
    name: `${prefix}.runOn`,
    validate: (val) => {
      if (frequency === 'month' || frequency === 'year') {
        return required(i18n._(msg`Select a value for this field`))(val);
      }
      return undefined;
    },
  });

  const monthOptions = [
    {
      key: 'january',
      value: 1,
      label: i18n._(msg`January`),
    },
    {
      key: 'february',
      value: 2,
      label: i18n._(msg`February`),
    },
    {
      key: 'march',
      value: 3,
      label: i18n._(msg`March`),
    },
    {
      key: 'april',
      value: 4,
      label: i18n._(msg`April`),
    },
    {
      key: 'may',
      value: 5,
      label: i18n._(msg`May`),
    },
    {
      key: 'june',
      value: 6,
      label: i18n._(msg`June`),
    },
    {
      key: 'july',
      value: 7,
      label: i18n._(msg`July`),
    },
    {
      key: 'august',
      value: 8,
      label: i18n._(msg`August`),
    },
    {
      key: 'september',
      value: 9,
      label: i18n._(msg`September`),
    },
    {
      key: 'october',
      value: 10,
      label: i18n._(msg`October`),
    },
    {
      key: 'november',
      value: 11,
      label: i18n._(msg`November`),
    },
    {
      key: 'december',
      value: 12,
      label: i18n._(msg`December`),
    },
  ];

  const updateDaysOfWeek = (day, checked) => {
    const newDaysOfWeek = daysOfWeek.value ? [...daysOfWeek.value] : [];
    daysOfWeekHelpers.setTouched(true);
    if (checked) {
      newDaysOfWeek.push(day);
      daysOfWeekHelpers.setValue(newDaysOfWeek);
    } else {
      daysOfWeekHelpers.setValue(
        newDaysOfWeek.filter((selectedDay) => selectedDay !== day)
      );
    }
  };

  const getPeriodLabel = () => {
    switch (frequency) {
      case 'minute':
        return i18n._(msg`Minute`);
      case 'hour':
        return i18n._(msg`Hour`);
      case 'day':
        return i18n._(msg`Day`);
      case 'week':
        return i18n._(msg`Week`);
      case 'month':
        return i18n._(msg`Month`);
      case 'year':
        return i18n._(msg`Year`);
      default:
        throw new Error(i18n._(msg`Frequency did not match an expected value`));
    }
  };

  const getRunEveryLabel = () => {
    const intervalValue = interval.value;

    switch (frequency) {
      case 'minute':
        return <Plural value={intervalValue} one="minute" other="minutes" />;
      case 'hour':
        return <Plural value={intervalValue} one="hour" other="hours" />;
      case 'day':
        return <Plural value={intervalValue} one="day" other="days" />;
      case 'week':
        return <Plural value={intervalValue} one="week" other="weeks" />;
      case 'month':
        return <Plural value={intervalValue} one="month" other="months" />;
      case 'year':
        return <Plural value={intervalValue} one="year" other="years" />;
      default:
        throw new Error(i18n._(msg`Frequency did not match an expected value`));
    }
  };

  return (
    <>
      <p css="grid-column: 1/-1">
        <b>{getPeriodLabel()}</b>
      </p>
      <FormGroup
        name={`${prefix}.interval`}
        fieldId={`schedule-run-every-${id}`}
        helperTextInvalid={intervalMeta.error}
        isRequired
        validated={
          !intervalMeta.touched || !intervalMeta.error ? 'default' : 'error'
        }
        label={isException ? i18n._(msg`Skip every`) : i18n._(msg`Run every`)}
      >
        <div css="display: flex">
          <TextInput
            css="margin-right: 10px;"
            id={`schedule-run-every-${id}`}
            type="number"
            min="1"
            step="1"
            {...interval}
            onChange={(value, event) => {
              interval.onChange(event);
            }}
          />
          <RunEveryLabel>{getRunEveryLabel()}</RunEveryLabel>
        </div>
      </FormGroup>
      {frequency === 'week' && (
        <FormGroup
          name={`${prefix}.daysOfWeek`}
          fieldId={`schedule-days-of-week-${id}`}
          helperTextInvalid={daysOfWeekMeta.error}
          isRequired
          validated={
            !daysOfWeekMeta.touched || !daysOfWeekMeta.error
              ? 'default'
              : 'error'
          }
          label={i18n._(msg`On days`)}
        >
          <div css="display: flex">
            <Checkbox
              label={i18n._(msg`Sun`)}
              isChecked={daysOfWeek.value?.includes(RRule.SU)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.SU, checked);
              }}
              aria-label={i18n._(msg`Sunday`)}
              id={`schedule-days-of-week-sun-${id}`}
              ouiaId={`schedule-days-of-week-sun-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Mon`)}
              isChecked={daysOfWeek.value?.includes(RRule.MO)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.MO, checked);
              }}
              aria-label={i18n._(msg`Monday`)}
              id={`schedule-days-of-week-mon-${id}`}
              ouiaId={`schedule-days-of-week-mon-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Tue`)}
              isChecked={daysOfWeek.value?.includes(RRule.TU)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.TU, checked);
              }}
              aria-label={i18n._(msg`Tuesday`)}
              id={`schedule-days-of-week-tue-${id}`}
              ouiaId={`schedule-days-of-week-tue-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Wed`)}
              isChecked={daysOfWeek.value?.includes(RRule.WE)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.WE, checked);
              }}
              aria-label={i18n._(msg`Wednesday`)}
              id={`schedule-days-of-week-wed-${id}`}
              ouiaId={`schedule-days-of-week-wed-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Thu`)}
              isChecked={daysOfWeek.value?.includes(RRule.TH)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.TH, checked);
              }}
              aria-label={i18n._(msg`Thursday`)}
              id={`schedule-days-of-week-thu-${id}`}
              ouiaId={`schedule-days-of-week-thu-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Fri`)}
              isChecked={daysOfWeek.value?.includes(RRule.FR)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.FR, checked);
              }}
              aria-label={i18n._(msg`Friday`)}
              id={`schedule-days-of-week-fri-${id}`}
              ouiaId={`schedule-days-of-week-fri-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
            <Checkbox
              label={i18n._(msg`Sat`)}
              isChecked={daysOfWeek.value?.includes(RRule.SA)}
              onChange={(checked) => {
                updateDaysOfWeek(RRule.SA, checked);
              }}
              aria-label={i18n._(msg`Saturday`)}
              id={`schedule-days-of-week-sat-${id}`}
              ouiaId={`schedule-days-of-week-sat-${id}`}
              name={`${prefix}.daysOfWeek`}
            />
          </div>
        </FormGroup>
      )}
      {(frequency === 'month' || frequency === 'year') &&
        !Number.isNaN(new Date(startDate.value)) && (
          <FormGroup
            name={`${prefix}.runOn`}
            fieldId={`schedule-run-on-${id}`}
            helperTextInvalid={runOnMeta.error}
            isRequired
            validated={
              !runOnMeta.touched || !runOnMeta.error ? 'default' : 'error'
            }
            label={i18n._(msg`Run on`)}
          >
            <RunOnRadio
              id={`schedule-run-on-day-${id}`}
              name={`${prefix}.runOn`}
              label={
                <div css="display: flex;align-items: center;">
                  {frequency === 'month' && (
                    <span
                      id="radio-schedule-run-on-day"
                      css="margin-right: 10px;"
                    >
                      <Trans>Day</Trans>
                    </span>
                  )}
                  {frequency === 'year' && (
                    <AnsibleSelect
                      id={`schedule-run-on-day-month-${id}`}
                      css="margin-right: 10px"
                      isDisabled={runOn.value !== 'day'}
                      data={monthOptions}
                      {...runOnDayMonth}
                    />
                  )}
                  <TextInput
                    id={`schedule-run-on-day-number-${id}`}
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    isDisabled={runOn.value !== 'day'}
                    {...runOnDayNumber}
                    onChange={(value, event) => {
                      runOnDayNumber.onChange(event);
                    }}
                  />
                </div>
              }
              value="day"
              isChecked={runOn.value === 'day'}
              onChange={(value, event) => {
                event.target.value = 'day';
                runOn.onChange(event);
              }}
            />
            <RunOnRadio
              id={`schedule-run-on-the-${id}`}
              name={`${prefix}.runOn`}
              label={
                <div css="display: flex;align-items: center;">
                  <span
                    id={`radio-schedule-run-on-the-${id}`}
                    css="margin-right: 10px;"
                  >
                    <Trans>The</Trans>
                  </span>
                  <AnsibleSelect
                    id={`schedule-run-on-the-occurrence-${id}`}
                    isDisabled={runOn.value !== 'the'}
                    data={[
                      { value: 1, key: 'first', label: i18n._(msg`First`) },
                      {
                        value: 2,
                        key: 'second',
                        label: i18n._(msg`Second`),
                      },
                      { value: 3, key: 'third', label: i18n._(msg`Third`) },
                      {
                        value: 4,
                        key: 'fourth',
                        label: i18n._(msg`Fourth`),
                      },
                      { value: 5, key: 'fifth', label: i18n._(msg`Fifth`) },
                      { value: -1, key: 'last', label: i18n._(msg`Last`) },
                    ]}
                    {...runOnTheOccurrence}
                  />
                  <AnsibleSelect
                    id={`schedule-run-on-the-day-${id}`}
                    isDisabled={runOn.value !== 'the'}
                    data={[
                      {
                        value: 'sunday',
                        key: 'sunday',
                        label: i18n._(msg`Sunday`),
                      },
                      {
                        value: 'monday',
                        key: 'monday',
                        label: i18n._(msg`Monday`),
                      },
                      {
                        value: 'tuesday',
                        key: 'tuesday',
                        label: i18n._(msg`Tuesday`),
                      },
                      {
                        value: 'wednesday',
                        key: 'wednesday',
                        label: i18n._(msg`Wednesday`),
                      },
                      {
                        value: 'thursday',
                        key: 'thursday',
                        label: i18n._(msg`Thursday`),
                      },
                      {
                        value: 'friday',
                        key: 'friday',
                        label: i18n._(msg`Friday`),
                      },
                      {
                        value: 'saturday',
                        key: 'saturday',
                        label: i18n._(msg`Saturday`),
                      },
                      { value: 'day', key: 'day', label: i18n._(msg`Day`) },
                      {
                        value: 'weekday',
                        key: 'weekday',
                        label: i18n._(msg`Weekday`),
                      },
                      {
                        value: 'weekendDay',
                        key: 'weekendDay',
                        label: i18n._(msg`Weekend day`),
                      },
                    ]}
                    {...runOnTheDay}
                  />
                  {frequency === 'year' && (
                    <>
                      <span
                        id={`of-schedule-run-on-the-month-${id}`}
                        css="margin-left: 10px;"
                      >
                        <Trans>of</Trans>
                      </span>
                      <AnsibleSelect
                        id={`schedule-run-on-the-month-${id}`}
                        isDisabled={runOn.value !== 'the'}
                        data={monthOptions}
                        {...runOnTheMonth}
                      />
                    </>
                  )}
                </div>
              }
              value="the"
              isChecked={runOn.value === 'the'}
              onChange={(value, event) => {
                event.target.value = 'the';
                runOn.onChange(event);
              }}
            />
          </FormGroup>
        )}
      <FormGroup
        name={`${prefix}.end`}
        fieldId={`schedule-end-${id}`}
        helperTextInvalid={endMeta.error}
        isRequired
        validated={!endMeta.touched || !endMeta.error ? 'default' : 'error'}
        label={i18n._(msg`End`)}
      >
        <Radio
          id={`end-never-${id}`}
          name={`${prefix}.end`}
          label={i18n._(msg`Never`)}
          value="never"
          isChecked={end.value === 'never'}
          onChange={(value, event) => {
            event.target.value = 'never';
            end.onChange(event);
          }}
          ouiaId={`end-never-radio-button-${id}`}
        />
        <Radio
          id={`end-after-${id}`}
          name={`${prefix}.end`}
          label={i18n._(msg`After number of occurrences`)}
          value="after"
          isChecked={end.value === 'after'}
          onChange={(value, event) => {
            event.target.value = 'after';
            end.onChange(event);
          }}
          ouiaId={`end-after-radio-button-${id}`}
        />
        <Radio
          id={`end-on-date-${id}`}
          name={`${prefix}.end`}
          label={i18n._(msg`On date`)}
          value="onDate"
          isChecked={end.value === 'onDate'}
          onChange={(value, event) => {
            event.target.value = 'onDate';
            end.onChange(event);
          }}
          ouiaId={`end-on-radio-button-${id}`}
        />
      </FormGroup>
      {end?.value === 'after' && (
        <FormField
          id={`schedule-occurrences-${id}`}
          label={i18n._(msg`Occurrences`)}
          name={`${prefix}.occurrences`}
          type="number"
          min="1"
          step="1"
          isRequired
        />
      )}
      {end?.value === 'onDate' && (
        <DateTimePicker
          dateFieldName={`${prefix}.endDate`}
          timeFieldName={`${prefix}.endTime`}
          label={i18n._(msg`End date/time`)}
        />
      )}
    </>
  );
};

export default FrequencyDetailSubform;
