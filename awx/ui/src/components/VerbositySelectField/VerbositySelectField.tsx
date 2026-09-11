import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { msg } from '@lingui/core/macro';
import { useField } from 'formik';
import { FormGroup } from '@patternfly/react-core';
import Popover from 'components/Popover';
import AnsibleSelect from 'components/AnsibleSelect';
import FieldWithPrompt from 'components/FieldWithPrompt';

export const VERBOSITY = {
  0: msg`0 (Normal)`,
  1: msg`1 (Verbose)`,
  2: msg`2 (More Verbose)`,
  3: msg`3 (Debug)`,
  4: msg`4 (Connection Debug)`,
  5: msg`5 (WinRM Debug)`,
};

export function getVerbosityLabel(verbosity: unknown, i18n: Untyped) {
  return VERBOSITY[verbosity] ? i18n._(VERBOSITY[verbosity]) : undefined;
}

export interface VerbositySelectFieldProps {
  fieldId: number | string;
  promptId?: number | string;
  promptName?: Untyped;
  tooltip: Untyped;
  [key: string]: unknown;
}

function VerbositySelectField({
  fieldId,
  promptId,
  promptName,
  tooltip,
}: VerbositySelectFieldProps) {
  const { t, i18n } = useLingui();

  const VERBOSE_OPTIONS = Object.entries(VERBOSITY).map(([k, descriptor]) => ({
    key: k,
    value: k,
    label: i18n._(descriptor),
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
      label={t`Verbosity`}
      labelHelp={<Popover content={tooltip} />}
    >
      <AnsibleSelect
        id={fieldId}
        data={VERBOSE_OPTIONS}
        {...verbosityField}
        onChange={(event: React.SyntheticEvent, value: unknown) =>
          verbosityHelpers.setValue(value)
        }
      />
    </FormGroup>
  );
}

export default VerbositySelectField;
