import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Form } from '@patternfly/react-core';
import { useField } from 'formik';
import {
  required,
  minMaxValue,
  integer,
  combine,
} from '../../../../../util/validators';
import FormField from '../../../../../components/FormField';

function DaysToKeepStep() {
  const { i18n } = useLingui();
  const [, meta] = useField('daysToKeep');
  const validators = [required(null), minMaxValue(0), integer()];
  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FormField
        name="daysToKeep"
        id="days-to-keep"
        isRequired
        validate={combine(validators)}
        validated={!(meta.touched && meta.error) ? 'default' : 'error'}
        label={i18n._(t`Days of data to be retained`)}
      />
    </Form>
  );
}

export default DaysToKeepStep;
