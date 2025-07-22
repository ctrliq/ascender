import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useField } from 'formik';
import {
  DatePicker,
  isValidDate,
  yyyyMMddFormat,
  TimePicker,
  FormGroup,
} from '@patternfly/react-core';
import styled from 'styled-components';
import { required, validateTime, combine } from 'util/validators';

const DateTimeGroup = styled.span`
  display: flex;
`;
function DateTimePicker({ dateFieldName, timeFieldName, label }) {
  const { i18n } = useLingui();
  const [dateField, dateMeta, dateHelpers] = useField({
    name: dateFieldName,
    validate: combine([required(null), isValidDate]),
  });
  const [timeField, timeMeta, timeHelpers] = useField({
    name: timeFieldName,
    validate: combine([required(null), validateTime()]),
  });

  const onDateChange = (_, dateString, date) => {
    dateHelpers.setTouched();
    if (isValidDate(date) && dateString === yyyyMMddFormat(date)) {
      dateHelpers.setValue(dateString);
    }
  };

  return (
    <FormGroup
      fieldId={`schedule-${label}`}
      data-cy={`schedule-${label}`}
      helperTextInvalid={dateMeta.error || timeMeta.error}
      isRequired
      validated={
        (!dateMeta.touched || !dateMeta.error) &&
        (!timeMeta.touched || !timeMeta.error)
          ? 'default'
          : 'error'
      }
      label={label}
    >
      <DateTimeGroup>
        <DatePicker
          aria-label={
            dateFieldName.startsWith('start')
              ? i18n._(msg`Start date`)
              : i18n._(msg`End date`)
          }
          {...dateField}
          value={dateField.value.split('T')[0]}
          onChange={onDateChange}
        />
        <TimePicker
          placeholder="hh:mm AM/PM"
          stepMinutes={15}
          aria-label={
            timeFieldName.startsWith('start')
              ? i18n._(msg`Start time`)
              : i18n._(msg`End time`)
          }
          time={timeField.value}
          {...timeField}
          onChange={(_, time) => timeHelpers.setValue(time)}
        />
      </DateTimeGroup>
    </FormGroup>
  );
}

export default DateTimePicker;
