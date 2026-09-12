import type { SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import { required } from 'util/validators';
import {
  OptionsField,
  SourceVarsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

export interface SatelliteSubFormProps {
  autoPopulateCredential?: boolean;
  [key: string]: unknown;
}

const SatelliteSubForm = ({
  autoPopulateCredential,
}: SatelliteSubFormProps) => {
  const { t } = useLingui();
  const helpText = getHelpText();
  const config = useConfig();
  // Called rather than passed: the import named the module's default export,
  // which is the function, so the popover's link was the function itself.
  const docsBaseUrl = getDocsBaseUrl(config);
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const handleCredentialUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <CredentialLookup
        credentialTypeNamespace="satellite6"
        label={t`Credential`}
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched(true)}
        onChange={handleCredentialUpdate}
        value={credentialField.value}
        required
        autoPopulate={autoPopulateCredential}
        validate={required(t`Select a value for this field`)}
      />
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField />
      <SourceVarsField
        popoverContent={helpText.sourceVars(docsBaseUrl, 'satellite6')}
      />
    </>
  );
};

export default SatelliteSubForm;
