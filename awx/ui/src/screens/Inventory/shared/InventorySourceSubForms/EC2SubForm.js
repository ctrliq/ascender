import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import {
  OptionsField,
  SourceVarsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

const EC2SubForm = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [credentialField, credentialMeta] = useField('credential');
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
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        credentialTypeNamespace="aws"
        label={i18n._(msg`Credential`)}
        value={credentialField.value}
        onChange={handleCredentialUpdate}
      />
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField />
      <SourceVarsField
        popoverContent={helpText.sourceVars(docsBaseUrl, 'ec2')}
      />
    </>
  );
};

export default EC2SubForm;
