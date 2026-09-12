import type { TimeZones } from 'types/api';
import React, { useState } from 'react';
import { useField } from 'formik';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Title,
} from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import FormField from 'components/FormField';
import { required } from 'util/validators';
import { useConfig } from 'contexts/Config';
import Popover from '../../Popover';
import AnsibleSelect from '../../AnsibleSelect';
import FrequencySelect, { SelectOption } from './FrequencySelect';
import getHelpText from '../../../screens/Template/shared/JobTemplate.helptext';
import { SubFormLayout, FormColumnLayout } from '../../FormLayout';
import FrequencyDetailSubform from './FrequencyDetailSubform';
import DateTimePicker from './DateTimePicker';
import sortFrequencies from './sortFrequencies';
import type { ScheduleFrequency } from './types';

const SelectClearOption = styled(SelectOption)`
  & > input[type='checkbox'] {
    display: none;
  }
`;

export interface ScheduleFormFieldsProps {
  hasDaysToKeepField?: boolean;
  /** The zones the api offers, as the select's own value and label pairs. */
  zoneOptions: { value: string; key: string; label: string }[];
  /** The zones that are aliases, each naming the zone it stands for. */
  zoneLinks: TimeZones['links'];
  [key: string]: unknown;
}

export default function ScheduleFormFields({
  hasDaysToKeepField,
  zoneOptions,
  zoneLinks,
}: ScheduleFormFieldsProps) {
  const { t } = useLingui();
  const helpText = getHelpText();
  const [timezone, timezoneMeta] = useField({
    name: 'timezone',
    validate: required(t`Select a value for this field`),
  });
  const [frequency, frequencyMeta, frequencyHelper] = useField({
    name: 'frequency',
    validate: required(t`Select a value for this field`),
  });
  const [timezoneMessage, setTimezoneMessage] = useState('');
  const warnLinkedTZ = (event: React.SyntheticEvent, selectedValue: string) => {
    if (zoneLinks[selectedValue]) {
      setTimezoneMessage(
        t`Warning: ${selectedValue} is a link to ${zoneLinks[selectedValue]} and will be saved as that.`
      );
    } else {
      setTimezoneMessage('');
    }
    // AnsibleSelect hands both through; formik's own onChange takes the event.
    (timezone.onChange as (event: unknown, value: string) => void)(
      event,
      selectedValue
    );
  };
  let timezoneValidatedStatus: 'default' | 'error' | 'warning' = 'default';
  if (timezoneMeta.touched && timezoneMeta.error) {
    timezoneValidatedStatus = 'error';
  } else if (timezoneMessage) {
    timezoneValidatedStatus = 'warning';
  }
  const config = useConfig();

  const [exceptionFrequency, exceptionFrequencyMeta, exceptionFrequencyHelper] =
    useField({
      name: 'exceptionFrequency',
      validate: required(t`Select a value for this field`),
    });

  const updateFrequency =
    (setFrequency: (next: ScheduleFrequency[]) => void) =>
    (values: ScheduleFrequency[]) => {
      setFrequency(values.sort(sortFrequencies));
    };

  return (
    <>
      <FormField
        id="schedule-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="schedule-description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <DateTimePicker
        dateFieldName="startDate"
        timeFieldName="startTime"
        label={t`Start date/time`}
      />
      <FormGroup
        name="timezone"
        fieldId="schedule-timezone"
        isRequired
        label={t`Local time zone`}
        labelHelp={<Popover content={helpText.localTimeZone(config)} />}
      >
        <AnsibleSelect
          id="schedule-timezone"
          data={zoneOptions}
          {...timezone}
          onChange={warnLinkedTZ}
        />
        {(timezoneMessage || (timezoneMeta.touched && timezoneMeta.error)) && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={timezoneValidatedStatus}>
                {timezoneMeta.touched && timezoneMeta.error
                  ? timezoneMeta.error
                  : timezoneMessage}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup
        name="frequency"
        fieldId="schedule-frequency"
        label={t`Repeat frequency`}
      >
        <FrequencySelect
          id="schedule-frequency"
          onChange={updateFrequency(frequencyHelper.setValue)}
          value={frequency.value}
          placeholderText={
            frequency.value.length ? t`Select frequency` : t`None (run once)`
          }
          onBlur={frequencyHelper.setTouched}
        >
          <SelectClearOption value="none">
            {t`None (run once)`}
          </SelectClearOption>
          <SelectOption value="minute">{t`Minute`}</SelectOption>
          <SelectOption value="hour">{t`Hour`}</SelectOption>
          <SelectOption value="day">{t`Day`}</SelectOption>
          <SelectOption value="week">{t`Week`}</SelectOption>
          <SelectOption value="month">{t`Month`}</SelectOption>
          <SelectOption value="year">{t`Year`}</SelectOption>
        </FrequencySelect>
        {frequencyMeta.touched && frequencyMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {frequencyMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      {hasDaysToKeepField ? (
        <FormField
          id="schedule-days-to-keep"
          label={t`Days of Data to Keep`}
          name="daysToKeep"
          type="number"
          validate={required(null)}
          isRequired
        />
      ) : null}
      {frequency.value.length ? (
        <SubFormLayout>
          <Title size="md" headingLevel="h4">
            {t`Frequency Details`}
          </Title>
          {frequency.value.map((val: ScheduleFrequency) => (
            <FormColumnLayout key={val} $stacked>
              <FrequencyDetailSubform
                frequency={val}
                prefix={`frequencyOptions.${val}`}
              />
            </FormColumnLayout>
          ))}
          <Title
            size="md"
            headingLevel="h4"
            style={{ marginTop: 'var(--pf-v6-c-card--child--PaddingRight)' }}
          >
            {t`Exceptions`}
          </Title>
          <FormColumnLayout $stacked>
            <FormGroup
              name="exceptions"
              fieldId="exception-frequency"
              label={t`Add exceptions`}
            >
              <FrequencySelect
                id="exception-frequency"
                onChange={updateFrequency(exceptionFrequencyHelper.setValue)}
                value={exceptionFrequency.value}
                placeholderText={
                  exceptionFrequency.value.length
                    ? t`Select frequency`
                    : t`None`
                }
                onBlur={exceptionFrequencyHelper.setTouched}
              >
                <SelectClearOption value="none">{t`None`}</SelectClearOption>
                <SelectOption value="minute">{t`Minute`}</SelectOption>
                <SelectOption value="hour">{t`Hour`}</SelectOption>
                <SelectOption value="day">{t`Day`}</SelectOption>
                <SelectOption value="week">{t`Week`}</SelectOption>
                <SelectOption value="month">{t`Month`}</SelectOption>
                <SelectOption value="year">{t`Year`}</SelectOption>
              </FrequencySelect>
              {exceptionFrequencyMeta.touched &&
                exceptionFrequencyMeta.error && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {exceptionFrequencyMeta.error}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
            </FormGroup>
          </FormColumnLayout>
          {exceptionFrequency.value.map((val: ScheduleFrequency) => (
            <FormColumnLayout key={val} $stacked>
              <FrequencyDetailSubform
                frequency={val}
                prefix={`exceptionOptions.${val}`}
                isException
              />
            </FormColumnLayout>
          ))}
        </SubFormLayout>
      ) : null}
    </>
  );
}
