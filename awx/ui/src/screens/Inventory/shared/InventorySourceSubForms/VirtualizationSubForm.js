import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
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

const VirtualizationSubForm = ({ autoPopulateCredential }) => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const config = useConfig();

  const handleCredentialUpdate = useCallback(
    (value) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const docsBaseUrl = getDocsBaseUrl(config);
  return (
    <>
      <CredentialLookup
        credentialTypeNamespace="rhv"
        label={i18n._(msg`Credential`)}
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched()}
        onChange={handleCredentialUpdate}
        value={credentialField.value}
        required
        autoPopulate={autoPopulateCredential}
        validate={required(i18n._(msg`Select a value for this field`))}
      />
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField />
      <SourceVarsField
        popoverContent={helpText.sourceVars(docsBaseUrl, 'rhv')}
      />
    </>
  );
};

export default VirtualizationSubForm;
