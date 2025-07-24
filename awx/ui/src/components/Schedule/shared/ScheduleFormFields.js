import React, { useState } from 'react';
import { useField } from 'formik';
import { FormGroup, Title } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import styled from 'styled-components';
import 'styled-components/macro';
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

const SelectClearOption = styled(SelectOption)`
  & > input[type='checkbox'] {
    display: none;
  }
`;

export default function ScheduleFormFields({
  hasDaysToKeepField,
  zoneOptions,
  zoneLinks,
}) {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const [timezone, timezoneMeta] = useField({
    name: 'timezone',
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  const [frequency, frequencyMeta, frequencyHelper] = useField({
    name: 'frequency',
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  const [timezoneMessage, setTimezoneMessage] = useState('');
  const warnLinkedTZ = (event, selectedValue) => {
    if (zoneLinks[selectedValue]) {
      setTimezoneMessage(
        i18n._(
          msg`Warning: {selectedValue} is a link to {link} and will be saved as that.`,
          {
            selectedValue,
            link: zoneLinks[selectedValue],
          }
        )
      );
    } else {
      setTimezoneMessage('');
    }
    timezone.onChange(event, selectedValue);
  };
  let timezoneValidatedStatus = 'default';
  if (timezoneMeta.touched && timezoneMeta.error) {
    timezoneValidatedStatus = 'error';
  } else if (timezoneMessage) {
    timezoneValidatedStatus = 'warning';
  }
  const config = useConfig();

  const [exceptionFrequency, exceptionFrequencyMeta, exceptionFrequencyHelper] =
    useField({
      name: 'exceptionFrequency',
      validate: required(i18n._(msg`Select a value for this field`)),
    });

  const updateFrequency = (setFrequency) => (values) => {
    setFrequency(values.sort(sortFrequencies));
  };

  return (
    <>
      <FormField
        id="schedule-name"
        label={i18n._(msg`Name`)}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="schedule-description"
        label={i18n._(msg`Description`)}
        name="description"
        type="text"
      />
      <DateTimePicker
        dateFieldName="startDate"
        timeFieldName="startTime"
        label={i18n._(msg`Start date/time`)}
      />
      <FormGroup
        name="timezone"
        fieldId="schedule-timezone"
        helperTextInvalid={timezoneMeta.error || timezoneMessage}
        isRequired
        validated={timezoneValidatedStatus}
        label={i18n._(msg`Local time zone`)}
        helperText={timezoneMessage}
        labelIcon={<Popover content={helpText.localTimeZone(config)} />}
      >
        <AnsibleSelect
          id="schedule-timezone"
          data={zoneOptions}
          {...timezone}
          onChange={warnLinkedTZ}
        />
      </FormGroup>
      <FormGroup
        name="frequency"
        fieldId="schedule-frequency"
        helperTextInvalid={frequencyMeta.error}
        validated={
          !frequencyMeta.touched || !frequencyMeta.error ? 'default' : 'error'
        }
        label={i18n._(msg`Repeat frequency`)}
      >
        <FrequencySelect
          id="schedule-frequency"
          onChange={updateFrequency(frequencyHelper.setValue)}
          value={frequency.value}
          placeholderText={
            frequency.value.length
              ? i18n._(msg`Select frequency`)
              : i18n._(msg`None (run once)`)
          }
          onBlur={frequencyHelper.setTouched}
        >
          <SelectClearOption value="none">
            {i18n._(msg`None (run once)`)}
          </SelectClearOption>
          <SelectOption value="minute">{i18n._(msg`Minute`)}</SelectOption>
          <SelectOption value="hour">{i18n._(msg`Hour`)}</SelectOption>
          <SelectOption value="day">{i18n._(msg`Day`)}</SelectOption>
          <SelectOption value="week">{i18n._(msg`Week`)}</SelectOption>
          <SelectOption value="month">{i18n._(msg`Month`)}</SelectOption>
          <SelectOption value="year">{i18n._(msg`Year`)}</SelectOption>
        </FrequencySelect>
      </FormGroup>
      {hasDaysToKeepField ? (
        <FormField
          id="schedule-days-to-keep"
          label={i18n._(msg`Days of Data to Keep`)}
          name="daysToKeep"
          type="number"
          validate={required(null)}
          isRequired
        />
      ) : null}
      {frequency.value.length ? (
        <SubFormLayout>
          <Title size="md" headingLevel="h4">
            {i18n._(msg`Frequency Details`)}
          </Title>
          {frequency.value.map((val) => (
            <FormColumnLayout key={val} stacked>
              <FrequencyDetailSubform
                frequency={val}
                prefix={`frequencyOptions.${val}`}
              />
            </FormColumnLayout>
          ))}
          <Title
            size="md"
            headingLevel="h4"
            css="margin-top: var(--pf-c-card--child--PaddingRight)"
          >
            {i18n._(msg`Exceptions`)}
          </Title>
          <FormColumnLayout stacked>
            <FormGroup
              name="exceptions"
              fieldId="exception-frequency"
              helperTextInvalid={exceptionFrequencyMeta.error}
              validated={
                !exceptionFrequencyMeta.touched || !exceptionFrequencyMeta.error
                  ? 'default'
                  : 'error'
              }
              label={i18n._(msg`Add exceptions`)}
            >
              <FrequencySelect
                id="exception-frequency"
                onChange={updateFrequency(exceptionFrequencyHelper.setValue)}
                value={exceptionFrequency.value}
                placeholderText={
                  exceptionFrequency.value.length
                    ? i18n._(msg`Select frequency`)
                    : i18n._(msg`None`)
                }
                onBlur={exceptionFrequencyHelper.setTouched}
              >
                <SelectClearOption value="none">
                  {i18n._(msg`None`)}
                </SelectClearOption>
                <SelectOption value="minute">
                  {i18n._(msg`Minute`)}
                </SelectOption>
                <SelectOption value="hour">{i18n._(msg`Hour`)}</SelectOption>
                <SelectOption value="day">{i18n._(msg`Day`)}</SelectOption>
                <SelectOption value="week">{i18n._(msg`Week`)}</SelectOption>
                <SelectOption value="month">{i18n._(msg`Month`)}</SelectOption>
                <SelectOption value="year">{i18n._(msg`Year`)}</SelectOption>
              </FrequencySelect>
            </FormGroup>
          </FormColumnLayout>
          {exceptionFrequency.value.map((val) => (
            <FormColumnLayout key={val} stacked>
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
