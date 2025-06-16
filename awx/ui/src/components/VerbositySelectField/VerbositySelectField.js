import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useField } from 'formik';
import { FormGroup } from '@patternfly/react-core';
import Popover from 'components/Popover';
import AnsibleSelect from 'components/AnsibleSelect';
import FieldWithPrompt from 'components/FieldWithPrompt';

function VerbositySelectField({
  fieldId,
  promptId,
  promptName,
  tooltip,
  isValid,
}) {
  const { i18n } = useLingui();
  const VERBOSE_OPTIONS = Object.entries(VERBOSITY(i18n)).map(([k, v]) => ({
    key: `${k}`,
    value: `${k}`,
    label: v,
  }));
  const [verbosityField, , verbosityHelpers] = useField('verbosity');
  return promptId ? (
    <FieldWithPrompt
      fieldId={fieldId}
      label={i18n._(msg`Verbosity`)}
      promptId={promptId}
      promptName={promptName}
      tooltip={tooltip}
    >
      <AnsibleSelect id={fieldId} data={VERBOSE_OPTIONS} {...verbosityField} />
    </FieldWithPrompt>
  ) : (
    <FormGroup
      fieldId={fieldId}
      validated={isValid ? 'default' : 'error'}
      label={i18n._(msg`Verbosity`)}
      labelIcon={<Popover content={tooltip} />}
    >
      <AnsibleSelect
        id={fieldId}
        data={VERBOSE_OPTIONS}
        {...verbosityField}
        onChange={(event, value) => verbosityHelpers.setValue(value)}
      />
    </FormGroup>
  );
}

export function VERBOSITY(i18n) {
  return {
    0: i18n._(msg`0 (Normal)`),
    1: i18n._(msg`1 (Verbose)`),
    2: i18n._(msg`2 (More Verbose)`),
    3: i18n._(msg`3 (Debug)`),
    4: i18n._(msg`4 (Connection Debug)`),
    5: i18n._(msg`5 (WinRM Debug)`),
  };
}

export default VerbositySelectField;
