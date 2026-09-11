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

/**
 * The label for one of the six verbosity levels, translated.
 *
 * Args:
 *   verbosity: the level the job or template is set to, 0 through 5.
 *   i18n: the lingui instance the caller already has.
 *
 * Returns:
 *   The level's label, or undefined for a level outside the six.
 */
export function getVerbosityLabel(
  verbosity: number | undefined,
  i18n: Untyped
) {
  const key = verbosity as keyof typeof VERBOSITY;
  return VERBOSITY[key] ? i18n._(VERBOSITY[key]) : undefined;
}

export interface VerbositySelectFieldProps {
  fieldId: string;
  promptId?: string;
  promptName?: string;
  tooltip: React.ReactNode;
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
      promptName={promptName as string}
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
