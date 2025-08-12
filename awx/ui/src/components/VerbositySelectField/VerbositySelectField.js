import React from 'react';
import { useLingui } from '@lingui/react/macro';
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
  const { t } = useLingui();

  const getVerbosityOptions = () => ({
    0: t`0 (Normal)`,
    1: t`1 (Verbose)`,
    2: t`2 (More Verbose)`,
    3: t`3 (Debug)`,
    4: t`4 (Connection Debug)`,
    5: t`5 (WinRM Debug)`,
  });

  const VERBOSE_OPTIONS = Object.entries(getVerbosityOptions()).map(([k, v]) => ({
    key: `${k}`,
    value: `${k}`,
    label: v,
  }));
  const [verbosityField, , verbosityHelpers] = useField('verbosity');
  return promptId ? (
    <FieldWithPrompt
      fieldId={fieldId}
      label={t`Verbosity`}
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
      label={t`Verbosity`}
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

export function VERBOSITY(t) {
  return {
    0: t ? t`0 (Normal)` : '0 (Normal)',
    1: t ? t`1 (Verbose)` : '1 (Verbose)',
    2: t ? t`2 (More Verbose)` : '2 (More Verbose)',
    3: t ? t`3 (Debug)` : '3 (Debug)',
    4: t ? t`4 (Connection Debug)` : '4 (Connection Debug)',
    5: t ? t`5 (WinRM Debug)` : '5 (WinRM Debug)',
  };
}

export default VerbositySelectField;
