import type { Untyped } from 'types/api';
import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';

import { useLingui } from '@lingui/react/macro';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import { required } from 'util/validators';
import {
  OptionsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
  SourceVarsField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

export interface InsightsSubFormProps {
  autoPopulateCredential: Untyped;
  [key: string]: unknown;
}

const InsightsSubForm = ({ autoPopulateCredential }: InsightsSubFormProps) => {
  const { t } = useLingui();
  const helpText = getHelpText();
  const { setFieldValue, setFieldTouched } = useFormikContext<Untyped>();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const config = useConfig();
  const handleCredentialUpdate = useCallback(
    (value: Untyped) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );
  const docsBaseUrl = getDocsBaseUrl(config);

  return (
    <>
      <CredentialLookup
        credentialTypeNamespace="insights"
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
        popoverContent={helpText.sourceVars(docsBaseUrl, 'insights')}
      />
    </>
  );
};

export default InsightsSubForm;
