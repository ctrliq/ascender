import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'components/Form';
import {
  DatePicker,
  isValidDate,
  yyyyMMddFormat,
  TimePicker,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { required, validateDate, validateTime, combine } from 'util/validators';
import './DateTimePicker.css';

export interface DateTimePickerProps {
  /** Formik field names, which the picker binds its two inputs to. */
  dateFieldName: string;
  timeFieldName: string;
  label: React.ReactNode;
  [key: string]: unknown;
}

function DateTimePicker({
  dateFieldName,
  timeFieldName,
  label,
}: DateTimePickerProps) {
  const { t } = useLingui();
  const [dateField, dateMeta, dateHelpers] = useField({
    name: dateFieldName,
    validate: combine<string>([required(null), validateDate()]),
  });
  const [timeField, timeMeta, timeHelpers] = useField({
    name: timeFieldName,
    validate: combine([required(null), validateTime()]),
  });

  const onDateChange = (_: unknown, dateString: string, date?: Date) => {
    dateHelpers.setTouched(true);
    if (date && isValidDate(date) && dateString === yyyyMMddFormat(date)) {
      dateHelpers.setValue(dateString);
    }
  };

  /* Built from the field it binds rather than from the label, which is
     translated and may hold spaces or slashes, so the id stays the same in
     every language and the label points at the date input it names. */
  const fieldId = `schedule-${dateFieldName.replace(/[^A-Za-z0-9_-]/g, '-')}`;

  return (
    <FormGroup fieldId={fieldId} data-cy={fieldId} isRequired label={label}>
      <span className="ascender-date-time-picker__group">
        <DatePicker
          aria-label={
            dateFieldName.startsWith('start') ? t`Start Date` : t`End Date`
          }
          {...dateField}
          inputProps={{ id: fieldId }}
          value={dateField.value.split('T')[0]}
          onChange={onDateChange}
        />
        <TimePicker
          placeholder="hh:mm AM/PM"
          stepMinutes={15}
          aria-label={
            timeFieldName.startsWith('start') ? t`Start Time` : t`End Time`
          }
          time={timeField.value}
          {...timeField}
          onChange={(_, time) => timeHelpers.setValue(time)}
        />
      </span>
      {dateMeta.touched && dateMeta.error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{dateMeta.error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
      {timeMeta.touched && timeMeta.error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{timeMeta.error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export default DateTimePicker;
